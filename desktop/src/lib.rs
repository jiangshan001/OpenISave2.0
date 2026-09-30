//! OpenISave desktop shell.
//!
//! Owns the window and supervises the FastAPI sidecar. In development no
//! sidecar is bundled, so the app simply loads the Vite dev server, which
//! proxies /api to a manually started backend.

mod backend;

use std::sync::Mutex;
use std::time::Duration;

use backend::{BackendState, BackendStatus, JobHandle};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent, State, WindowEvent};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const WINDOW_SHOW_FALLBACK: Duration = Duration::from_secs(4);

/// Keeps the Windows job object alive for as long as the app runs.
#[derive(Default)]
struct JobGuard(Mutex<Option<JobHandle>>);

#[derive(serde::Serialize)]
struct ApiInfo {
    /// "starting" | "ready" | "failed"
    status: &'static str,
    /// Absolute backend origin, or null when the dev proxy should be used.
    base_url: Option<String>,
    bundled: bool,
    message: Option<String>,
}

#[tauri::command]
fn api_info(state: State<'_, BackendState>) -> ApiInfo {
    match state.status() {
        BackendStatus::NotBundled => ApiInfo {
            status: "ready",
            base_url: None,
            bundled: false,
            message: None,
        },
        BackendStatus::Starting => ApiInfo {
            status: "starting",
            base_url: None,
            bundled: true,
            message: None,
        },
        BackendStatus::Ready(url) => ApiInfo {
            status: "ready",
            base_url: Some(url),
            bundled: true,
            message: None,
        },
        BackendStatus::Failed(message) => ApiInfo {
            status: "failed",
            base_url: None,
            bundled: true,
            message: Some(message),
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .manage(JobGuard::default())
        .invoke_handler(tauri::generate_handler![api_info])
        // The window is created hidden (tauri.conf.json) and shown once the
        // page has loaded, by which point index.html has applied the saved
        // light/dark theme. This avoids a white webview flashing before a
        // dark first frame. The timer below is a safety net only.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        .setup(|app| {
            let fallback = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(WINDOW_SHOW_FALLBACK);
                if let Some(window) = fallback.get_webview_window("main") {
                    let _ = window.show();
                }
            });

            let resource_dir = app.path().resource_dir()?;
            let state = app.state::<BackendState>();

            let Some(exe) = backend::sidecar_path(&resource_dir) else {
                // Development: `npm run dev` is serving the API already.
                state.set_not_bundled();
                return Ok(());
            };

            // Starting the backend takes seconds. Doing it here would block the
            // event loop and leave the user staring at a frozen window, so the
            // work happens on its own thread and the UI polls `api_info`.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<BackendState>();
                let port = match backend::free_port() {
                    Ok(port) => port,
                    Err(error) => {
                        state.set_failed(format!("Could not reserve a local port: {error}"));
                        return;
                    }
                };
                let (child, job) = match backend::start(&exe, port) {
                    Ok(started) => started,
                    Err(error) => {
                        state.set_failed(format!("Could not start the data service: {error}"));
                        return;
                    }
                };
                state.set_child(child);
                if let Ok(mut guard) = handle.state::<JobGuard>().0.lock() {
                    *guard = job;
                }
                if backend::wait_until_ready(port, STARTUP_TIMEOUT) {
                    state.set_ready(port);
                } else {
                    state.shutdown();
                    state.set_failed(
                        "The data service did not answer in time.".to_string(),
                    );
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window.app_handle().state::<BackendState>().shutdown();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start OpenISave")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                app_handle.state::<BackendState>().shutdown();
            }
        });
}
