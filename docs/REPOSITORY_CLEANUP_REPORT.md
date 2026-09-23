# Repository Cleanup Report

Date: 2026-09-22 · Version: OpenISave 2.0.0

Scope of this round: official app icon from `logo.png`, removal of build output
from the development folder, a clean Git-ready source tree, and a fresh Windows
installer. **No financial features, business logic or database schema were
changed.**

## Size

| | Size |
| --- | ---: |
| Project size before | **2,983 MB** (2.91 GB, 43,228 files) |
| Project size after — source only | **2.8 MB** (~260 files incl. `.git`) |
| Project size after — including `release/` | 23.1 MB |
| Space saved | **≈2,980 MB (2.91 GB)** |

After the clean rebuild used for verification, running
`scripts/clean_build_artifacts.ps1` a second time freed another 1.92 GB, which
confirms the script is repeatable.

## Largest causes of the old size

1. `desktop/target/` — **2,535 MB**: a release build (1,539 MB) *and* a stale
   debug build (996 MB) of the Tauri shell and its ~450 Rust crates.
2. `frontend/node_modules/` — 253 MB.
3. The PyInstaller backend bundle, four copies (`backend/build`, `backend/dist`,
   `desktop/binaries`, `desktop/target/*/binaries`) — ~135 MB.
4. `backend/.venv/` — 75 MB.

Full breakdown: [`PROJECT_SIZE_AUDIT.md`](PROJECT_SIZE_AUDIT.md).

## Directories removed

All regenerable, removed by `scripts/clean_build_artifacts.ps1`:

`desktop/target`, `desktop/binaries`, `desktop/gen`, `backend/.venv`,
`backend/build`, `backend/dist`, `backend/.pytest_cache`,
`backend/**/__pycache__` (15 folders), `frontend/node_modules`, `frontend/dist`,
`frontend/tsconfig.tsbuildinfo`, root `node_modules`.

Nothing else was deleted. Source, Alembic migrations, tests, docs, scripts,
lockfiles, icons and `logo.png` are intact.

## Directories excluded by Git

`.gitignore` excludes: `node_modules/`, `.venv/`, `venv/`, `env/`, `target/`,
`dist/`, `build/`, `backend/build/`, `backend/dist/`, `desktop/gen/`,
`desktop/binaries/`, `coverage/`, `htmlcov/`, `__pycache__/`, `.pytest_cache/`,
`.ruff_cache/`, `.mypy_cache/`, `*.pyc`, `*.tsbuildinfo`, `/release/`, installers
(`*-setup.exe`, `*.msi`, `*.zip`), all database files (`*.db`, `*.db-wal`,
`*.db-shm`, `*.sqlite`, `*.sqlite3`), `data/`, `backups/`, `logs/`, `*.log`,
`*.csv`, `.env` / `.env.*` (except `.env.example`), keys and certificates, IDE
and Windows temporary files.

Verified still included: `package-lock.json`, `frontend/package-lock.json`,
`desktop/Cargo.lock`, `backend/alembic/versions/*`, `backend/openisave_server.spec`,
all source and test files, `docs/`, `scripts/`, `logo.png`, `desktop/icons/*`.

## App icon

`logo.png` (1254 × 1254, transparent) is the canonical icon. `desktop/icons/`
was regenerated with the official `npx tauri icon logo.png -o desktop/icons`
(Tauri CLI 2.11.5): `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`,
`icon.png`, `icon.ico` (16/24/32/48/64/256 px), `icon.icns` and the
`Square*Logo.png` / `StoreLogo.png` set. The unused `android/` and `ios/` sets
were removed. The logo was not cropped, stretched or edited. The whole square
canvas is scaled, so aspect ratio and transparency are preserved.

Inside the app, the "OI" letter badge in the sidebar and on the startup screen
was replaced with the logo (`frontend/src/components/common/BrandMark.tsx`,
using `frontend/src/assets/logo.png`, the 256 px icon generated from
`logo.png`). This change is presentation only.

`desktop/tauri.conf.json` now lists `icon.icns` too, and sets
`bundle.windows.nsis.installerIcon` to `icons/icon.ico`. Verified on the
installed build: the executable, window title bar, Start Menu shortcut, Desktop
shortcut, Apps & Features entry (`DisplayIcon` = the exe) and the installer all
show the new logo.

## Release

| File | Size | SHA-256 |
| --- | ---: | --- |
| `release/OpenISave_2.0.0_x64-setup.exe` | 18.4 MB (19,255,425 bytes) | `2039b2c026f49bfe8c05dd86b803ba2a123653d1ba97a259ab68b6d0a85a34c5` |
| `release/OpenISave2-v2.0.0-source.zip` | ≈2.0 MB | see `release/SHA256SUMS.txt`\* |

\* The source ZIP contains this report, so the report can't include the ZIP's
own hash. `release/SHA256SUMS.txt` is authoritative for both files.

