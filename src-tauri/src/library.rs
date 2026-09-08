//! The game library as commands over the file system.
//!
//! Import returns the file listing and the raw startup.txt. It deliberately
//! does not parse ChoiceScript: the front end owns `parseSceneList`,
//! `parseAchievements` and the title regexes, and calls `write_manifest` once
//! it has built the record.

use std::collections::HashMap;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

use crate::archive::{self, Extracted, PLAYER_DIR};
use crate::paths;
use crate::store;

#[derive(Serialize)]
pub struct ImportResult {
    pub id: String,
    #[serde(flatten)]
    pub extracted: Extracted,
    /// Filename the archive arrived as, so the manifest can record a source.
    pub source: String,
}

/// Ids match what `library.ts` generates on the web: 16 lowercase hex
/// characters. Generated here from the system clock and the address of a
/// heap allocation, which is enough for a local library and avoids pulling in
/// a uuid crate for one call site.
fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let boxed = Box::new(0u8);
    let addr = &*boxed as *const u8 as usize;
    format!("{:016x}", (nanos as u64) ^ (addr as u64).rotate_left(17))
}

fn import_bytes(app: &AppHandle, bytes: &[u8], source: &str) -> Result<ImportResult, String> {
    paths::ensure_dirs(app)?;
    let id = new_id();
    let dir = paths::game_dir(app, &id)?;
    match archive::extract(bytes, &dir) {
        Ok(extracted) => {
            /* An archive this app exported brings the reader's saves with it.
               They are written under the *new* id's namespace, so importing the
               same export twice yields two independent copies rather than two
               games sharing one save file. */
            if let Some(raw) = &extracted.store {
                if let Ok(map) = serde_json::from_str::<store::Map>(raw) {
                    let file = paths::store_file(app, &format!("CS-{id}"))?;
                    let _ = store::write_map(&file, &map);
                }
            }
            Ok(ImportResult {
                id,
                extracted,
                source: source.to_string(),
            })
        }
        Err(e) => {
            // A half-written game is worse than none. The manifest is written
            // separately, so anything left here would be invisible to the
            // library and would never be cleaned up.
            let _ = std::fs::remove_dir_all(&dir);
            Err(e)
        }
    }
}

/// Bytes arrive as a raw IPC body rather than a JSON array of numbers. The
/// bundled game is 3.8 MB; as JSON that is roughly 20 MB of text to serialise,
/// parse and garbage-collect on the main thread.
#[tauri::command]
pub async fn import_archive(app: AppHandle, request: Request<'_>) -> Result<ImportResult, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("import_archive expects the archive as a raw body".into());
    };
    let source = request
        .headers()
        .get("source")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("dropped archive")
        .to_string();
    import_bytes(&app, bytes, &source)
}

/// Used by the `.cszip` association and by the first-run import of bundled
/// games, where the file is already on disk and never needs to cross IPC.
#[tauri::command]
pub async fn import_archive_path(app: AppHandle, path: String) -> Result<ImportResult, String> {
    let source = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    import_bytes(&app, &bytes, &source)
}

#[tauri::command]
pub fn write_manifest(
    app: AppHandle,
    id: String,
    manifest: serde_json::Value,
) -> Result<(), String> {
    let file = paths::manifest_file(&app, &id)?;
    let json = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(&file, json).map_err(|e| format!("{}: {e}", file.display()))
}

/// Every manifest that parses. A directory without one is an import that never
/// finished; it is reported rather than silently listed as a playable game.
#[tauri::command]
pub fn list_manifests(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = paths::games_dir(&app)?;
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(format!("{}: {e}", dir.display())),
        Ok(entries) => entries,
    };
    for entry in entries.flatten() {
        let manifest = entry.path().join("manifest.json");
        let Ok(bytes) = std::fs::read(&manifest) else {
            continue;
        };
        if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            out.push(value);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn read_scenes(app: AppHandle, id: String) -> Result<HashMap<String, String>, String> {
    let dir = paths::scenes_dir(&app, &id)?;
    let mut out = HashMap::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("txt") {
            continue;
        }
        let Some(name) = path.file_stem().map(|s| s.to_string_lossy().to_string()) else {
            continue;
        };
        let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        out.insert(name, text);
    }
    if out.is_empty() {
        return Err(format!("no scenes on disk for {id}"));
    }
    Ok(out)
}

