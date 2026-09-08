//! Reading a ChoiceScript archive onto disk.
//!
//! This is the structural half of `src/lib/library.ts`: which files matter,
//! where the game actually starts, and what must never be written. The
//! ChoiceScript half — parsing `*scene_list`, `*achievement`, `*title` — stays
//! in TypeScript, which already gets it right. This module hands the front end
//! the raw `startup.txt` and lets it do that work.
//!
//! No Tauri types appear here on purpose, so the whole thing is testable with
//! plain `cargo test`.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Published games ship a complete copy of the OLD runtime. Keeping any of it
/// would let a game shadow the engine we load.
const RUNTIME_FILES: &[&str] = &[
    "index.html",
    "mygame.js",
    "version.js",
    "scene.js",
    "ui.js",
    "util.js",
    "persist.js",
    "navigator.js",
    "style.css",
    "alertify.js",
    "alertify.min.js",
    "alertify.css",
    "fastclick.js",
    "credits.html",
    "sandbox.html",
    "cache.php",
    "redirect.php",
];

/// Never written, even if the archive contains one. Published game zips have
/// been observed shipping App Store signing keys.
const SECRET_EXT: &[&str] = &[".pem", ".key", ".p12", ".keystore", ".mobileprovision", ".jks"];

const ASSET_EXT: &[&str] = &[
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico", ".mp3", ".ogg",
    ".wav", ".m4a", ".woff", ".woff2", ".ttf", ".otf",
];

/// Where a .cszip keeps the reader's own data.
///
/// A plain published archive has none of this and imports exactly as before. An
/// archive exported by this app carries its manifest and its save store here,
/// so a game and everything the reader did in it travel together.
pub const PLAYER_DIR: &str = "choicescript-player/";

#[derive(Debug, Default, serde::Serialize)]
pub struct Extracted {
    /// Scene names without the extension, as the engine refers to them.
    pub scenes: Vec<String>,
    /// Asset paths relative to the game root.
    pub assets: Vec<String>,
    /// Files deliberately left out, shown to the player after an import.
    pub skipped: Vec<String>,
    /// Raw startup.txt. The front end parses it.
    pub startup: String,
    pub bytes: u64,
    /// The exported manifest, if this archive came from this app.
    pub manifest: Option<String>,
    /// The exported save store: saves, achievements, per-game settings.
    pub store: Option<String>,
}

struct Entry {
    path: String,
    data: Vec<u8>,
}

fn lower(s: &str) -> String {
    s.to_ascii_lowercase()
}

fn ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(i) => lower(&name[i..]),
        None => String::new(),
    }
}

fn base_of(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Reject anything that would escape the game's own namespace. Mirrors
/// `safeRelative` in library.ts, and is the only defence against a zip whose
/// entries are `../../`.
fn safe_relative(path: &str) -> Option<String> {
    let normalised = path.replace('\\', "/");
    if normalised.starts_with('/') {
        return None;
    }
    let mut parts = Vec::new();
    for part in normalised.split('/') {
        match part {
            "" | "." => continue,
            ".." => return None,
            other => parts.push(other),
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

/// Authors nest their game differently: `scenes/`, `mygame/scenes/`, or
/// `TheGame/mygame/scenes/`. Find the prefix whose scenes folder holds a
/// startup.txt. The uploaded Choice of Magics archive is the middle case.
fn find_scene_root(entries: &[Entry]) -> Option<String> {
    let mut candidates: HashMap<String, Vec<String>> = HashMap::new();
    for entry in entries {
        let Some(path) = safe_relative(&entry.path) else {
            continue;
        };
        let low = lower(&path);
        let Some(marker) = low.find("scenes/") else {
            continue;
        };
        // "scenes/" must be a whole path segment, not the tail of "cutscenes/".
        if marker != 0 && !low[..marker].ends_with('/') {
            continue;
        }
        let file = &low[marker + "scenes/".len()..];
        if file.is_empty() || file.contains('/') || !file.ends_with(".txt") {
            continue;
        }
        candidates
            .entry(path[..marker].to_string())
            .or_default()
            .push(file.to_string());
    }
    let mut roots: Vec<_> = candidates
        .into_iter()
        .filter(|(_, files)| files.iter().any(|f| f == "startup.txt"))
        .map(|(prefix, _)| prefix)
        .collect();
    // Shortest prefix wins, so a game that also ships a demo copy of itself
    // resolves to the outer one deterministically rather than by hash order.
    roots.sort_by_key(|p| (p.len(), p.clone()));
    roots.into_iter().next()
}

fn strip_bom(text: &str) -> &str {
    text.strip_prefix('\u{feff}').unwrap_or(text)
}

fn read_zip(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("zip: {e}"))?;
    let mut entries = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
        if file.is_dir() {
            continue;
        }
        let path = file.name().to_string();
        let mut data = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut data).map_err(|e| format!("zip read: {e}"))?;
        entries.push(Entry { path, data });
    }
    Ok(entries)
}

fn read_tar(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    let mut archive = tar::Archive::new(std::io::Cursor::new(bytes));
    let mut entries = Vec::new();
    for entry in archive.entries().map_err(|e| format!("tar: {e}"))? {
        let mut entry = entry.map_err(|e| format!("tar entry: {e}"))?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry
            .path()
            .map_err(|e| format!("tar path: {e}"))?
            .to_string_lossy()
            .to_string();
        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|e| format!("tar read: {e}"))?;
        entries.push(Entry { path, data });
    }
    Ok(entries)
}

