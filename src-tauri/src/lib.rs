//! ChoiceScript desktop.
//!
//! The front end is the existing static build. Rust owns bytes and paths:
//! unpacking archives, the game library on disk, and the engine's save files.

mod archive;
mod library;
mod menu;
mod paths;
mod store;

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

/// Archive paths handed to us by the operating system that the front end has
/// not collected yet.
///
/// A double-clicked `.cszip` can arrive before the webview has finished
/// loading, and an event emitted to a window that is not listening is simply
/// lost. So paths are queued here and the front end drains the queue once it
/// is ready, as well as subscribing for later ones.
#[derive(Default)]
struct Pending(Mutex<Vec<String>>);

fn queue_archive(app: &AppHandle, path: String) {
    if let Some(state) = app.try_state::<Pending>() {
        if let Ok(mut queue) = state.0.lock() {
            queue.push(path.clone());
        }
    }
    let _ = app.emit("open-archive", path);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn take_pending_archives(state: tauri::State<'_, Pending>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut queue| std::mem::take(&mut *queue))
        .unwrap_or_default()
}

/// Windows and Linux pass the opened file as an argument. macOS does not —
/// see the `RunEvent::Opened` arm in `run()`.
fn archives_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|arg| {
            let path = std::path::Path::new(arg);
            path.extension().and_then(|s| s.to_str()) == Some("cszip") && path.is_file()
        })
        .collect()
}

pub fn run() {
    let mut builder = tauri::Builder::default();

    // Registered first, as the plugin's own documentation requires: a second
    // launch must hand its argument to the running app rather than opening a
    // second library on the same files.
    #[cfg(all(desktop, not(any(target_os = "android", target_os = "ios"))))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for path in archives_from_args(argv) {
                queue_archive(app, path);
            }
        }));
    }

    let app = builder
        .plugin(tauri_plugin_opener::init())
        .menu(menu::build)
        // Menu items act in the webview, where the engine is. Rust only owns
        // the shape of the menu and its accelerators.
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.clone());
        })
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Pending::default())
        .invoke_handler(tauri::generate_handler![
            take_pending_archives,
            library::import_archive,
            library::import_archive_path,
            library::write_manifest,
            library::list_manifests,
            library::read_scenes,
            library::asset_root,
            library::delete_game,
            library::library_bytes,
            library::decompress,
            library::take_bundled,
            menu::set_game_menu_enabled,
            menu::set_menu_visible,
            store::read_store,
            store::write_store,
        ])
        .setup(|app| {
            paths::ensure_dirs(&app.handle().clone())?;
            for path in archives_from_args(std::env::args()) {
                queue_archive(&app.handle().clone(), path);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the application");

    app.run(|app, event| {
        // macOS delivers an opened document as an event after launch, never as
        // an argument. Handling only argv would make the file association work
        // on two platforms out of three, and fail silently on the third.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    queue_archive(app, path.to_string_lossy().to_string());
                }
            }
        }
        let _ = (app, &event);
    });
}

#[cfg(test)]
mod tests {
    use super::archives_from_args;

    #[test]
    fn ignores_the_executable_and_non_archives() {
        let args = vec![
            "/usr/bin/choicescript".to_string(),
            "--flag".to_string(),
            "/tmp/not-a-game.txt".to_string(),
        ];
        assert!(archives_from_args(args).is_empty());
    }

    #[test]
    fn picks_up_an_existing_cszip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("game.cszip");
        std::fs::write(&file, b"PK").unwrap();
        let args = vec!["exe".to_string(), file.to_string_lossy().to_string()];
        assert_eq!(archives_from_args(args).len(), 1);
    }
}
