//! The engine's key/value store, as one JSON file per namespace.
//!
//! ChoiceScript reaches persistence only through `window.store`, a flat
//! string-to-string map: `state<slot>`, `savemeta_<slot>`, `achieved`,
//! `preferredTheme` and so on. One file per store name keeps a player's saves
//! for a game in a single readable place they can copy or back up.

use std::collections::HashMap;
use std::path::Path;

use crate::paths;

pub type Map = HashMap<String, String>;

/// An absent file is an empty store, not an error. The engine reads before it
/// has ever written, and an error there surfaces to the player as a broken
/// game rather than a new one.
pub fn read_map(path: &Path) -> Result<Map, String> {
    match std::fs::read(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Map::new()),
        Err(e) => Err(format!("{}: {e}", path.display())),
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", path.display())),
    }
}

/// Written to a sibling temp file and renamed, so a crash or a power cut
/// during a save cannot leave a truncated store behind. Rename is atomic on
/// every platform we target when both paths share a directory.
pub fn write_map(path: &Path, data: &Map) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    let json = serde_json::to_vec(data).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &json).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
pub fn read_store(app: tauri::AppHandle, name: String) -> Result<Map, String> {
    read_map(&paths::store_file(&app, &name)?)
}

#[tauri::command]
pub fn write_store(app: tauri::AppHandle, name: String, data: Map) -> Result<(), String> {
    write_map(&paths::store_file(&app, &name)?, &data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_then_reads_the_same_map() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("CS-abc.json");
        let mut map = Map::new();
        map.insert("state".into(), "{\"line\":3}".into());
        map.insert("achieved".into(), "[\"first_spell\"]".into());
        write_map(&file, &map).unwrap();
        assert_eq!(read_map(&file).unwrap(), map);
    }

    #[test]
    fn reads_an_absent_file_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_map(&dir.path().join("nope.json")).unwrap().is_empty());
    }

    #[test]
    fn leaves_no_temp_file_behind() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("CS-abc.json");
        write_map(&file, &Map::new()).unwrap();
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["CS-abc.json"]);
    }
}