fn gunzip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(bytes)
        .read_to_end(&mut out)
        .map_err(|e| format!("gzip: {e}"))?;
    Ok(out)
}

/// Format is decided by content, not by extension. That is what lets `.cszip`
/// work with no special case: it is a zip, and it says so in its first bytes.
fn read_entries(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    if bytes.starts_with(b"PK\x03\x04") || bytes.starts_with(b"PK\x05\x06") {
        return read_zip(bytes);
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        return read_tar(&gunzip(bytes)?);
    }
    if bytes.len() > 262 && &bytes[257..262] == b"ustar" {
        return read_tar(bytes);
    }
    Err("Unrecognised archive. Expected a .zip, .cszip, .tar or .tar.gz.".into())
}

fn write_file(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(path, data).map_err(|e| format!("{}: {e}", path.display()))
}

/// Belt and braces over `safe_relative`: refuse to write anywhere that is not
/// genuinely inside `dest`, whatever the entry claimed.
fn inside(dest: &Path, candidate: &Path) -> bool {
    candidate.components().all(|c| !matches!(c, Component::ParentDir))
        && candidate.starts_with(dest)
}

/// Unpack `bytes` into `dest`, which is created if missing.
///
/// Scenes land in `dest/scenes/<name>.txt`, assets in `dest/assets/<path>`.
/// Everything else is dropped, and the interesting drops are reported.
pub fn extract(bytes: &[u8], dest: &Path) -> Result<Extracted, String> {
    let entries = read_entries(bytes)?;
    if entries.is_empty() {
        return Err("The archive is empty.".into());
    }
    let root = find_scene_root(&entries).ok_or_else(|| {
        "No ChoiceScript game found. The archive must contain a \"scenes\" folder with a \
         startup.txt inside it."
            .to_string()
    })?;

    let mut out = Extracted::default();
    std::fs::create_dir_all(dest).map_err(|e| format!("{}: {e}", dest.display()))?;

    for entry in &entries {
        let Some(rel) = safe_relative(&entry.path) else {
            continue;
        };

        /* The player's own data, if this archive was exported by this app.
           Read before the scene-root filter, since it sits outside the game. */
        if let Some(name) = rel.strip_prefix(PLAYER_DIR) {
            match name {
                "manifest.json" => out.manifest = Some(String::from_utf8_lossy(&entry.data).into()),
                "store.json" => out.store = Some(String::from_utf8_lossy(&entry.data).into()),
                _ => {}
            }
            continue;
        }

        let base = base_of(&rel).to_string();
        let ext = ext_of(&base);

        if SECRET_EXT.contains(&ext.as_str()) {
            out.skipped.push(format!("{base} (credential, not stored)"));
            continue;
        }
        if !lower(&rel).starts_with(&lower(&root)) {
            continue;
        }
        let inner = &rel[root.len()..];
        if inner.is_empty() || base.starts_with('.') || inner.contains("__MACOSX") {
            continue;
        }

        let low = lower(inner);
        // A scene is exactly scenes/<name>.txt. The sibling .txt.json files
        // Choice of Magics ships must not be mistaken for scenes.
        if let Some(file) = low.strip_prefix("scenes/") {
            if !file.contains('/') && file.ends_with(".txt") {
                let name = &inner["scenes/".len()..inner.len() - 4];
                let text = String::from_utf8_lossy(&entry.data);
                let text = strip_bom(&text);
                let target = dest.join("scenes").join(format!("{name}.txt"));
                if !inside(dest, &target) {
                    continue;
                }
                write_file(&target, text.as_bytes())?;
                out.scenes.push(name.to_string());
                out.bytes += entry.data.len() as u64;
                if lower(name) == "startup" {
                    out.startup = text.to_string();
                }
                continue;
            }
        }
        if low.contains("/scenes/") {
            continue;
        }
        if RUNTIME_FILES.contains(&lower(&base).as_str()) {
            out.skipped.push(base);
            continue;
        }
        if ASSET_EXT.contains(&ext.as_str()) {
            let target: PathBuf = dest.join("assets").join(inner);
            if !inside(dest, &target) {
                continue;
            }
            write_file(&target, &entry.data)?;
            out.assets.push(inner.to_string());
            out.bytes += entry.data.len() as u64;
        }
    }

    if out.scenes.is_empty() {
        return Err("No scene files were found in the archive.".into());
    }
    out.scenes.sort();
    out.assets.sort();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn build_zip(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            for (name, data) in files {
                w.start_file(*name, SimpleFileOptions::default()).unwrap();
                w.write_all(data).unwrap();
            }
            w.finish().unwrap();
        }
        buf
    }

    #[test]
    fn finds_the_scene_root_under_a_wrapper_directory() {
        let zip = build_zip(&[
            ("choice-of-magic/scenes/startup.txt", b"*title Test"),
            ("choice-of-magic/scenes/chapter1.txt", b"Hello"),
            ("choice-of-magic/icon.jpg", &[0xff, 0xd8]),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let out = extract(&zip, dir.path()).unwrap();
        assert_eq!(out.scenes, vec!["chapter1", "startup"]);
        assert_eq!(out.assets, vec!["icon.jpg"]);
        assert_eq!(out.startup, "*title Test");
        assert!(dir.path().join("scenes/startup.txt").exists());
        assert!(dir.path().join("assets/icon.jpg").exists());
    }

    #[test]
    fn refuses_paths_that_escape_the_destination() {
        let zip = build_zip(&[
            ("../../evil.png", b"x"),
            ("scenes/startup.txt", b"*title T"),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let out = extract(&zip, dir.path()).unwrap();
        assert!(out.assets.is_empty());
        assert!(!dir.path().parent().unwrap().join("evil.png").exists());
        assert_eq!(out.scenes, vec!["startup"]);
    }

    #[test]
    fn drops_the_old_runtime_and_credentials() {
        let zip = build_zip(&[
            ("scenes/startup.txt", b"*title T"),
            ("mygame.js", b"x"),
            ("dist.p12", b"x"),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let out = extract(&zip, dir.path()).unwrap();
        assert!(out.assets.is_empty());
        assert_eq!(out.skipped.len(), 2);
    }

    #[test]
    fn json_siblings_are_not_scenes() {
        let zip = build_zip(&[
            ("g/scenes/startup.txt", b"*title T"),
            ("g/scenes/startup.txt.json", b"{}"),
            ("g/scenes/nested/deep.txt", b"x"),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let out = extract(&zip, dir.path()).unwrap();
        assert_eq!(out.scenes, vec!["startup"]);
    }

    #[test]
    fn strips_a_byte_order_mark_from_startup() {
        let zip = build_zip(&[("scenes/startup.txt", "\u{feff}*title T".as_bytes())]);
        let dir = tempfile::tempdir().unwrap();
        let out = extract(&zip, dir.path()).unwrap();
        assert!(out.startup.starts_with("*title"));
    }

    #[test]
    fn rejects_an_archive_with_no_startup() {
        let zip = build_zip(&[("scenes/chapter1.txt", b"x")]);
        let dir = tempfile::tempdir().unwrap();
        assert!(extract(&zip, dir.path()).is_err());
    }

    /// Run with: cargo test -- --ignored
    /// Requires the licensed archive in games/.
    #[test]
    #[ignore]
    fn extracts_choice_of_magics() {
        let bytes = std::fs::read("games/choice-of-magics.cszip").unwrap();
        let dir = tempfile::tempdir().unwrap();
        let out = extract(&bytes, dir.path()).unwrap();
        assert_eq!(out.scenes.len(), 22);
        assert_eq!(out.assets.len(), 67); // 66 png + icon.jpg
        assert!(out.startup.starts_with("*title Choice of Magics"));
        assert!(out.skipped.iter().any(|s| s == "credits.html"));
    }
}
