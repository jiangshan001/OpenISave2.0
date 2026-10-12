# OpenISave 2.4.2

## Changes

- The supplied transparent PNG is preserved byte for byte as `logo.png`.
  Tauri's generated PNG, ICO and ICNS assets and the in-app logo use that mark.
- Light mode uses ivory surfaces, a rose action/selection accent, warm borders,
  and an apricot/peach/mauve net-worth panel with dark plum foregrounds.
- Ant Design controls, charts, the activity heatmap, navigation, savings goals,
  focus/selection and overlays follow the light palette. Net-worth allocation
  colours now follow the active theme rather than always using dark colours.
- Existing dark UI/chart palettes and existing dark CSS token values are
  unchanged. Shared styles gained tokens to preserve their previous dark values.
- Version metadata is 2.4.2 across Python, npm, Cargo and Tauri.
- Rust formatting was normalized; update checking and financial logic are unchanged.
  This release adds no schema migration.

## Verification before publication

- Backend: 354 passed, 1 skipped (355 collected).
- Frontend: 183 passed in 30 files; after the net-worth allocation adjustment,
  the affected theme/hero suites passed again (17 tests). TypeScript, ESLint,
  production build and the 350-line file-size gate passed.
- Rust: six updater tests passed; `cargo fmt --check` passed.
- Icon source SHA256: `40a8a64f7ace7bb0ba991e5f184b7442fcaed1b93832c420f7d3d1ffb7496fbd`.
  Source transparency, PNG/ICO dimensions and the shared 256px in-app icon passed.
- 37 light foreground/background pairs passed WCAG AA; minimum checked ratio
  was 4.55:1. Existing dark palette objects and CSS token values were compared
  with the previous release and remain identical.
- Synthetic browser review covered the overview, transaction modal, settings,
  light/dark switching and the 1024px minimum desktop window with no horizontal
  overflow. Development logs contain existing Ant Design warnings about a
  deprecated InputNumber prop and circular references.
- Test data and test keys use isolated temporary paths. The production vault
  and production credential are not accessed. Screenshots and diagnostic scripts
  are ignored local artifacts in `test-output/v2.4.2`.

## Release and future-version check

The Windows installer, source ZIP and SHA256SUMS are produced by the existing
package scripts. Publish only a complete stable release with the matching
`OpenISave_2.4.2_x64-setup.exe` asset, which the 2.4.1 updater requires.

After publication, run the exact 2.4.1 `updates.rs` source in an isolated probe
against the unauthenticated public latest-release endpoint. Check 2.4.1 versus
2.4.2, already-current 2.4.2, daily cooldown/manual override, version dismissal
and atomic cache persistence. Check the unchanged update badge/card UI against
that live response using a development-only native IPC bridge; this is distinct
from operating the user's installed application.

Keep the installed 2.4.1 app available for the user's manual end-to-end test:
Settings → App updates → Check for updates → Open download page. A successful
background check has a 24-hour cooldown; the explicit button bypasses it.
Installation is deliberately left to the user so the previous-version notice
can be experienced before upgrading.
