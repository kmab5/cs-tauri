//! The standalone builder, for development instances only.
//!
//! This drives `scripts/cs-export.mjs` — the same CLI, not a second
//! implementation — from inside the app, streaming its output back to the
//! window as it goes.
//!
//! It exists only in a development build, and that is enforced twice:
//!
//! 1. Every command here returns an error in a release build
//!    (`cfg(debug_assertions)`), so even a crafted `invoke` finds nothing.
//! 2. The interface that calls them is behind `import.meta.env.DEV`, so the
//!    production bundle does not contain the code at all — the strings are
//!    tree-shaken out, which `npm run test:webview` checks by searching the
//!    built bundle for them.
//!
//! The reason for the belt as well as the braces: this command spawns `node`
//! against a path derived from `CARGO_MANIFEST_DIR`, which only means anything
//! in a checkout. In a shipped app it would be a process spawn pointed at a
//! path that does not exist, and that is not a thing to leave lying around
//! whatever the interface does.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildRequest {
    /// The library game to ship.
    pub id: String,
    /// Where the artefacts land, relative to the repo or absolute.
    pub out: String,
    pub portable: bool,
    pub nsis: bool,
    pub msi: bool,
    pub icon: bool,
    pub skip_tests: bool,
    /// Overrides. Empty means "take it from the game".
    pub name: String,
    pub version: String,
    pub identifier: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DevInfo {
    /// False in a release build: the interface hides itself rather than
    /// offering a button that cannot work.
    pub available: bool,
    /// The checkout the builder would run in.
    pub repo: Option<String>,
    pub platform: String,
    /// NSIS and MSI are Windows-only formats and Tauri cannot cross-compile
    /// them, so the interface disables those toggles rather than letting the
    /// build fail ten minutes in.
    pub installers: bool,
}

#[tauri::command]
pub fn dev_info() -> DevInfo {
    #[cfg(not(debug_assertions))]
    {
        DevInfo {
            available: false,
            platform: std::env::consts::OS.to_string(),
            ..Default::default()
        }
    }
    #[cfg(debug_assertions)]
    {
        let repo = repo_root();
        DevInfo {
            available: repo.as_ref().map(|r| r.join("package.json").exists()).unwrap_or(false),
            repo: repo.map(|r| r.to_string_lossy().to_string()),
            platform: std::env::consts::OS.to_string(),
            installers: cfg!(target_os = "windows"),
        }
    }
}

#[cfg(debug_assertions)]
fn repo_root() -> Option<std::path::PathBuf> {
    /* src-tauri's parent. Correct by construction in a checkout, and meaningless
       anywhere else — which is the point of gating this on the build profile. */
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
}

#[tauri::command]
pub async fn build_standalone(app: AppHandle, request: BuildRequest) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, request);
        Err("the standalone builder is a development-only tool".to_string())
    }
    #[cfg(debug_assertions)]
    {
        run_build(app, request).await
    }
}

#[cfg(debug_assertions)]
async fn run_build(app: AppHandle, request: BuildRequest) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    let repo = repo_root().ok_or("no checkout to build in")?;
    let script = repo.join("scripts").join("cs-export.mjs");
    if !script.exists() {
        return Err(format!("{} is missing", script.display()));
    }
    if !request.portable && !request.nsis && !request.msi {
        return Err("nothing to build: choose portable, NSIS or MSI".into());
    }

    /* The game leaves the library as an archive first, because the CLI's input
       is an archive — the same one a reader would get from Export, minus the
       saves, which have no business being baked into a shipped app. */
    let staging = std::env::temp_dir().join(format!("cs-build-{}.cszip", request.id));
    let archive = crate::library::write_archive(&app, &request.id, Some(staging.clone()), false)?;
    let _ = app.emit("build-log", format!("staged {archive}"));

    let mut args: Vec<String> = vec![
        script.to_string_lossy().to_string(),
        "--game".into(),
        archive.clone(),
        "--out".into(),
        request.out.clone(),
    ];
    if request.portable {
        args.push("--portable".into());
    }
    if request.nsis {
        args.push("--nsis".into());
    }
    if request.msi {
        args.push("--msi".into());
    }
    if request.icon {
        args.push("--icon".into());
    }
    if request.skip_tests {
        args.push("--skip-tests".into());
    }
    for (flag, value) in [
        ("--name", &request.name),
        ("--version", &request.version),
        ("--identifier", &request.identifier),
    ] {
        if !value.trim().is_empty() {
            args.push(flag.into());
            args.push(value.trim().to_string());
        }
    }

    let _ = app.emit("build-log", format!("node {}", args.join(" ")));

    /* Spawned, not `output()`: a build takes minutes and a window showing
       nothing for minutes is indistinguishable from a hang. Both streams are
       merged in order and emitted line by line. */
    let mut child = Command::new("node")
        .args(&args)
        .current_dir(&repo)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run node: {e}"))?;

    for stream in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
    ] {
        if let Some(stream) = stream {
            let app = app.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    let _ = app.emit("build-log", line);
                }
            });
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&staging);

    if status.success() {
        let _ = app.emit("build-done", true);
        Ok(())
    } else {
        let _ = app.emit("build-done", false);
        Err(format!(
            "the build exited with {}. The log above says where.",
            status.code().map(|c| c.to_string()).unwrap_or_else(|| "a signal".into())
        ))
    }
}
