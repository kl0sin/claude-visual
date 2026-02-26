use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            // In dev mode the sidecar doesn't exist — server starts via beforeDevCommand
            #[cfg(not(debug_assertions))]
            {
                let sidecar = app
                    .shell()
                    .sidecar("server")
                    .expect("sidecar 'server' not found in bundle");
                let (_rx, child) = sidecar.spawn().expect("failed to spawn server sidecar");
                *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    if let Some(child) = window
                        .app_handle()
                        .state::<ServerProcess>()
                        .0
                        .lock()
                        .unwrap()
                        .take()
                    {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