/// The absolute path of a game's asset folder. The front end joins a filename
/// onto it and runs it through `convertFileSrc`, so images stream from disk
/// instead of crossing IPC as blobs.
#[tauri::command]
pub fn asset_root(app: AppHandle, id: String) -> Result<String, String> {
    Ok(paths::assets_dir(&app, &id)?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_game(app: AppHandle, id: String) -> Result<(), String> {
    let dir = paths::game_dir(&app, &id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    // Saves go with the game. Leaving them orphaned would silently reattach to
    // a future import that happened to draw the same id.
    let store = paths::store_file(&app, &format!("CS-{id}"))?;
    let _ = std::fs::remove_file(store);
    Ok(())
}

fn dir_bytes(path: &std::path::Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => dir_bytes(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

/// Stands in for `navigator.storage.estimate()`, which reports the webview's
/// quota rather than anything to do with these files.
#[tauri::command]
pub fn library_bytes(app: AppHandle) -> Result<u64, String> {
    Ok(dir_bytes(&paths::games_dir(&app)?))
}

/// Fallback for webviews without `DecompressionStream` — WebKitGTK below 2.40.
/// Not used on macOS or Windows.
#[tauri::command]
pub fn decompress(request: Request<'_>) -> Result<Response, String> {
    use std::io::Read;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("decompress expects raw bytes".into());
    };
    let format = request
        .headers()
        .get("format")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("gzip");
    let mut out = Vec::new();
    match format {
        "gzip" => flate2::read::GzDecoder::new(&bytes[..])
            .read_to_end(&mut out)
            .map_err(|e| e.to_string())?,
        "deflate" => flate2::read::ZlibDecoder::new(&bytes[..])
            .read_to_end(&mut out)
            .map_err(|e| e.to_string())?,
        "deflate-raw" => flate2::read::DeflateDecoder::new(&bytes[..])
            .read_to_end(&mut out)
            .map_err(|e| e.to_string())?,
        other => return Err(format!("unsupported format: {other}")),
    };
    Ok(Response::new(out))
}

/// Import anything in the bundled `games/` resource folder, once ever.
///
/// The marker is what stops a game the player deleted from returning on the
/// next launch. Manifests are not written here: the front end must parse
/// startup.txt to produce one, so the results are handed to it and it finishes
/// the job.
pub fn import_bundled(app: &AppHandle) -> Result<Vec<ImportResult>, String> {
    let marker = paths::bundled_marker(app)?;
    if marker.exists() {
        return Ok(Vec::new());
    }
    let dir = match app.path().resolve("games", tauri::path::BaseDirectory::Resource) {
        Ok(dir) if dir.exists() => dir,
        // In a `tauri dev` run before resources have been staged, fall back to
        // the source tree so first-run behaviour is testable.
        _ => std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("games"),
    };
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("cszip") {
                continue;
            }
            let source = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            match std::fs::read(&path).map_err(|e| e.to_string()).and_then(|bytes| {
                import_bytes(app, &bytes, &source)
            }) {
                Ok(result) => out.push(result),
                // One unreadable bundled archive must not stop the app from
                // starting; the player still has their own library.
                Err(e) => eprintln!("bundled import failed for {}: {e}", path.display()),
            }
        }
    }
    std::fs::write(&marker, b"1").map_err(|e| format!("{}: {e}", marker.display()))?;
    Ok(out)
}

/// Called by the front end once it is ready to receive them.
#[tauri::command]
pub async fn take_bundled(app: AppHandle) -> Result<Vec<ImportResult>, String> {
    import_bundled(&app)
}

fn add_dir(
    zip: &mut zip::ZipWriter<std::fs::File>,
    root: &std::path::Path,
    dir: &std::path::Path,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    use std::io::Write;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let name = rel.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            add_dir(zip, root, &path, options)?;
        } else {
            let data = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Export a game *and* everything the reader did in it, as one .cszip.
///
/// The layout is a normal published archive — `scenes/`, the assets beside it —
/// plus a `choicescript-player/` folder holding the manifest and the save
/// store. Any other player will ignore that folder and see an ordinary game;
/// this one reads it back and the saves, achievements and per-game settings
/// come with it.
///
/// It lands in the downloads folder rather than behind a file dialog, which
/// would mean another plugin and another permission for one button. The path is
/// returned so the front end can say where it went.
#[tauri::command]
pub async fn export_game(app: AppHandle, id: String) -> Result<String, String> {
    use std::io::Write;

    let dir = paths::game_dir(&app, &id)?;
    if !dir.exists() {
        return Err(format!("no game on disk for {id}"));
    }
    let manifest = std::fs::read(paths::manifest_file(&app, &id)?)
        .map_err(|e| format!("manifest: {e}"))?;
    let title = serde_json::from_slice::<serde_json::Value>(&manifest)
        .ok()
        .and_then(|v| v.get("title").and_then(|t| t.as_str()).map(str::to_string))
        .unwrap_or_else(|| id.clone());

    /* A filename someone can find again, with anything a filesystem might
       object to replaced. */
    let slug: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();

    let out_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let target = out_dir.join(format!("{slug}.cszip"));

    let file = std::fs::File::create(&target).map_err(|e| format!("{}: {e}", target.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();

    /* scenes/ and the assets, flattened back to the shape a game ships in. */
    add_dir(&mut zip, &dir, &paths::scenes_dir(&app, &id)?, options)?;
    add_dir(&mut zip, &paths::assets_dir(&app, &id)?, &paths::assets_dir(&app, &id)?, options)?;

    zip.start_file(format!("{PLAYER_DIR}manifest.json"), options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&manifest).map_err(|e| e.to_string())?;

    let store_file = paths::store_file(&app, &format!("CS-{id}"))?;
    let saves = store::read_map(&store_file)?;
    if !saves.is_empty() {
        zip.start_file(format!("{PLAYER_DIR}store.json"), options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&serde_json::to_vec(&saves).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}
