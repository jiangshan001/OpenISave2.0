//! Public release checks, independent of the encrypted vault. Never downloads
//! or executes an installer; the user opens a validated GitHub release page.
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

const API_URL: &str = "https://api.github.com/repos/jiangshan001/OpenISave2.0/releases/latest";
const RELEASE_PREFIX: &str = "https://github.com/jiangshan001/OpenISave2.0/releases/tag/";
const DAY: u64 = 24 * 60 * 60;
const RETRY: u64 = 60 * 60;
const MAX_METADATA: usize = 512 * 1024;

#[derive(Clone, Default, Deserialize, Serialize)]
struct Cache {
    checked_at: Option<u64>,
    attempted_at: Option<u64>,
    latest: Option<Release>,
    dismissed_version: Option<String>,
    last_error: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
struct Release {
    version: String,
    url: String,
    notes: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
}

#[derive(Serialize)]
pub struct UpdateState {
    current_version: String,
    latest_version: Option<String>,
    release_url: Option<String>,
    notes: Option<String>,
    checked_at: Option<u64>,
    has_update: bool,
    dismissed: bool,
    last_error: Option<String>,
}

pub struct UpdateManager {
    path: PathBuf,
    cache: tauri::async_runtime::Mutex<Cache>,
}

impl UpdateManager {
    pub fn load(path: PathBuf) -> Self {
        let cache = std::fs::read(&path)
            .ok()
            .filter(|bytes| bytes.len() <= MAX_METADATA)
            .and_then(|bytes| serde_json::from_slice::<Cache>(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            cache: tauri::async_runtime::Mutex::new(cache),
        }
    }

    fn save(&self, cache: &Cache) -> Result<(), String> {
        let parent = self
            .path
            .parent()
            .ok_or("Update settings path unavailable")?;
        std::fs::create_dir_all(parent).map_err(|_| "Could not save update settings")?;
        let temporary = self.path.with_extension("tmp");
        let bytes = serde_json::to_vec(cache).map_err(|_| "Could not save update settings")?;
        std::fs::write(&temporary, bytes).map_err(|_| "Could not save update settings")?;
        std::fs::rename(temporary, &self.path).map_err(|_| "Could not save update settings".into())
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn newer(latest: &str, current: &str) -> bool {
    match (Version::parse(latest), Version::parse(current)) {
        (Ok(latest), Ok(current)) => latest.pre.is_empty() && latest.cmp_precedence(&current).is_gt(),
        _ => false,
    }
}

fn valid_release_url(url: &str) -> bool {
    url.strip_prefix(RELEASE_PREFIX).is_some_and(|tag| {
        !tag.is_empty()
            && tag
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b".-+".contains(&c))
            && Version::parse(tag.strip_prefix('v').unwrap_or(tag)).is_ok()
    })
}

fn release_from_payload(payload: GitHubRelease) -> Result<Release, String> {
    let tag = &payload.tag_name;
    let version = Version::parse(tag.strip_prefix('v').unwrap_or(tag))
        .map_err(|_| "The published version is invalid")?;
    if payload.draft
        || payload.prerelease
        || !version.pre.is_empty()
        || !valid_release_url(&payload.html_url)
        || payload.html_url != format!("{RELEASE_PREFIX}{tag}")
    {
        return Err("No valid stable release is available".into());
    }
    let installer = format!("OpenISave_{version}_x64-setup.exe");
    if !payload.assets.iter().any(|asset| asset.name == installer) {
        return Err("The latest release has no Windows installer yet".into());
    }
    Ok(Release {
        version: version.to_string(),
        url: payload.html_url,
        notes: payload
            .body
            .unwrap_or_default()
            .chars()
            .take(2000)
            .collect(),
    })
}

fn snapshot(cache: &Cache, current: &str) -> UpdateState {
    let latest = cache
        .latest
        .as_ref()
        .filter(|release| valid_release_url(&release.url));
    let has_update = latest.is_some_and(|release| newer(&release.version, current));
    UpdateState {
        current_version: current.into(),
        latest_version: latest.map(|release| release.version.clone()),
        release_url: latest.map(|release| release.url.clone()),
        notes: latest.map(|release| release.notes.clone()),
        checked_at: cache.checked_at,
        has_update,
        dismissed: has_update && latest.map(|r| &r.version) == cache.dismissed_version.as_ref(),
        last_error: cache.last_error.clone(),
    }
}

fn skip_check(cache: &Cache, force: bool, timestamp: u64) -> bool {
    if force {
        return false;
    }
    let (last, interval) = if cache.last_error.is_some() {
        (cache.attempted_at, RETRY)
    } else {
        (cache.checked_at, DAY)
    };
    last.is_some_and(|last| timestamp >= last && timestamp - last < interval)
}

async fn fetch_release(current: &str) -> Result<Release, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!("OpenISave/{current}"))
        .build()
        .map_err(|_| "Could not start the update check")?;
    let mut response = client
        .get(API_URL)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| "Could not reach GitHub. Check your connection and try again.")?;
    match response.status().as_u16() {
        200 => {}
        403 | 429 => return Err("GitHub's request limit was reached. Try again later.".into()),
        404 => return Err("No published release is available yet.".into()),
        _ => return Err("GitHub could not provide update information. Try again later.".into()),
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read update information")?
    {
        if bytes.len() + chunk.len() > MAX_METADATA {
            return Err("The update information is too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let payload = serde_json::from_slice(&bytes).map_err(|_| "Invalid update information")?;
    release_from_payload(payload)
}

#[tauri::command]
pub async fn app_update_state(
    app: AppHandle,
    manager: State<'_, UpdateManager>,
) -> Result<UpdateState, String> {
    Ok(snapshot(
        &*manager.cache.lock().await,
        &app.package_info().version.to_string(),
    ))
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    manager: State<'_, UpdateManager>,
    force: bool,
) -> Result<UpdateState, String> {
    let current = app.package_info().version.to_string();
    // Serialize checks and coalesce background requests. Never lock the vault.
    let mut cache = manager.cache.lock().await;
    if skip_check(&cache, force, now()) {
        return Ok(snapshot(&cache, &current));
    }
    cache.attempted_at = Some(now());
    match fetch_release(&current).await {
        Ok(release) => {
            cache.latest = Some(release);
            cache.checked_at = Some(now());
            cache.last_error = None;
            // Explicit checking also lets the user rediscover a skipped version.
            if force {
                cache.dismissed_version = None;
            }
        }
        Err(error) => cache.last_error = Some(error),
    }
    manager.save(&cache)?;
    Ok(snapshot(&cache, &current))
}

#[tauri::command]
pub async fn dismiss_app_update(
    app: AppHandle,
    manager: State<'_, UpdateManager>,
) -> Result<UpdateState, String> {
    let mut cache = manager.cache.lock().await;
    cache.dismissed_version = cache.latest.as_ref().map(|release| release.version.clone());
    manager.save(&cache)?;
    Ok(snapshot(&cache, &app.package_info().version.to_string()))
}

#[tauri::command]
pub async fn open_app_release(manager: State<'_, UpdateManager>) -> Result<(), String> {
    let cache = manager.cache.lock().await;
    let url = cache
        .latest
        .as_ref()
        .map(|release| release.url.as_str())
        .filter(|url| valid_release_url(url))
        .ok_or("Check for updates before opening the release")?;
    open_release_url(url)
}

#[cfg(windows)]
fn open_release_url(url: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let operation: Vec<u16> = "open\0".encode_utf16().collect();
    let target: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
    // Only our validated HTTPS release URL reaches the OS; no shell command strings.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        Err("Could not open your browser".into())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn open_release_url(_url: &str) -> Result<(), String> {
    Err("Opening releases is supported in the Windows desktop app".into())
}

#[cfg(test)]
#[path = "updates_tests.rs"]
mod tests;
