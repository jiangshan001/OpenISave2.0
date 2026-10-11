use super::*;

fn payload(tag: &str) -> GitHubRelease {
    GitHubRelease {
        tag_name: tag.into(),
        html_url: format!("{RELEASE_PREFIX}{tag}"),
        body: Some("A release note".into()),
        draft: false,
        prerelease: false,
        assets: vec![Asset {
            name: format!("OpenISave_{}_x64-setup.exe", tag.trim_start_matches('v')),
        }],
    }
}

#[test]
fn compares_numeric_versions_and_rejects_previews() {
    assert!(newer("2.10.0", "2.9.0"));
    assert!(!newer("2.4.1", "2.4.1"));
    assert!(!newer("2.4.1+build.2", "2.4.1+build.1"));
    assert!(!newer("2.4.0", "2.4.1"));
    assert!(!newer("2.5.0-beta.1", "2.4.1"));
    assert!(!newer("invalid", "2.4.1"));
}

#[test]
fn rejects_other_hosts_repositories_and_shell_text() {
    for url in [
        "https://github.com.evil.example/releases/tag/v2.5.0",
        "https://github.com/other/repo/releases/tag/v2.5.0",
        "https://github.com/jiangshan001/OpenISave2.0/releases/tag/v2.5.0?next=evil",
        "https://github.com/jiangshan001/OpenISave2.0/releases/tag/v2.5.0&calc",
        "file:///C:/installer.exe",
    ] {
        assert!(!valid_release_url(url));
    }
    assert!(valid_release_url(&format!("{RELEASE_PREFIX}v2.5.0")));
}

#[test]
fn only_accepts_complete_stable_windows_releases() {
    assert_eq!(
        release_from_payload(payload("v2.5.0")).unwrap().version,
        "2.5.0"
    );
    let mut draft = payload("v2.5.0");
    draft.draft = true;
    assert!(release_from_payload(draft).is_err());
    let mut preview = payload("v2.5.0-beta.1");
    preview.prerelease = true;
    assert!(release_from_payload(preview).is_err());
    let mut incomplete = payload("v2.5.0");
    incomplete.assets.clear();
    assert!(release_from_payload(incomplete).is_err());
    let mut mismatch = payload("v2.5.0");
    mismatch.html_url = format!("{RELEASE_PREFIX}v2.4.0");
    assert!(release_from_payload(mismatch).is_err());
}

#[test]
fn daily_cooldown_manual_override_and_failed_check_retry() {
    let mut cache = Cache {
        checked_at: Some(1000),
        ..Cache::default()
    };
    assert!(skip_check(&cache, false, 1001));
    assert!(!skip_check(&cache, false, 1000 + DAY));
    assert!(!skip_check(&cache, true, 1001));
    assert!(!skip_check(&cache, false, 999)); // Clock moved backwards.
    cache.last_error = Some("offline".into());
    cache.attempted_at = Some(2000);
    assert!(skip_check(&cache, false, 2001));
    assert!(!skip_check(&cache, false, 2000 + RETRY));
}

#[test]
fn skipping_is_per_version_and_offline_retains_last_known_update() {
    let mut cache = Cache {
        latest: Some(release_from_payload(payload("v2.5.0")).unwrap()),
        dismissed_version: Some("2.5.0".into()),
        ..Cache::default()
    };
    assert!(snapshot(&cache, "2.4.1").dismissed);
    cache.latest = Some(release_from_payload(payload("v2.5.1")).unwrap());
    cache.last_error = Some("offline".into());
    let state = snapshot(&cache, "2.4.1");
    assert!(state.has_update);
    assert!(!state.dismissed);
    assert!(state.last_error.is_some());
    assert!(!snapshot(&cache, "2.5.1").has_update);
}

#[test]
fn cache_persists_without_using_a_vault_and_recovers_corrupt_json() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!("openisave-update-test-{suffix}"));
    let path = directory.join("update-state.json");
    let manager = UpdateManager::load(path.clone());
    let cache = Cache {
        checked_at: Some(1000),
        latest: Some(release_from_payload(payload("v2.5.0")).unwrap()),
        dismissed_version: Some("2.5.0".into()),
        ..Cache::default()
    };
    manager.save(&cache).unwrap();
    manager.save(&cache).unwrap(); // Atomic replacement on Windows.
    let loaded = UpdateManager::load(path.clone());
    assert_eq!(
        loaded
            .cache
            .try_lock()
            .unwrap()
            .dismissed_version
            .as_deref(),
        Some("2.5.0")
    );
    std::fs::write(&path, b"invalid json").unwrap();
    assert!(UpdateManager::load(path.clone())
        .cache
        .try_lock()
        .unwrap()
        .latest
        .is_none());
    std::fs::remove_file(path).unwrap();
    std::fs::remove_dir(directory).unwrap();
}