The installer is also produced at
`desktop/target/release/bundle/nsis/OpenISave_2.0.0_x64-setup.exe` by a build,
but `desktop/target` is not kept. Publish the installer as a GitHub Release
asset. Regenerate the release folder with `scripts/package_release.ps1`.

The source ZIP is built from `git ls-files` (tracked plus non-ignored files). The
script refuses to package any path under `node_modules`, `.venv`, `target`,
`dist`, `build`, `backups`, `logs`, `data` or `release`, any `.db`, `.sqlite*`,
`.log`, `.csv` or `.env` file, and any file with a SQLite header.

## Personal-data and secret scan

- No `*.db`, `*.sqlite*`, `*.log`, `*.csv` or `.env` file exists in the source
  tree or the ZIP. No file in the source starts with a SQLite header.
- No API keys, tokens, passwords, private keys, e-mail addresses or local user
  paths were found in source, docs or lockfiles.
- The real database was opened **read-only** and its user-entered names and
  amounts were compared against every source file. The matches are the generic
  smoke-test fixtures already in `backend/tests/` and the implementation status
  docs (e.g. "Monzo", "HSBC Savings", "Emergency Fund", round amounts such as
  50,000). They are test scenarios, not personal records. Your real database
  holds no accounts or transactions yet.
- `docs/OPENISAVE2_PROJECT_ARCHITECTURE.md` was added as a copy of the
  architecture charter that previously lived outside the repository
  (`../OPENISAVE2_PROJECT_ARCHITECTURE.md`, left in place). It has no personal
  data.

## Tests (from a fully cleaned state)

| Check | Result |
| --- | --- |
| Backend: new `.venv` (Python 3.11.0), `pip install -r requirements-dev.txt` | ✅ |
| Backend: `alembic upgrade head` (against a **scratch** data root) | ✅ `042bb366d803 (head)` |
| Backend: `pytest` | ✅ 157 passed |
| Frontend: `npm ci` | ✅ |
| Frontend: `npm run typecheck` / `lint` | ✅ / ✅ |
| Frontend: `npm test` | ✅ 26 passed (5 files) |
| Frontend: `npm run check:size` / `build` | ✅ / ✅ |
| Desktop: PyInstaller sidecar (`build_backend.ps1`) | ✅ |
| Desktop: Tauri release build + NSIS installer | ✅ (Rust release build 3 m 49 s) |

**All tests passed.** The clean rebuild confirms that the cleanup script removes
only regenerable files.

## Installer smoke test

Run as a normal user process (outside the Claude desktop app's MSIX
file-system virtualization, so it reflects a real install):

- Silent install (`/S`): exit 0, installed to `%LOCALAPPDATA%\OpenISave\`,
  Apps entry "OpenISave 2.0.0", Start Menu and Desktop shortcuts → `openisave.exe`.
- Launch: window "OpenISave" opened and rendered the Overview page. The backend
  sidecar started as a child process, bound to `127.0.0.1` only, answered
  `/api/v1/health` with 200 and served `/api/v1/accounts`.
- Close: the app exited normally. **0 `openisave.exe` / `openisave-server.exe`
  processes remained** (no orphans).

After the in-app logo change, a second full clean rebuild passed all the same
checks. The rebuilt installer was installed over the first one (upgrade path)
and passed the same smoke test: the sidebar shows the logo, 0 orphan
processes, and the data files have unchanged hashes.

**Installer smoke-tested: yes.**

## User financial data

**Untouched.** `%LOCALAPPDATA%\OpenISave2\data\finance.db` and `finance.db-wal`
have byte-identical SHA-256 hashes before and after the cleanup, rebuild,
install and app launch. The logical content digest of every table is also
identical (`cd779a65…`). The schema was already at head, so the app ran no
migration and made no backup. Only the app's own log lines and SQLite's
transient `finance.db-shm` index changed. Nothing was reset, migrated manually,
copied into the repository, renamed or deleted.

One incident during verification: a read-only probe run through a packaged
Python 3.14 created an **empty (0-byte)** file,
`%LOCALAPPDATA%\OpenISave2\backups\finance-20260922-162131-before-v2-smoketest.db`,
because that backup did not exist in the real folder. It contained nothing.
With the owner's approval it was deleted (from outside the MSIX container, and
only after re-checking that it was 0 bytes). The real `backups\` folder is back
to its original empty state. `finance.db` and `finance.db-wal` hashes were
re-checked afterwards and are unchanged.

Note on the previous installation: an earlier smoke test was run from inside the
Claude desktop app, so its install and data went to the app's virtualized folder
`%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\` (`OpenISave\`,
`OpenISave2\`) instead of the real locations. That virtualized copy was not
modified. This round's install went to the real location, and both shortcuts
now point to the real executable.

## Git

- The folder was not a Git repository. `git init -b main` was run. No commit
  was made and **nothing was pushed**. No GitHub repository was created.
- `git status` shows only source files as untracked (no build output, databases
  or logs).
