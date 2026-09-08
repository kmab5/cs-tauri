//! The native menu bar.
//!
//! Every item forwards its id to the front end as a `menu` event rather than
//! acting in Rust: the actions belong to the engine, which lives in the
//! webview. Rust owns only the shape of the menu and the accelerators.
//!
//! One accelerator is deliberately absent. `CmdOrCtrl+R` is reload in every
//! webview, and a player who meant "restart the chapter" would instead drop
//! the whole session, so restart is bound to `CmdOrCtrl+Shift+R`.
//!
//! Symbol keys are written as key codes — `Equal`, `Minus`, `Digit0`,
//! `Backslash`, `Comma` — not as the characters they produce. `Plus` and `,`
//! are not parseable accelerators, and one unparseable string fails the whole
//! menu, which takes every other shortcut down with it silently. The front end
//! also handles these combinations itself (lib/desktop/menu.ts), so a menu that
//! fails to build no longer means a keyboard that does nothing.

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
/* Only the application menu uses this, and that menu is macOS-only. Importing
   it unconditionally warns on every Windows and Linux build. */
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::{AppHandle, Manager, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open = MenuItemBuilder::new("Open Game…")
        .id("open-game")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let library = MenuItemBuilder::new("Back to Library")
        .id("library")
        .accelerator("CmdOrCtrl+Shift+L")
        .build(app)?;

    let save = MenuItemBuilder::new("Save…")
        .id("save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let restore = MenuItemBuilder::new("Restore…")
        .id("restore")
        .accelerator("CmdOrCtrl+L")
        .build(app)?;
    let restart = MenuItemBuilder::new("Restart Game")
        .id("restart")
        .accelerator("CmdOrCtrl+Shift+R")
        .build(app)?;
    let achievements = MenuItemBuilder::new("Achievements")
        .id("achievements")
        .accelerator("CmdOrCtrl+Shift+A")
        .build(app)?;

    let sidebar = MenuItemBuilder::new("Toggle Sidebar")
        .id("toggle-sidebar")
        .accelerator("CmdOrCtrl+Backslash")
        .build(app)?;
    let panel = MenuItemBuilder::new("Toggle Achievements Panel")
        .id("toggle-panel")
        .accelerator("CmdOrCtrl+I")
        .build(app)?;
    let zoom_in = MenuItemBuilder::new("Larger Text")
        .id("zoom-in")
        .accelerator("CmdOrCtrl+Equal")
        .build(app)?;
    let zoom_out = MenuItemBuilder::new("Smaller Text")
        .id("zoom-out")
        .accelerator("CmdOrCtrl+Minus")
        .build(app)?;
    let zoom_reset = MenuItemBuilder::new("Actual Size")
        .id("zoom-reset")
        .accelerator("CmdOrCtrl+Digit0")
        .build(app)?;
    let focus = MenuItemBuilder::new("Focus Mode")
        .id("toggle-focus")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;
    let settings = MenuItemBuilder::new("Settings…")
        .id("settings")
        .accelerator("CmdOrCtrl+Comma")
        .build(app)?;

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<R>> = Vec::new();

    // The application menu is macOS only; on Windows and Linux these live
    // under File and Help instead, which is where those platforms look.
    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(app, "ChoiceScript")
        .about(Some(AboutMetadata {
            name: Some("ChoiceScript".into()),
            comments: Some("Games and saves stay on this machine.".into()),
            ..Default::default()
        }))
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    #[cfg(target_os = "macos")]
    items.push(&app_menu);

    let file = SubmenuBuilder::new(app, "File")
        .item(&open)
        .item(&library)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;
    items.push(&file);

    let game = SubmenuBuilder::new(app, "Game")
        .item(&save)
        .item(&restore)
        .separator()
        .item(&restart)
        .item(&achievements)
        .build()?;
    items.push(&game);

    let view = SubmenuBuilder::new(app, "View")
        .item(&sidebar)
        .item(&panel)
        .item(&focus)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;
    items.push(&view);

    #[cfg(not(target_os = "macos"))]
    let tools = SubmenuBuilder::new(app, "Tools").item(&settings).build()?;
    #[cfg(not(target_os = "macos"))]
    items.push(&tools);

    let window = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;
    items.push(&window);

    Menu::with_items(app, &items)
}

/// The items that only mean something while a game is running.
///
/// Disabled on the library page rather than left enabled and inert: the menu is
/// where a reader looks to find out what is possible right now, and offering
/// Restart with no game open is a lie about the state of the app.
const GAME_ITEMS: &[&str] = &[
    "save",
    "restore",
    "restart",
    "achievements",
    "toggle-panel",
    "toggle-focus",
    "library",
];

#[tauri::command]
pub fn set_game_menu_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    for id in GAME_ITEMS {
        if let Some(item) = menu.get(*id) {
            if let Some(item) = item.as_menuitem() {
                item.set_enabled(enabled).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// Hide the menu bar entirely, for focus mode.
///
/// The bar belongs to the window, so the front end cannot reach it — and
/// leaving it in place made focus mode a half measure. macOS draws its menu in
/// the system bar, which hides itself in fullscreen, so there is nothing to do
/// there.
#[tauri::command]
pub fn set_menu_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            if visible {
                window.show_menu().map_err(|e| e.to_string())?;
            } else {
                window.hide_menu().map_err(|e| e.to_string())?;
            }
        }
    }
    #[cfg(target_os = "macos")]
    let _ = (app, visible);
    Ok(())
}
