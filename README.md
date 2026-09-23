# OpenISave 2.0

A local-first, multi-currency personal finance manager with CNY-based consolidated
reporting, purpose-based bank account management, physical asset tracking, savings
goals, budgeting and auditable financial history.

Everything lives on your own machine. The only outbound network request is for
exchange rates, and it sends nothing but currency codes.

> The architectural rules for this project are defined in
> [`docs/OPENISAVE2_PROJECT_ARCHITECTURE.md`](docs/OPENISAVE2_PROJECT_ARCHITECTURE.md).
> See [`docs/V2_IMPLEMENTATION_STATUS.md`](docs/V2_IMPLEMENTATION_STATUS.md) for
> what this version does and does not yet cover.

---

## Install and use

OpenISave is a Windows 10/11 (x64) desktop application. There is no terminal, no
server to start and nothing to configure.

1. **Download the installer** — `OpenISave_2.0.0_x64-setup.exe` from the
   repository's **Releases** page (verify it against `SHA256SUMS.txt` if you like).
2. **Install** — run the installer. It installs for the current user only, needs
   no administrator rights, adds a Start menu shortcut and offers a desktop
   shortcut.
3. **Launch OpenISave** — from the Start menu or the desktop shortcut.

The app starts its own local data service, and stops it again when you close the
window. Upgrading or reinstalling never touches your data.

> **Financial data is NOT stored in the Git repository.** Your database, backups
> and logs live only in `%LOCALAPPDATA%\OpenISave2\` on your own computer (see
> [Where your data lives](#where-your-data-lives)). Neither the source code, the
> installer nor the source package contains any financial data.

### First run

The database starts empty — no sample accounts, balances or transactions.

1. Open **Accounts** and add the accounts you actually use, with their real
   opening balances.
2. Open **Settings** and press **Refresh** once so exchange rates are cached.
3. Record income and expenses under **Transactions**; use **Transfer** to move
   money between your own accounts.
4. Optionally add **Assets** you own, a savings **Goal**, and a monthly **Budget**.

---

## What it does

- **Accounts** — bank, cash, e-wallet, savings, credit card, loan and asset
  accounts, each in its own currency with an opening balance and a purpose.
- **Transactions** — income, expenses and account-to-account transfers, with
  hierarchical categories, filtering and a full history.
- **Assets** — the things you own, with purchase price, valuation history, days
  held, cost per day, and effective cost per day once sold.
- **Liabilities** — loans and instalment financing, optionally linked to the
  asset they paid for, with a single authoritative outstanding balance.
- **Goals** — savings targets that aggregate several accounts across currencies.
- **Budget** — monthly limits per category, with actuals derived from the ledger.
- **Categories** — a full manager for the expense and income trees.
- **Reports** — a monthly report with cash flow, category breakdowns, account
  movement, budget variance and goal progress.
- **Multi-currency** — balances stay in their native currency; consolidated
  figures are reported in CNY. Each transaction freezes the exchange rate it was
  recorded with, so past months never change.

---

## Where your data lives

```text
%LOCALAPPDATA%\OpenISave2\
├── data\finance.db      the database
├── backups\             copies taken before every schema migration
└── logs\openisave2.log  event log (never contains amounts)
```

Nothing is written inside the repository or the installation folder, so
reinstalling or upgrading OpenISave never touches your database. The
repository's `.gitignore` additionally blocks `*.db`, `*.sqlite*`, `backups/`,
`logs/`, CSV exports and `.env` files, so a stray copy can't be committed by
accident. The app applies
its own schema migrations on startup, taking a backup first.

To move an existing database to this computer (or into a fresh install), close
OpenISave and copy the file into place; it is migrated automatically on the next
launch:

```bash
Copy-Item "C:\path\to\finance.db" "$env:LOCALAPPDATA\OpenISave2\data\finance.db"
```

To erase everything and start over (a timestamped backup is taken first):

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\reset_database.ps1
```

---

## Developer setup

The repository contains source only. Dependencies, virtual environments and
build output (`node_modules/`, `.venv/`, `desktop/target/`, `dist/` …) are not
committed; the commands below recreate all of them.

### Quick start from a fresh clone

```bash
git clone <your-repository-url> OpenISave2
```

Then, from inside the `OpenISave2` folder:

```bash
py -3.11 -m venv backend\.venv
```

```bash
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
```

```bash
npm ci --prefix frontend
```

```bash
npm ci
```

These create the Python virtual environment and install the backend
dependencies (FastAPI, SQLAlchemy, Alembic, pytest, PyInstaller), the frontend
dependencies, and the Tauri CLI used to build the desktop app.
`scripts\start_backend.ps1` also creates the virtual environment on first run.

### Requirements

| Tool           | Version                                            |
| -------------- | -------------------------------------------------- |
| Python         | 3.11 or newer (built and tested on 3.11)            |
| Node           | 20 or newer (tested on 24)                          |
| Rust           | 1.77 or newer — only needed to build the desktop app |
| MSVC build tools | Only needed to build the desktop app              |

Tauri prerequisites on Windows are Rust, the MSVC C++ build tools and the
WebView2 runtime (preinstalled on Windows 10/11). Rust and the build tools:

