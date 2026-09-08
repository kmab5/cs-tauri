// Keep the console window from appearing behind the app on Windows release
// builds. Debug builds keep it, because that is where panics are readable.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    choicescript_lib::run()
}
