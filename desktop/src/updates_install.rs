use super::*;
use std::time::Instant;
use tauri::{ipc::Channel, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
pub struct InstallProgress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
    error: Option<String>,
}

impl Default for InstallProgress {
    fn default() -> Self {
        Self {
            phase: "idle",
            downloaded: 0,
            total: None,
            error: None,
        }
    }
}

fn publish(manager: &UpdateManager, channel: &Channel<InstallProgress>, progress: InstallProgress) {
    if let Ok(mut state) = manager.progress.lock() {
        *state = progress.clone();
    }
    let _ = channel.send(progress);
}

async fn apply_update(
    app: &AppHandle,
    manager: &UpdateManager,
    channel: &Channel<InstallProgress>,
) -> Result<(), String> {
    let current = app.package_info().version.to_string();
    let expected = manager
        .cache
        .lock()
        .await
        .latest
        .clone()
        .filter(|release| newer(&release.version, &current))
        .ok_or("Check for a newer version before updating")?;
    let expected_installer = expected
        .installer
        .as_ref()
        .filter(|installer| valid_installer(&expected.version, installer))
        .ok_or("Check for updates again to get a signed installer")?;

    let shutdown_handle = app.clone();
    let mut update = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .restart_after_install(true)
        .on_before_exit(move || {
            shutdown_handle
                .state::<crate::backend::BackendState>()
                .shutdown()
        })
        .build()
        .map_err(|_| "Could not prepare the updater")?
        .check()
        .await
        .map_err(|_| "Could not prepare the update. Check your connection and try again.")?
        .ok_or("No newer signed update is available. Check for updates again.")?;
    let received = SignedInstaller {
        url: update.download_url.to_string(),
        signature: update.signature.clone(),
    };
    if update.version != expected.version || received != *expected_installer {
        return Err(
            "The available update changed. Check for updates again before installing.".into(),
        );
    }
    // A slow download may take minutes; the metadata request above remains bounded.
    update.timeout = Some(Duration::from_secs(15 * 60));
    let mut downloaded = 0_u64;
    let mut last_sent = Instant::now() - Duration::from_secs(1);
    let bytes = update.download(
        |chunk, total| {
            downloaded = downloaded.saturating_add(chunk as u64);
            if last_sent.elapsed() >= Duration::from_millis(100) || total == Some(downloaded) {
                publish(manager, channel, InstallProgress {
                    phase: "downloading", downloaded, total, error: None,
                });
                last_sent = Instant::now();
            }
        },
        || publish(manager, channel, InstallProgress { phase: "verifying", ..InstallProgress::default() }),
    ).await.map_err(|_| "Download or signature verification failed. Nothing was installed. Check your connection and retry.")?;
    // `download` returns only after the embedded public key verifies the entire package.
    publish(
        manager,
        channel,
        InstallProgress {
            phase: "installing",
            ..InstallProgress::default()
        },
    );
    update.install(bytes).map_err(|_| {
        "The installer could not start. Close and reopen OpenISave, then retry.".into()
    })
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    manager: State<'_, UpdateManager>,
    on_event: Channel<InstallProgress>,
) -> Result<(), String> {
    let _operation = manager
        .operation
        .try_lock()
        .map_err(|_| "An update operation is already running")?;
    publish(
        &manager,
        &on_event,
        InstallProgress {
            phase: "preparing",
            ..InstallProgress::default()
        },
    );
    match apply_update(&app, &manager, &on_event).await {
        Ok(()) => Ok(()), // Windows exits and the passive installer restarts the app.
        Err(error) => {
            publish(
                &manager,
                &on_event,
                InstallProgress {
                    phase: "failed",
                    error: Some(error.clone()),
                    ..InstallProgress::default()
                },
            );
            Err(error)
        }
    }
}
