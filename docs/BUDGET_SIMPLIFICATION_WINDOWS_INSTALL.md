# Budget simplification — 2.4.0 Windows build / installation

Date: 2026-10-04. Source branch: `codex/budget-simplification`; base `5518852`.
Build includes the uncommitted local Budget implementation and version updates.
No commit, push, merge, PR or GitHub release was performed.

## Version decision

The handoff separates Budget simplification from the completed 2.3.0
presentation work. This additive feature, table and API change uses 2.4.0;
backend, root/frontend packages and locks, Cargo manifest/lock and Tauri
configuration are synchronised. The user explicitly authorised installing the
working tree before Git review, overriding the usual post-merge packaging order.
Historical 2.3.0 installers/source archives remain untouched.

## Build and quality gates

- Backend: 344 passed, 1 skipped (opt-in real WeChat sample).
- Frontend: 165 passed, 26 files (`--maxWorkers=2 --minWorkers=1`).
- Typecheck, lint, check:size: pass; 194 handwritten files, maximum 318 lines.
- Frontend production build: pass; existing large-chunk warning remains.
- PyInstaller: rebuilt successfully; the bundled `d9e5a1b7c302` migration
  matches its source SHA256. Packaged scratch sidecar reports 2.4.0, ready,
  and returns new overall-budget fields.
- Tauri release / NSIS: rebuilt successfully from fresh output directories.
  The harmless linker library-creation message is the only Rust warning.
- Old build output was moved into the git-ignored
  `docs/ui-review/budget-install/previous-builds/` after automatic approval
  review rejected recursive deletion. Dependencies, source, tests, docs,
  release history and production data were not deleted.

Installer: `release/OpenISave_2.4.0_x64-setup.exe` (22,329,445 bytes).
SHA256: `1abb1f9f55e96031df81a937c204a40292f930361e7c200612233166115a1de6`.
The release copy matches the just-built NSIS bundle byte-for-byte.
`release/SHA256SUMS.txt` and the 2.4.0 source ZIP were generated.

Built desktop EXE SHA256:
`b359aff251f6e904913edd66886aa5fbf811cc6b6631b2a97602ca03480e45ad`.

## Production baseline and installation state

The user authorised read-only counts/integrity checks. The audit opens the
existing SQLCipher file with URI `mode=ro` and `query_only=ON`; it never creates
a vault or key and never prints names, amounts, balances or secrets.

The historical read-only baseline passed cipher, DB and FK integrity checks
at schema `c4d8f2a6e913`, before the new `monthly_budgets` table existed.
Private record counts, original financial-row fingerprints and safety-backup
filenames are kept only in git-ignored local evidence, with no raw records or
keys in the source repository.

The new installer was launched through `explorer.exe` in the real Windows user
session. **Installation is currently waiting for the user to unlock Windows.**
LockApp and LogonUI are present; Computer Use input could not obtain geometry.
No lock-screen or authentication interaction was attempted. The installed EXE
and uninstall registry still report **2.3.0**. No production startup migration,
real-App Budget/Overview/theme verification or after-install counts are claimed.
Appearance is untouched. OpenISave and sidecar process counts are both zero.

## Resume after unlock

This installation state was last verified on 2026-10-04 and was not rechecked
for the subsequent source publication. The current publication request
authorises Git commits, a feature-branch push and a PR only; it does not
authorise executing the installation steps below. On 2026-10-07 the old
generated build archive was safely removed along with dependencies and current
build outputs; all release installers and source/config files were preserved.
No dependencies were reinstalled, installer rebuilt, real app launched or
production vault accessed for this publication.

1. Re-observe the real installer window; finish per-user overwrite installation.
2. Verify actual installed path, EXE/resources against the new build, and
   uninstall registry version 2.4.0.
3. Recheck the production baseline, launch the real installed app through
   Explorer, and let its existing safety-backup/startup migration flow run.
4. Verify new encrypted pre-migration safety backup, revision `d9e5a1b7c302`,
   empty new MonthlyBudget table, preserved original row fingerprints/counts.
5. Check Budget and Overview read-only, including legacy category budgets;
   never set, edit or clear a production budget.
6. Check Light/Dark/System and restore the original Appearance setting.
   Keep real names/amounts out of tool output and screenshots.
7. Close normally and verify both OpenISave and sidecar process counts are zero.
8. Update this report and DEVELOPMENT_HANDOFF with actual results; regenerate
   the source ZIP/checksum after documentation is final. Keep local diff only.