```bash
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

### Browser development mode

Two terminals. This is the fastest loop for UI work.

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1
```

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\start_frontend.ps1
```

Then open http://127.0.0.1:5173.

| What              | Address                             |
| ----------------- | ----------------------------------- |
| The application   | http://127.0.0.1:5173               |
| API               | http://127.0.0.1:8756/api/v1        |
| API documentation | http://127.0.0.1:8756/docs          |
| Health check      | http://127.0.0.1:8756/api/v1/health |

The API binds to `127.0.0.1` only and is never exposed to your network.

Manual setup, if you prefer it:

```bash
cd backend && py -3.11 -m venv .venv && .venv\Scripts\Activate.ps1 && pip install -r requirements-dev.txt && alembic upgrade head && python -m uvicorn app.main:app --host 127.0.0.1 --port 8756
```

```bash
cd frontend && npm install && npm run dev
```

### Desktop development mode

Start the backend as above, then:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\start_desktop_dev.ps1
```

This opens the real desktop window against the Vite dev server, so the UI still
hot-reloads. No sidecar is bundled in this mode.

---

## Building the installer

One command, from the project root:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\package_windows.ps1
```

It runs the quality gates, bundles the backend with PyInstaller, builds the
Tauri app and prints where the installer landed:

```text
desktop\target\release\bundle\nsis\OpenISave_2.0.0_x64-setup.exe
```

The installer is per-user (no administrator rights needed) and creates a Start
menu shortcut. A desktop shortcut is offered as a checkbox during installation.

Individual steps, if you need them:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build_backend.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\build_desktop.ps1 -SkipBackend
```

Installers are published as **GitHub Release** assets, never committed. To
assemble the files for a release:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\package_release.ps1
```

It writes `release\OpenISave_<version>_x64-setup.exe`,
`release\OpenISave2-v<version>-source.zip` (exactly the files Git would commit)
and `release\SHA256SUMS.txt`. The `release/` folder is git-ignored.

### App icon

`logo.png` is the single source for every application icon. After changing it,
regenerate `desktop/icons/` with the official Tauri command and rebuild:

```bash
npx tauri icon logo.png -o desktop/icons
```

(The `android/` and `ios/` folders it also creates are not used by this
Windows-only app and can be deleted.) The in-app logo,
`frontend/src/assets/logo.png`, is a copy of `desktop/icons/128x128@2x.png`, so
copy it again after regenerating.

### Cleaning build output

A full build leaves about 3 GB of regenerable output, mostly Rust's
`desktop/target/`. To reclaim it:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\clean_build_artifacts.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\clean_build_artifacts.ps1
```

It removes only an explicit list of regenerable folders (`desktop/target`,
`node_modules`, `.venv`, PyInstaller `build`/`dist`, `__pycache__` …) and prints
the size before and after. It never touches source, migrations, docs, lockfiles,
icons or anything in `%LOCALAPPDATA%\OpenISave2`. See
[`docs/PROJECT_SIZE_AUDIT.md`](docs/PROJECT_SIZE_AUDIT.md).

---

## Checks

### Backend tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest
```

### Frontend

```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:size
```

`check:size` enforces the architecture's hard rule that no handwritten frontend
file exceeds 350 lines. It is also available as:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\check_frontend_size.ps1
```

---

## Exchange rates

Rates come from [Frankfurter](https://frankfurter.dev) (European Central Bank
reference data) and are cached locally, so the app keeps working offline.

When no rate is available OpenISave **refuses the conversion** rather than
assuming a rate of 1. Settings shows the freshness of every pair and lets you
enter a manual rate when you need one.

A transaction stores the rate it was created with, so a historical month's CNY
figures never move. Current net worth uses the latest available rate.

---

## Project layout

```text
OpenISave2/
├── backend/
│   ├── app/
│   │   ├── api/v1/        HTTP routes
│   │   ├── core/          config, money, enums, errors, logging
│   │   ├── db/            engine, session, seed data, startup migration
│   │   ├── models/        SQLAlchemy tables
│   │   ├── repositories/  database queries
│   │   ├── schemas/       Pydantic request/response models
│   │   ├── services/      financial rules and workflows
│   │   └── providers/fx/  exchange rate providers
│   ├── alembic/           migrations
│   ├── openisave_server.spec  PyInstaller bundle definition
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/           one module per resource
│       ├── app/           router, providers, theme
│       ├── components/    layout, charts, forms, shared UI
│       ├── features/      one folder per page
│       ├── hooks/         TanStack Query hooks
│       ├── types/         shared TypeScript types
│       └── utils/         money, dates, labels, forms
├── desktop/               Tauri shell (Rust) + app icons generated from logo.png
├── docs/                  architecture charter, status, audits
├── scripts/               PowerShell helpers (dev, build, package, clean)
└── logo.png               canonical app logo
```

The React app never talks to the database. Every request goes
frontend → REST API → service layer → repository → SQLAlchemy → SQLite.

---

## Notes on correctness

- Money is stored as integer minor units (fen, pence) plus a currency code.
  Binary floats are never used for money; Python calculations use `Decimal`.
- Transfers are never counted as income or expense and never change net worth.
- Buying an asset moves value rather than spending it, so net worth is unchanged.
- Outstanding debt has exactly one home: the liability account's balance.
- Net worth is calculated in exactly one place (`NetWorthService`).
- Deleting a transaction voids it: the record stays for auditability.
- A category in use is archived, never deleted, so history keeps rendering.
- Savings goals label money that already exists; they never duplicate it, even
  when one account funds several goals.
