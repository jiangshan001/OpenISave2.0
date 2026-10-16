# OpenISave 2.4.3 — one-click updates

## User experience

Settings → App updates → **Update now** downloads the Windows installer, verifies
the complete signed package and its signed version, then runs the passive NSIS
update and reopens OpenISave. The download has byte progress; preparation,
verification and installation have separate states. Failed downloads or rejected
signatures offer an explicit retry and do not start an installer.

Updates remain user initiated. Daily checks, manual checks and per-version
skipping are preserved. The sidebar opens the progress card while updating.
2.4.1/2.4.2 require one final normal installation to acquire the new updater.
The 2.4.2 cloud icon and warm light theme are included; this release adds no
schema migration or financial calculation change.

## Update trust and process

- The public static manifest is
  `https://github.com/jiangshan001/OpenISave2.0/releases/latest/download/latest.json`.
  Version checking no longer depends on the anonymous GitHub release API quota.
- The native command accepts no URL, file path or signing key from JavaScript.
  It requires a newer stable version, a signed Windows artifact at the exact
  versioned repository URL, and a fresh manifest matching the displayed release.
- Tauri updater 2.14.0 verifies the full download with the embedded public key;
  `requireSignedVersion` binds the manifest version to the signature. The same
  version or an older version is not offered. Production TLS checks stay enabled.
- Only after verification does installation begin. The packaged backend is shut
  down through `on_before_exit`, immediately before the native updater hands off
  to NSIS. Passive installation uses `restart_after_install(true)`.
- An operation mutex prevents concurrent checks/installations, and the UI guards
  rapid clicks. Download failures keep the running app available. If launching
  the installer fails after backend shutdown, the error requests reopening the app.
- Ledger data and encryption keys are never sent to update servers. Native tests
  use a mock app, local HTTP fixtures and harmless signed bytes. No production
  vault or production credential is accessed during development or validation.

## Validation

- Backend: **354 passed, 1 skipped**.
- Frontend: **192 passed in 31 files**; TypeScript, ESLint and file-size checks pass.
- Native: **11 passed**, plus an opt-in published-artifact test. Coverage includes
  a real signed download, tampered bytes, a mismatched signed version, older
  versions, allowed installer URLs, cooldowns and legacy cache compatibility.
- `cargo fmt --check` passes. The production Tauri/NSIS build creates both the
  2.4.3 installer and its updater signature successfully.
- Browser verification uses the actual update components and provider with a
  development-only IPC fixture, simulated future version and simulated progress.
  Light/dark appearance, disabled controls while downloading, and failure/retry
  states were reviewed. This does not claim an actual NSIS installation/restart.
- The Windows SDK manifest tool embeds Common Controls v6 into Cargo's unit-test
  executable. Tauri embeds this dependency in the production executable itself.
  Use `scripts/test_desktop.ps1` for native tests on Windows.

## Building and publishing future releases

1. Bump Python, npm, Cargo and Tauri versions together. Keep the existing updater
   public key in `desktop/updater.pub` and `desktop/tauri.conf.json`.
2. Run `scripts/package_windows.ps1`, then `scripts/package_release.ps1`.
   Signing is automatic during the desktop build. The private identity is stored
   outside this checkout at `%USERPROFILE%\.openisave\signing\updater-key.dpapi`,
   encrypted with Windows DPAPI for the current Windows user. The build decrypts
   it in memory and restores the signing environment afterward. Private signing
   material must never enter source control, logs, source ZIPs or release assets.
   Retain the original identity securely: the DPAPI file is tied to this Windows
   user/profile. Do not generate a replacement key for existing installations.
3. Freeze the tested source, commit and push the branch and matching `v<version>`
   tag. Publish a stable GitHub release only after all five assets are uploaded:
   installer `.exe`, installer `.exe.sig`, source ZIP, `latest.json`, and
   `SHA256SUMS.txt`. The manifest points to the versioned installer, not to an
   unversioned download URL. Verify uploaded sizes/digests before making it latest.
4. After publication, run `scripts/test_desktop.ps1 -Published`. This reads the
   configured public manifest and downloads the full published installer through
   the actual updater, verifying both signature and signed version without
   executing it. It requires the latest release to match this checkout's version.
5. The complete install/restart journey should also be exercised from an older
   updater-enabled installation with isolated test data on the next release.
   Keep that separate from the live download verification and UI simulation.

Local logs, screenshots and publication reports belong in the ignored
`test-output/v2.4.3` and `release` directories.
