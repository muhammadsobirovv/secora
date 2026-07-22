// Prevents an extra console window from appearing on Windows in release
// builds — standard Tauri boilerplate.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pentesthub_desktop_lib::run();
}
