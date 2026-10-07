# OpenISave — Development Handoff

> **Read this first.** This file is the entry point for any developer or agent
> (Claude, Codex, …) picking up OpenISave. After reading it you should know
> what the product is, how it is built, which rules must never be broken, how
> to develop and test safely, and what to do next.
>
> Deeper references, in order of usefulness:
> [`SECURITY_AND_DATA_STORAGE.md`](SECURITY_AND_DATA_STORAGE.md) (vault, keys,
> backups, recovery) ·
> [`V2_3_IMPLEMENTATION_STATUS.md`](V2_3_IMPLEMENTATION_STATUS.md) (themes, visual system,
> account identity, goal milestones) ·
> [`BUDGET_SIMPLIFICATION_IMPLEMENTATION.md`](BUDGET_SIMPLIFICATION_IMPLEMENTATION.md)
> (overall monthly budget and optional category budgets) ·
> [`BUDGET_SIMPLIFICATION_WINDOWS_INSTALL.md`](BUDGET_SIMPLIFICATION_WINDOWS_INSTALL.md)
> (2.4.0 build/install evidence and current unlock blocker) ·
> [`V2_2_IMPLEMENTATION_STATUS.md`](V2_2_IMPLEMENTATION_STATUS.md) (recurring +
> import details) ·
> [`OPENISAVE2_PROJECT_ARCHITECTURE.md`](OPENISAVE2_PROJECT_ARCHITECTURE.md)
> (the original ~3,000-line architecture charter; authoritative on design
> intent) · [`../README.md`](../README.md) (user-facing, setup commands).
> If this file and the code disagree, **the code wins** — then fix this file.

---

## Contents

- [A. Project overview](#a-project-overview)
- [B. High-level architecture](#b-high-level-architecture)
- [C. Repository structure](#c-repository-structure)
- [D. Data and security](#d-data-and-security)
- [E. Financial invariants](#e-financial-invariants)
- [F. Current features](#f-current-features)
- [G. UI and design system](#g-ui-and-design-system)
- [H. Recurring transactions](#h-recurring-transactions)
- [I. WeChat statement import](#i-wechat-statement-import)
- [J. Database and Alembic](#j-database-and-alembic)
- [K. Testing](#k-testing)
- [L. Desktop packaging](#l-desktop-packaging)
- [M. Git and release workflow](#m-git-and-release-workflow)
- [N. Safety rules for future agents](#n-safety-rules-for-future-agents)
- [O. Known limitations and technical debt](#o-known-limitations-and-technical-debt)
- [P. Recommended next steps](#p-recommended-next-steps)
- [Q. Git state at the time of writing](#q-git-state-at-the-time-of-writing)

---

## A. Project overview

**OpenISave** is a **local-first, privacy-first, multi-currency personal
finance and wealth manager** for Windows. It tracks bank and e-wallet
accounts, income, expenses, transfers, assets, liabilities, goals and
budgets, and reports everything consolidated in **CNY** while each account
keeps its own native currency.

| | |
|---|---|
| Current version | **2.4.0** (Budget simplification; source publication authorised through a feature-branch PR); separate from the presentation-only 2.3.0 release |
| Platform | Windows 10/11 x64 desktop app (only Windows is built and tested) |
| Frontend | React 18 + TypeScript + Vite, Ant Design 5, TanStack Query, Recharts |
| Backend | Python 3.11, FastAPI, Pydantic, SQLAlchemy 2, Alembic |
| Storage | SQLite encrypted with **SQLCipher 4** (`sqlcipher3` module) |
| Key storage | Windows Credential Manager (via `keyring` WinVault backend) |
| Desktop shell | **Tauri 2** (Rust), NSIS installer |
| Backend bundling | **PyInstaller** (one-folder sidecar) |
| FX | Frankfurter (ECB reference rates), cached locally; manual rates allowed |
| Reporting currency | CNY |

Product principles: all data stays on the user's machine; the only outbound
network request is for exchange rates and it sends nothing but currency
codes; no accounts, no cloud, no telemetry, no AI.

Product state at 2.3.0:

- secure local-first finance manager: **SQLCipher-encrypted vault**, key in
  **Windows Credential Manager**, scheduled / manual / safety **backups**,
  recovery key and restore;
- **multi-currency** ledger with CNY consolidation and frozen historical FX;
- **recurring transactions** (review-first or automatic);
- **WeChat Pay statement import** with **deterministic categorisation** rules;
- **Light / Dark / System** appearance and a premium, restrained visual
  system (section G);
- **personalised account cards** (institution / type identity, no logos);
- **milestone-based savings goals**.

---

## B. High-level architecture

```text
React (frontend/src)
   │  fetch, JSON only
   ▼
REST API  http://127.0.0.1:<port>/api/v1     (loopback only; Host header checked)
   │
   ▼
FastAPI routes      backend/app/api/v1/*.py         thin: validate, call a service
   │
   ▼
Service layer       backend/app/services/*.py       ALL financial rules live here
   │
   ▼
Repositories        backend/app/repositories/*.py   queries
   │
   ▼
SQLAlchemy models   backend/app/models/*.py
   │
   ▼
SQLCipher SQLite    %LOCALAPPDATA%\OpenISave2Data\vault\finance.db
```

- **The frontend never touches the database.** It has no DB driver and no
  file access to the vault; everything goes through the REST API.
- **Financial calculations live in the backend service layer only.** The
  frontend formats and displays numbers it receives; it must not recompute
  balances, net worth, FX conversions, budget actuals or report totals.
- Net worth is computed in exactly one place: `NetWorthService`
  (`backend/app/services/networth_service.py`).
- Every ledger write — manual, recurring or imported — goes through
  `LedgerService` (`backend/app/services/ledger_service.py`), which creates
  balanced postings and freezes FX.
- Until the vault is unlocked the API only answers `/health`,
  `/security/status` and the recovery endpoints; every data endpoint returns
  HTTP 423.

In the desktop app, Tauri starts the backend sidecar on a random free
loopback port and injects that URL into the webview. In browser development
mode the backend runs on `127.0.0.1:8756` and Vite on `127.0.0.1:5173`.

---

## C. Repository structure

```text
OpenISave2/
├── backend/            FastAPI app, Alembic migrations, pytest suite, PyInstaller spec
├── frontend/           React + TypeScript + Vite app
├── desktop/            Tauri 2 shell (Rust), icons, NSIS config
├── docs/               architecture charter, status reports, security doc, this file
├── scripts/            PowerShell: start dev servers, build, package, clean, size check
├── release/            (git-ignored) assembled installers + source zip + SHA256SUMS
├── logo.png            canonical app icon source
├── package.json        root: Tauri CLI only (desktop:dev / desktop:build)
└── README.md           user-facing overview + developer quick start
```

### backend/app/

| Folder | Contents |
|---|---|
| `api/v1/` | Routers: `accounts`, `transactions`, `assets`, `liabilities`, `goals`, `budgets`, `categories`, `reports`, `fx`, `settings`, `security`, `recurring`, `imports`, `rules`; `router.py` mounts them. `api/deps.py` wires the DB session and services into routes via FastAPI dependencies. |
| `core/` | `config.py` (settings, `APP_VERSION`, data-root resolution), `money.py` (Decimal ↔ minor units), `enums.py`, `exceptions.py`, `logging.py` |
| `db/` | `engine.py` (SQLCipher keyed engine), `session.py`, `bootstrap.py` (Alembic config, head revision, startup migration), `seed.py` (idempotent currencies, settings, categories, asset categories, built-in categorisation rules) |
| `models/` | SQLAlchemy tables: account, transaction, posting, category, currency, fx_rate, asset, liability, goal, budget, setting, `recurring.py`, `statement_import.py` |
| `repositories/` | Query helpers per aggregate |
| `schemas/` | Pydantic request/response models |
| `services/` | Business logic: `ledger_service`, `account_service`, `networth_service`, `dashboard_service`, `activity_service`, `report_service`, `budget_service`, `goal_service`, `asset_service`, `liability_service`, `category_service`, `fx_service`, `recurrence` (pure date maths), `recurring_service`, `statement_import_service`, `import_preview`, `import_staging`, `categorisation_service` |
| `importers/` | `base.py` (`StatementImporter` protocol + registry), `wechat.py` (WeChat Pay XLSX parser) |
| `providers/fx/` | `base.py` (`FxProvider`), `frankfurter.py` |
| `security/` | `runtime.py` (vault state machine: locked/ready/recovery), `keystore.py` (Credential Manager / memory store), `cipher.py`, `backups.py` (rotation + verification), `recovery.py` (recovery key), `migration.py` (2.0 plaintext → encrypted), `storage_meta.py`, `fingerprint.py`, `secure_delete.py` |

Also: `backend/alembic/versions/` (migrations), `backend/tests/` (pytest;
`conftest.py` isolates every test run), `backend/openisave_server.spec`
(PyInstaller), `backend/run_server.py` (sidecar entry point).

### frontend/src/

| Folder | Contents |
|---|---|
| `features/` | One folder per page: `dashboard` (Overview), `transactions`, `recurring`, `imports` (WeChat import wizard), `accounts`, `assets`, `goals`, `budgets`, `categories`, `rules` (auto-categorisation rules), `reports`, `settings` (incl. Data & Security, Recovery Key) |
| `components/` | `layout` (AppLayout, Sidebar, `navItems.tsx`, FxStatusBadge), `charts` (chartTheme, tooltips, cash flow, category pie), `common` (PageHeader, StatCard, Meter, EmptyState, `AccountMonogram`, `GoalGlyph`, `MilestoneProgress`), `forms` |
| `api/` | `client.ts` (base URL from Tauri runtime or dev default) and one module per resource |
| `hooks/` | TanStack Query hooks + `queryKeys.ts` |
| `types/` | Shared TypeScript types mirroring backend schemas |
| `styles/` | `tokens.css` (light + dark design tokens), `global.css`, `shell.css`, `nav.css` (sidebar items), `controls.css`, `interactions.css` (button micro-interactions), `overlays.css`, `toolbar.css`, `cards.css`, `accountThemes.css`, `goals.css`, `milestones.css`, `charts.css`, `overview.css`, `heatmap.css`, `settings.css`, `startup.css`, `imports.css` |
| `theme/` | Appearance (Light / Dark / System): `appearance.ts` (preference in `localStorage["openisave.appearance"]`, applied to `<html data-theme>`), `ThemeProvider.tsx`, `antdTheme.ts` (`createTheme(mode)`), `palette.ts`, `chartPalette.ts` (`useChartPalette()`), `AppearanceSwitch.tsx`; presentation resolvers `accountTheme.ts` (`resolveAccountTheme()`), `goalTheme.ts` (`resolveGoalTheme()`, milestones, copy), `milestoneMemory.ts` |
| `utils/` | money/date formatting, labels, form helpers |
| `app/` | router, providers, `SecurityGate` (locked/recovery screens), `StartupScreen` |
| `test/` | Vitest setup and synthetic fixtures |

### scripts/

`start_backend.ps1`, `start_frontend.ps1`, `start_desktop_dev.ps1`,
`start_openisave.ps1`, `build_backend.ps1` (PyInstaller),
`build_desktop.ps1` (Tauri), `package_windows.ps1` (gates + full build),
`package_release.ps1` (assemble `release/`), `clean_build_artifacts.ps1`,
`check_frontend_size.ps1`.

---

## D. Data and security

### Production data location

```text
%LOCALAPPDATA%\OpenISave2Data\
├── vault\finance.db        SQLCipher-encrypted database — the only live copy
├── backups\
│   ├── daily\    7 kept    first startup of each day
│   ├── weekly\   4 kept    first startup of each ISO week
│   ├── monthly\  12 kept   first startup of each month
│   ├── manual\   20 kept   Settings → Data & Security → Back Up Now
│   └── safety\   10 kept   automatically before any migration or restore
├── config\storage.json     non-secret metadata (never a key)
├── logs\openisave2.log     events and ids only — never amounts, names or keys
└── migration\<timestamp>\  2.0 → 2.1 migration report (+ plaintext rollback copy until removed)
```

The pre-2.1 plaintext data lived in `%LOCALAPPDATA%\OpenISave2\`; 2.1+
migrates it once, verified, and leaves it as a rollback until the user
removes it. The installation folder (`%LOCALAPPDATA%\OpenISave\`) never
contains data.

### Encryption and keys

- Database: **SQLCipher 4** (AES-256, per-page HMAC-SHA512). Every backup is
  also an encrypted SQLCipher file, made with `VACUUM INTO` and verified
  (`cipher_integrity_check`, `integrity_check`, not readable as plain SQLite)
  before it gets its final name.
- **Ordinary SQLite tools cannot open the production DB or any backup**
  ("file is not a database"). Do not "fix" this.
- Key: a random 256-bit key in **Windows Credential Manager**, target
  `OpenISave2/DatabaseEncryptionKey`. Never written to disk, `.env`, config,
  logs, or sent to the frontend.
- **Recovery Key**: the user must actively export it (Settings → Data &
  Security → Export Recovery Key). It is the only way back in if Credential
  Manager is lost (new PC, reinstalled Windows).
- Before any schema migration or restore, the app takes an encrypted
  **safety backup** automatically.

### Development data

> **NEVER reset, delete, overwrite or "clean up" production data during
> development. NEVER point tests or experiments at the production vault.**

- Tests: `backend/tests/conftest.py` sets `OPENISAVE_DATA_ROOT` to a temp
  directory, an in-memory key store and a test Credential Manager service
  name *before* the app is imported, and asserts the data root is under the
  temp folder. Keep it that way; new test modules must import through it.
- Manual development: set `OPENISAVE_DEV_LOCAL_DATA=1` before starting the
  backend. It then uses a repo-local scratch vault (`backend/.localdata/`,
  git-ignored) with its own Credential Manager entry
  (`OpenISave2-Dev/DatabaseEncryptionKey`) and never looks at real or legacy
  data. **Without it, `start_backend.ps1` opens the real vault.**
- The Alembic CLI (`alembic upgrade`) run from `backend/` unlocks the
  **production** vault. Don't use it for experiments; run migrations against
  a scratch database by passing a connection via
  `config.attributes["connection"]` (see `tests/test_security_storage.py`).
- Sandboxed agent shells (e.g. an MSIX-packaged desktop agent) may silently
  redirect `%LOCALAPPDATA%` writes. An installer or app launched from such a
  shell can end up in a virtualised copy — changing neither the real install
  nor the real vault while appearing to succeed. Launch real installs outside
  the sandbox (e.g. via `explorer.exe`) and verify from the user's session.

---

## E. Financial invariants

These are the rules the whole codebase is built around. Breaking one is a
data-corruption bug even if every test is green. Change one only with an
explicit decision from the user, a migration, and tests.

1. **Money is stored as integer minor units** (fen, pence, yen) plus a
   currency code. See `app/core/money.py`.
2. **Python uses `Decimal`, never `float`, for money.** Conversions use
   `ROUND_HALF_UP` at the currency's scale. Parsed statement amounts go
   string/Decimal → minor units.
3. **CNY is the consolidated reporting currency.**
4. **Native account currency is preserved.** Balances are stored and shown
   in the account's own currency; CNY figures are derived.
5. **Historical FX is frozen per transaction.** Each transaction stores the
   rate it was recorded with, so past months never change. Current net worth
   uses the latest available rate.
6. **Missing FX never defaults to 1.0.** No rate → the conversion is refused
   and surfaced (FX status badge, manual rate entry).
7. **A transfer is neither income nor expense** and never changes net worth.
   Same for moving money into savings / 零钱通 / credit-card repayment.
8. **Net worth is calculated centrally** in `NetWorthService`, nowhere else.
9. **Personal possessions** (electronics, vehicles, furniture, collectibles…)
   are **excluded from net worth by default**; they are tracked and shown as
   a reference value. Classification comes from the asset category default
   (`asset_categories.include_in_net_worth_default`) and can be overridden
   per asset (`include_in_net_worth_manual`). Changing it never alters ledger
   history. Buying an asset is never an expense.
10. **Property, investments and savings may count** toward net worth
    (property by category default; investment/savings/provident-fund
    accounts are balance-sheet accounts).
11. **Goals do not duplicate money.** A goal labels balances that already
    exist, even when one account funds several goals.
12. **A liability's outstanding balance has one source of truth**: the
    liability account's balance.
13. **Deleting a transaction voids it.** The record stays for audit; voided
    rows are excluded from balances and reports. Categories in use are
    archived, not deleted.
14. **Imported transaction identity is enforced in the database**:
    `UNIQUE(source, external_id)` on `external_transaction_refs`;
    recurring occurrences by `UNIQUE(rule_id, occurrence_date)`.
15. **Financial calculations are never duplicated in the frontend.**

---

## F. Current features

| Module | Key behaviour |
|---|---|
| **Accounts** | Types: bank, cash, e-wallet, savings, credit card, loan, investment, provident fund, property, other asset/liability. Each has a native currency, opening balance, purpose (daily spending, bills, emergency fund…) and institution. Archive instead of delete. Grouped summaries (Cash & Bank, Savings, Investments, Other Assets, Liabilities). Cards carry a deterministic visual identity (palette, abstract motif, monogram; section G). |
| **Transactions** | Income, expense, transfer (plus adjustment, asset purchase/sale types). Double-entry postings behind the scenes; hierarchical categories; filtering; void instead of delete. Imported and recurring rows carry provenance. |
| **Transfers** | Between own accounts, same- or cross-currency, optional fee; excluded from income/expense and net worth. |
| **FX** | Frankfurter provider with local cache, freshness (fresh / stale / missing / identity), manual rates in Settings; conversions refuse to guess. |
| **Overview (Dashboard)** | Net Worth Hero (assets / liabilities / possessions, composition bar with personal possessions as reference-only), flat stat strip (month income / expenses / net cash flow / savings rate), activity heatmap (expenses or income, last 12 months), budget usage, income/expense category charts, accounts summary, goals summary with mini milestone tracks, **Upcoming** recurring card, recent transactions. |
| **Goals** | Savings targets aggregating selected accounts or "all eligible" accounts across currencies; never change net worth. Milestone progress track (25 / 50 / 75 / 100 %), visual-only goal icon, short progress copy, per-account contribution split (section G). |
| **Budget** | Independent Overall Monthly Budget (default) and optional Category Budgets; actuals derived from the ledger. Category-only legacy data remains valid. |
| **Categories** | Expense and income trees: create, rename, move (cycle/depth guards), archive branch, restore, usage counts. Hosts **Auto-categorisation rules**. |
| **Assets** | Purchase price, valuations history, days held, cost per day, sale with effective cost/day; net-worth classification per section E.9. |
| **Liabilities** | Loans / financing / mortgage, optionally linked to the asset they paid for; account-backed outstanding balance; repayments are transfers. |
| **Reports** | Monthly report: cash flow, category breakdowns, account movement, budget variance, goal progress. |
| **Security / Backup** | SQLCipher vault, Credential Manager key, scheduled + manual + safety backups, restore UI, recovery-key export and unlock-with-recovery-key, 2.0 → 2.1 plaintext migration with rollback copy. Settings → Data & Security. |
| **Recurring Transactions** | See section H. |
| **WeChat Import** | See section I. |
| **Categorisation Rules** | Deterministic, explainable rules (user + 18 seeded system rules); see I. |

---

### Budget semantics (2.4.0 follow-up, 2026-10-04)

Budget has two independent layers:

1. **Overall Monthly Budget**: one positive CNY minor-unit limit per period,
   or `null` to leave it unset / clear it.
2. **Optional Category Budgets**: existing independent spending guardrails,
   including each selected category's descendants. Parent/child overlap is
   still allowed and each line keeps its existing actual calculation.

**Overall actual = eligible period expenses from the ledger, NOT the sum of
category budget actuals.** `BudgetService.get_period()` reuses
`TransactionRepository.period_totals()` and takes its expense result. Each
non-void `expense` transaction counts exactly once, including uncategorised
spending, using its frozen CNY `base_amount_minor`. Income, transfer principal,
adjustment and asset purchase/sale transaction types are excluded. A transfer
fee separately recorded as an expense by LedgerService remains eligible.

**Category Budgets do not need to sum to Overall Budget.** They may cover only
part of spending and may sum above or below the overall limit. Saving either
layer never writes the other; clearing the overall limit never deletes category
budgets. No overall limits are generated from legacy data.

- Existing `Budget` model / `budgets` table: **one row per period + category**,
  not a header/line model; unchanged.
- New `MonthlyBudget` / `monthly_budgets`: unique `(year, month)`, nullable
  `overall_limit_minor`, positive-or-null DB constraint, timestamps. No
  independent currency model; the established Budget base currency is CNY.
- Existing `GET/PUT /budgets/{year}/{month}` remain compatible; PUT still
  replaces only category entries. New `PATCH /budgets/{year}/{month}/overall`
  requires `{overall_limit_minor: positive integer | null}`; zero, negative,
  boolean, string, fractional or unsafe-JavaScript-integer amounts are rejected.
- Period responses and Overview `budget` include `overall_limit_minor`,
  `overall_actual_minor`, `overall_remaining_minor`, `overall_used_percent`.
  Remaining / percentage are `null` without a limit; actual is always available.
  Percentage uses Decimal / half-up rounding to one decimal and may exceed 100.
  The old `total_*` and Dashboard `total_used_percent` retain their **category
  aggregate** meanings for compatibility; they can overlap and must never be
  treated as the overall budget. The existing Reports category variance is unchanged.
- Budget defaults to a simple monthly setup or monthly usage panel. Optional
  categories are collapsed, with a count / Manage categories for existing data.
  Category add, select, edit and remove remain in BudgetEditor. Both amount
  inputs opt into MoneyInput string mode and exact decimal-to-minor conversion.
- Overview prioritises the overall figures; category-only shows active count
  and Set overall budget, with no invented total. Empty shows Set your monthly
  budget. Progress status: `<85%` normal, `85–100%` warning, `>100%` over;
  text keeps the real percentage, only the visual track is clamped. Overspending
  is expressed as a positive amount **over budget**, not negative remaining.
- All financial invariants in E remain unchanged. No changes to ledger, FX,
  net worth, recurring, imports, assets, goals, encryption, backup or recovery.

---

## G. UI and design system

Detail and screenshots: [`V2_3_IMPLEMENTATION_STATUS.md`](V2_3_IMPLEMENTATION_STATUS.md)
(`docs/ui-review/2.3/` is git-ignored; screenshots are regenerated locally
from the synthetic fixture `scripts/ui_review_fixture.py` in a scratch vault).

### Design position

**Quiet luxury financial desktop UI**: calm, precise, premium, restrained,
high information clarity, subtle depth, limited motion, accessibility first.
Depth comes from a surface ladder (canvas → panel → raised → hero) and
hairlines; shadows are reserved for things that float (popovers, toasts) and
cards you act on. One brand accent (blue); account and goal identities add a
second, quiet accent per card only.

> The UI had a full overhaul in 2.3.0. **Unless the user explicitly asks,
> do not start another large visual redesign.** Extend the existing system.

### Where it lives

| Piece | Location |
|---|---|
| Appearance preference, boot, provider | `frontend/src/theme/appearance.ts`, `ThemeProvider.tsx`, `themeContext.ts`, `AppearanceSwitch.tsx`; first-paint script in `frontend/index.html` |
| Ant Design theme | `frontend/src/theme/antdTheme.ts` → `createTheme(mode)`; colours from `palette.ts` |
| CSS tokens | `frontend/src/styles/tokens.css` (`:root` / `[data-theme='light']` and `[data-theme='dark']`, same `--oi-*` names) |
| Chart / heatmap colours | `frontend/src/theme/chartPalette.ts` → `useChartPalette()` (separate light and dark series, axis, grid, heatmap levels) |
| Shell and navigation | `styles/shell.css`, `styles/nav.css`, `components/layout/Sidebar.tsx`, `navItems.tsx` |
| Controls | `styles/controls.css` (depth, focus, inputs, tables), `styles/interactions.css` (hover / press micro-interactions) |
| Overlays | `styles/overlays.css` (modals, dropdowns, popovers, tooltips, messages, notifications) |
| Panels and data | `styles/cards.css`, `charts.css`, `overview.css`, `heatmap.css` |
| Account identity | `theme/accountTheme.ts`, `styles/accountThemes.css`, `components/common/AccountMonogram.tsx` |
| Goal visuals | `theme/goalTheme.ts`, `theme/milestoneMemory.ts`, `components/common/MilestoneProgress.tsx`, `GoalGlyph.tsx`, `styles/goals.css`, `styles/milestones.css` |

### Theme system

- **Modes**: System (default), Light, Dark: Settings → Appearance and the
  sidebar footer (icon options carry tooltips and accessible labels).
- **Preference**: `localStorage["openisave.appearance"]` in the webview. It is
  a UI preference, **not a database field**; no migration.
- **Applying**: `<html data-theme="light|dark">` plus `color-scheme`. System
  resolves through `prefers-color-scheme` and follows Windows live while
  System is selected. Switches cross-fade with a 180 ms view transition
  (instant under reduced motion).
- **No flash at startup**: an inline script in `index.html` resolves the theme
  and sets `data-theme` and the first-frame background through
  `element.style` (CSSOM) before any bundle loads; the Tauri window is created
  with `visible: false` and shown from `on_page_load` in `desktop/src/lib.rs`
  (4 s safety fallback).
- **Ant Design**: dark = official `theme.darkAlgorithm` + OpenISave tokens
  (surfaces, text, accent, controls, tables, menu, overlays); light = default
  algorithm + the same token set.
- **Charts and heatmap**: always take colours from `useChartPalette()`; never
  hard-code series colours in a chart component.

> ⚠️ **CSP warning for future agents.** Never add an inline `<style>` element
> to `frontend/index.html` (e.g. for first-paint theming). Tauri then adds a
> nonce to the CSP `style-src`, browsers ignore `'unsafe-inline'`, and every
> style Ant Design injects at runtime is blocked, **only in the packaged
> desktop app**, while the Vite dev server looks perfect. This happened during
> 2.3.0. Set first-paint values from the boot script through CSSOM instead.
> `src/theme/appearance.test.ts` guards it; always verify UI changes in the
> installed app too.

### Accessibility and motion policy

- Text tokens meet **WCAG AA** in both themes; new accent colours are
  contrast-tested (`src/theme/themeStyles.test.ts`).
- Colour is never the only channel: signs and words on amounts, glyph + text
  on status chips, institution and account name next to monograms, percentage
  and milestone text on goal tracks.
- Visible 2 px focus rings on buttons, menu items, segmented controls,
  switches, checkboxes and radios.
- **Every animation and hover transform sits behind
  `@media (prefers-reduced-motion: no-preference)`** (test-enforced for
  `nav.css`, `interactions.css`, `milestones.css`, `accountThemes.css`,
  `goals.css`). Nothing loops; nothing bounces.

### Overview (dashboard) layout

The Overview is **not** a wall of white cards any more:

1. **Net Worth Hero**: the graphite-navy primary visual anchor (net worth,
   assets / liabilities / possessions, composition bar).
2. A **flat stat strip**: income, expenses, net cash flow, savings rate.
3. **Activity heatmap** as a flat analytical section on the canvas.
4. Theme-aware charts, budget usage, income / expense category splits.
5. Accounts summary (with account monograms), savings goals (mini milestone
   tracks), Upcoming recurring, recent transactions.

Do not wrap every section back into a card; keep the hero as the one
dominant element.

### Sidebar interactions

- **Hover**: subtly tinted row, 24 px icon well, stronger label, ~170 ms.
- **Active**: 2 px accent rail (draws in once, 240 ms), tinted accent icon
  well with a faint top highlight, hairline inner edge, 600 weight.
- **Semantic icon motion** (hover and keyboard focus): Transactions' two
  arrows part slightly (the glyph is stacked twice and clipped), Recurring
  turns ~18°, Settings ~14°, Accounts lifts, the Goals flag rises; every other
  item scales to 1.06.
- Do **not** add glow, bounce, continuous animation or large translations.

### Buttons and controls

- **Primary**: inner top highlight, hover lifts 1 px with one soft sheen
  passing across, press settles +0.5 px; icons inside buttons make a small
  matching gesture (plus turns, arrows shift, import rises, edit tilts, undo
  turns back).
- **Text actions** (Edit, Archive, Details, Show accounts…): quiet fill and
  stronger contrast on hover; no brand-blue takeover. Danger stays red.
- **Form controls**: neutral at rest, stronger border on hover, restrained 3 px
  brand focus halo, no glow. Tables: quiet headers, tabular figures, row
  actions muted until the row is hovered or focused.

### Account visual identity

`resolveAccountTheme(account)` (`src/theme/accountTheme.ts`) returns a palette
id (`data-acct`), a motif (`data-motif`) and a monogram. Order:

1. **Known institution** (matched on institution *or* account name);
2. **Account type**;
3. **Deterministic fallback**: FNV-1a hash of
   `institution + "|" + account name` (lower-cased, trimmed) → one of seven
   palettes. **Never random**: the same account always gets the same theme.

| Theme | Palette (light accent) | Motif | Monogram |
|---|---|---|---|
| HSBC / 汇丰 | cool burgundy | angular diamond lattice (corner) | H |
| Bank of China / 中国银行 / 中行 | warm Chinese red | concentric arcs | BOC |
| China Merchants Bank / 招商银行 / 招行 | rose red | fine diagonal band | CMB |
| China Construction Bank / 建设银行 | deep blue | rising lines | CCB |
| Monzo | coral | restrained four-colour layered stripe | M |
| Barclays | teal-blue | wave | B |
| WeChat / 微信 / 零钱 | muted green | dots and bubbles | W |
| Alipay / 支付宝 / 余额宝 | sky blue | arcs | A |
| Cash (type) | olive sand | pinstripe | initials |
| Savings / provident fund (type) | cool teal-blue | wave | initials |
| Investment (type) | deep indigo | rising lines | initials |
| Credit card / loan / other liability (type) | plum graphite | fine diagonals | initials |
| Property (type) | earth brown | contour lines | initials |
| Fallback | navy, teal, burgundy, violet, slate, amber, forest | per palette | initials (e.g. "LCU") |

- Card structure: near-surface tint (2.5 % light / 3.5 % dark), 2 px accent
  edge fading to the right, monogram well, motif in the top-right corner at
  **~7.5 % opacity in light, ~5 % in dark** (×1.6 on hover, plus 1 px lift).
- **No bank logos are downloaded, copied or drawn.** Only an
  institution-inspired palette, an abstract CSS motif and a text monogram.
- Every palette is defined for light and dark and contrast-tested.
- Do not turn account cards into skeuomorphic bank cards.

### Goal visual system

- The plain progress bar is replaced by a **milestone track**: stops at
  **25 / 50 / 75 %** and a **star at 100 %**, a 25/50/75/100 % scale under the
  track, fill as a subtle tonal gradient of the goal accent (dimmer in dark).
- Progress comes from the backend's `progress_percent`; the frontend never
  recomputes financial progress. Reached = `progress_percent >= milestone`.
- **Copy** (lower bound inclusive): 0–24 *Getting started*, 25–49 *Momentum
  building*, 50–74 *Halfway there*, 75–99 *Almost there*, 100+ *Goal reached*.
- **Visual-only classifier** `resolveGoalTheme(name)` (English and Chinese
  keywords): emergency → shield, travel → globe, home → house, education →
  book, car → car, gift / occasion → gift, otherwise savings → wallet. It is
  presentation only and is **never written to the database**.
- **Motion**: the fill grows once on first render and reached stops settle in
  after it. A milestone first crossed since this device last showed the goal
  gets one soft ring; at 100 % a few small sparks; under 600 ms; nothing under
  reduced motion. "Already shown" is kept in
  `localStorage["openisave.goalMilestones"]` (goal id → highest milestone
  number only). A goal seen for the first time is recorded silently. Do
  **not** add a database field for this.
- **Contributions** (expanded goal): a segmented split track coloured by each
  account's identity theme, then per account: monogram, name, *shared* /
  *check* tags, native balance (if another currency), converted amount and
  share %. Amounts are the backend's; the share is only their ratio.
- **Overview goals**: icon, name, percentage, mini milestone track, remaining
  amount and short copy. `remaining_minor` comes from the existing `/goals`
  endpoint (the dashboard payload does not carry it); nothing is recomputed.

### External design reference

[Uiverse Galaxy](https://github.com/uiverse-io/galaxy) (MIT) was used for
interaction ideas only (tactile button press and inner highlight, subtle icon
wells, toggle thumb, notification hierarchy); no snippet was copied (attribution
in `styles/controls.css` and `styles/interactions.css`). Deliberately not
used: neon, glow, glassmorphism, 3D, rainbow gradients, excessive or flashy
motion.

### UI regression rules (future agent checklist)

Do **not**:

- re-card the whole Overview or demote the Net Worth Hero;
- assign account colours randomly or by array index;
- download, copy or trace bank logos;
- make goals childish (confetti, badges, streaks, cheering copy);
- add continuous / looping animation, neon or glow;
- ignore dark mode or hard-code light-only colours in components (a test
  rejects colour literals outside `src/theme`);
- use colour as the only carrier of meaning;
- move financial calculations into the frontend.

Always:

- build Light and Dark together and verify System;
- respect `prefers-reduced-motion`;
- keep WCAG AA;
- use tokens (`--oi-*`, `--acct`, `--goal`) and `createTheme()`;
- keep every handwritten frontend file under 350 lines;
- take screenshots only from a scratch vault seeded with
  `scripts/ui_review_fixture.py` (synthetic data), never the real vault;
- verify in the **installed** app, not only the Vite dev server.

---

## H. Recurring transactions

Code: `models/recurring.py`, `services/recurrence.py` (pure date maths),
`services/recurring_service.py`, `api/v1/recurring.py`,
`frontend/src/features/recurring/`, Overview `UpcomingCard`.

- **Rule model** (`recurring_rules`): a transaction template (type income /
  expense / transfer, amount, account(s), category, note) + schedule + mode +
  status + `next_run_date` cursor + `last_generated_at`.
- **Schedule**: `weekly` / `monthly` / `yearly`, **interval** "every *n*
  periods", start date, optional end date, monthly day 1–31 (31 = last day of
  month).
- **Month-end and leap years**: occurrence *k* is always computed from the
  start date, so there is no drift: 31 Jan → 28/29 Feb → 31 Mar → 30 Apr;
  a yearly rule on 29 Feb falls on 28 Feb in common years.
- **Modes**: **Review first** (default) — due occurrences are listed with
  Create / Skip. **Automatic** — created by `POST /recurring/process-due`,
  which the frontend calls once per app launch.
- **Lifecycle**: create, edit (schedule edits move the cursor), pause, resume
  (continues from today; occurrences during the pause are skipped), archive
  (history kept).
- **Upcoming**: `GET /recurring/upcoming?days=` computes future dates on the
  fly; the Overview shows the next 14 days.
- **Idempotency**: `recurring_occurrences UNIQUE(rule_id, occurrence_date)`.
  The occurrence row and its transaction are written in one DB transaction;
  repeating a request returns the existing occurrence; a racing insert hits
  the unique key and rolls back. Voiding a generated transaction does **not**
  free its date.
- **Ledger**: generated transactions go through `LedgerService`
  (`commit=False`), so postings, frozen FX, budgets and reports behave exactly
  like hand-entered ones. `transactions.recurring_rule_id` links them back.

> **Never pre-create future transactions.** Only due (date ≤ today)
> occurrences are ever materialised; the future is computed, not stored.

API: `GET/POST /recurring`, `GET/PATCH /recurring/{id}`,
`POST /recurring/{id}/pause|resume|archive`, `GET /recurring/upcoming`,
`POST /recurring/{id}/occurrences/{date}/generate|skip`,
`POST /recurring/process-due`.

---

## I. WeChat statement import

Code: `importers/base.py`, `importers/wechat.py`,
`services/statement_import_service.py`, `import_preview.py`,
`import_staging.py`, `categorisation_service.py`, `api/v1/imports.py`,
`api/v1/rules.py`, `frontend/src/features/imports/`, `features/rules/`.

### Parser (`WeChatStatementImporter`)

- Reads the WeChat Pay **XLSX** export (openpyxl) **in memory**; the file is
  never uploaded or stored.
- **Dynamic header detection**: scans each sheet (first 200 rows) for the
  required columns (交易时间, 交易类型, 交易对方, 商品, 收/支, 金额(元),
  支付方式, 当前状态, 交易单号, 商户单号, 备注). The preamble length varies —
  **never assume a fixed header row (e.g. row 18)**. Full-width parentheses
  and whitespace are tolerated; a missing column gives "Unsupported format …
  missing <column>".
- **Time zone**: times are interpreted as **Asia/Shanghai**. `occurred_at` is
  timezone-aware (+08:00); `source_date` is the Asia/Shanghai calendar date
  and becomes `transaction_date`, **independent of the computer's time zone**
  (a 01:30 purchase on 12 Sep stays on 12 Sep on a UK machine). Both, plus
  `source_timezone`, are stored on the import reference.
- **Amounts**: `Decimal` → fen, at most 2 decimals; float cells are read via
  their shortest repr; `¥` prefixes stripped.
- **Transaction id** (交易单号) is kept as a **string**; numeric cells are
  rejected (32-digit ids would lose precision as floats). `/` means empty.

### Pipeline

```text
Parse (memory) → Preview → Account mapping → Categorisation → Review → Confirm → Atomic import
```

Nothing is written before **Confirm**; the confirm step is one
all-or-nothing DB transaction that creates transactions via `LedgerService`,
`external_transaction_refs`, remembered mappings/rules and an
`import_batches` record (detected / imported / duplicates / skipped /
ignored).

- **Movement classification**: income / expense / transfer (零钱充值, 零钱提现,
  零钱通, 信用卡还款, 理财通, neutral 收/支) / needs review (refunds, transfers
  to people, unmappable neutral rows) / ignored (failed, closed, returned).
- **Duplicate identity**: `source + external_transaction_id`,
  `UNIQUE` in `external_transaction_refs`. Preview marks *Already imported*;
  repeats inside one file are also caught.
- **Account mapping**: WeChat payment method (零钱, 招商银行(1234)…) →
  OpenISave account, persisted in `import_account_mappings`; CNY accounts only.
- **Classification priority** (`categorisation_service`):
  1. user rules
  2. exact merchant
  3. merchant keyword
  4. product keyword
  5. note keyword
  6. WeChat statement-type fallback
  7. **Needs Review**

  Rules (`categorisation_rules`) have origin user/system, match field,
  exact/contains, optional second keyword, direction, category, priority,
  enabled. 18 system rules are seeded idempotently and never overwrite edits;
  rules pointing at archived categories are skipped. Every result records
  which rule filed it. *Remember this rule* in Review creates a user rule,
  applied immediately to similar rows in the preview and saved on confirm.
- **No AI is required or used** for parsing or classification.
- **Skip this import**: temporary — the row is not recorded and needs review
  again next time.
- **Ignore permanently**: persisted in `import_ignored_items
  UNIQUE(source, external_id)`; shown as *Ignored* in later statements;
  listed under *Ignored items* on the import page with **Restore**.
- **Provenance** on `transactions`: `external_source`,
  `external_transaction_id`, `import_batch_id`, `classification_rule_id`;
  raw merchant, product, payment method, status, note, merchant order id and
  classification reason live on the ref.
- Logs record only counts (e.g. `statement_parsed source=wechat rows=18`),
  never merchants, amounts or card numbers.

Adding an importer: implement `StatementImporter` and register it; reuse the
preview/staging/confirm services rather than writing a second ledger path.

---

## J. Database and Alembic

Migration chain (2.4.0 head: **`d9e5a1b7c302`**; 2.3 schema: `c4d8f2a6e913`):

| Revision | Purpose |
|---|---|
| `92eb242c8f4f` | V1 initial schema: currencies, accounts, categories, transactions, postings, fx_rates, budgets, goals, settings |
| `042bb366d803` | V2: multi-account goals (`goal_accounts`, `selection_mode`), `asset_categories`, `assets`, `asset_valuations`, `liabilities`; `asset_id` on transactions/postings; migrates `goals.linked_account_id` then drops it |
| `5d1c7e9a2b40` | Asset net-worth classification: `asset_categories.include_in_net_worth_default` (true only for Property), `assets.include_in_net_worth_manual`; reclassifies existing assets. ADD COLUMN + UPDATE only — deliberately no table rebuild |
| `a7c3e91f4b2d` | 2.2 recurring + import: `recurring_rules`, `recurring_occurrences`, `categorisation_rules`, `import_account_mappings`, `import_batches`, `external_transaction_refs`; five nullable indexed columns on `transactions` (no FK clause, to avoid a SQLite table rebuild) |
| `c4d8f2a6e913` | `import_ignored_items`; `external_transaction_refs.source_date` / `source_timezone` |
| `d9e5a1b7c302` | 2.4.0 independent `monthly_budgets` table only. No existing-table rebuild, row rewrite or automatic overall budget creation. Downgrade drops only the new table. |

Rules:

- The app applies migrations itself on startup (`db/bootstrap.py`), **after
  an encrypted safety backup**. Users never run Alembic.
- **Never casually rebuild production tables.** On SQLite, `batch_alter_table`
  / ALTER COLUMN recreates the table; with foreign keys on, the implicit
  DROP can cascade into `transactions` and `postings`. Prefer additive
  ADD COLUMN / new tables / data UPDATEs.
- Every migration needs: model/DB diff empty, existing rows preserved,
  downgrade round-trip, and a run over an encrypted vault (the SQLCipher
  migration tests do this for the whole chain).
- Offline (SQL script) migrations are not supported.

---

## K. Testing

Verified totals (2026-10-04 local Budget follow-up, see section Q):

- **Backend: 344 passed, 1 skipped.** The skip is the opt-in real-statement
  parser test (`OPENISAVE_WECHAT_SAMPLE=<path to a real .xlsx>`); real
  statements are never copied into the repo.
- **Frontend: 165 tests in 26 files passed**; typecheck, lint, `check:size`
  (largest handwritten file: `src/styles/cards.css`, 318 lines) and
  production build pass (Vite's >500 kB chunk warning is expected, see O).

Budget suites: `backend/tests/test_overall_budget.py` (29 cases),
`test_overall_budget_migration.py` (2 encrypted scratch cases: fresh DB,
existing 2.3 upgrade, all original rows preserved, downgrade/re-upgrade,
model/DB diff empty, cipher/DB/FK integrity); frontend `BudgetPage.test.tsx`
and `BudgetUsageCard.test.tsx` (setup, set/edit/clear, category add/edit/remove,
legacy data, theme rendering, exact input, real progress and dashboard modes).
The complete frontend suite was run with `--maxWorkers=2 --minWorkers=1`.
Three synthetic UI scenarios were checked on Budget and Overview in Light and
Dark; System resolved the current OS theme; browser console errors: zero.
Evidence is git-ignored in `docs/ui-review/budget-simplification/`.

**Publication validation after the 2026-10-07 cleanup:** the latest full test
run remains the 2026-10-04 run above. Dependencies (`frontend/node_modules`,
root `node_modules`, `backend/.venv`) and regenerable build output were removed
during the authorised disk cleanup. No dependencies were reinstalled and no
tests, typecheck, lint, size gate or production build were rerun for this push.
Cleanup preserved the complete Git diff and every retained file's SHA256.
Before publication, all 460 retained non-Git files still matched that cleanup
baseline; source timestamps predate the final full validation records. This
publication changes documentation and Git metadata only, with no new source
logic changes. The 344 / 1 and 165 / 26 totals are historical verified results,
not claims of a new test run.

UI guard suites (`frontend/src/`): `theme/darkMode.test.ts` (no colour
literals in components, light/dark token parity, separate chart palettes),
`theme/appearance.test.ts` (boot script, **no inline `<style>` in
index.html**), `theme/ThemeProvider.test.tsx`, `theme/themeStyles.test.ts`
(account and goal palettes defined for both themes, WCAG AA, reduced-motion
gating), `theme/accountTheme.test.ts`, `theme/goalTheme.test.ts`,
`components/layout/Sidebar.test.tsx`,
`features/goals/components/GoalCard.test.tsx`. None are pixel snapshots.

Run:

```bash
cd backend
.venv\Scripts\python.exe -m pytest
```

```bash
cd frontend
npm run test
npm run typecheck
npm run lint
npm run check:size
npm run build
```

Important regression suites (`backend/tests/`):

| Area | Files |
|---|---|
| Money / rounding | `test_money.py` |
| FX (missing ≠ 1.0, frozen history) | `test_fx.py` |
| Ledger / voiding | `test_ledger.py` |
| Transfers | `test_transfers.py` |
| Net worth & classification | `test_networth_classification.py`, `test_overview_v21.py`, `test_budget_goal_dashboard.py` |
| Assets / liabilities / goals / categories | `test_assets.py`, `test_liabilities.py`, `test_goals_v2.py`, `test_categories.py` |
| Encryption, backups, recovery, 2.0 migration, schema upgrade | `test_security_storage.py`, `test_security_api.py` |
| Recurring (month-end, leap year, idempotency, modes) | `test_recurring.py` |
| WeChat parser (headers, amounts, ids) | `test_wechat_parser.py` |
| Import atomicity, duplicates, mapping, rules | `test_statement_import.py` |
| Time zone / source date (runs under several local zones) | `test_import_dates.py` |
| Permanent ignore / restore | `test_import_ignore.py` |
| HTTP end-to-end | `test_api_end_to_end.py`, `test_api_v2.py` |

Test data is synthetic: `backend/tests/wechat_fixture.py` builds WeChat
workbooks in memory; `frontend/src/test/fixtures.ts` holds UI fixtures.

---

## L. Desktop packaging

```text
backend  ──PyInstaller──►  desktop/binaries/openisave-server/   (one-folder sidecar, git-ignored)
frontend ──vite build───►  frontend/dist/
desktop  ──tauri build──►  desktop/target/release/bundle/nsis/OpenISave_<version>_x64-setup.exe
```

- **Development mode**: browser (`start_backend.ps1` + `start_frontend.ps1`,
  http://127.0.0.1:5173) or desktop window against Vite
  (`start_desktop_dev.ps1`, no sidecar bundled). Set
  `OPENISAVE_DEV_LOCAL_DATA=1` for the backend.
- **Production build**: `scripts\package_windows.ps1` runs quality gates,
  PyInstaller (`build_backend.ps1`) and Tauri (`build_desktop.ps1`).
  NSIS per-user install (`installMode: currentUser`) to
  `%LOCALAPPDATA%\OpenISave\`, Start-menu shortcut, optional desktop shortcut.
- **Release folder**: `scripts\package_release.ps1` writes
  `release\OpenISave_<version>_x64-setup.exe`,
  `release\OpenISave2-v<version>-source.zip` and `release\SHA256SUMS.txt`.
  `release/` is git-ignored; installers are published only as GitHub Release
  assets.
- **Sidecar lifecycle** (`desktop/src/backend.rs`): Tauri picks a free
  loopback port, starts the sidecar, places it in a **Windows job object with
  `KILL_ON_JOB_CLOSE`**, and kills it explicitly on shutdown — so the backend
  never outlives the window, even if the shell is killed. Keep both
  mechanisms when touching this code.
- Version must be bumped together in: `backend/app/core/config.py`
  (`APP_VERSION`), `backend/pyproject.toml`, `package.json` +
  `package-lock.json` (root and `frontend/`), `desktop/Cargo.toml`,
  `desktop/Cargo.lock`, `desktop/tauri.conf.json`.
- `scripts\clean_build_artifacts.ps1 [-DryRun]` reclaims ~3 GB of build
  output; it never touches source or `%LOCALAPPDATA%` data.

---

## M. Git and release workflow

**2026-10-04 user override for Budget:** build and overwrite-install the current
uncommitted `codex/budget-simplification` working tree before Git review. Select
2.4.0 for this additive feature/schema/API change, synchronising every version
field. Git publication was withheld at that time. The user explicitly
authorised read-only production counts/integrity checks and normal startup
migration after the app's encrypted safety backup. No financial records may be
created, changed or removed; restore the original Appearance preference.

**The current publication request supersedes the earlier Git hold:** commit
the existing validated source, push `codex/budget-simplification` and open a
PR targeting `main`. The user will merge manually. Do not push `main`,
force-push, merge the PR, create a GitHub Release, rebuild an installer,
reinstall or launch the real app, or access the production vault. Source
publication does not establish that 2.4.0 is installed.

```text
feature/* or release/vX.Y.Z branch
   ↓  implement + tests (backend + frontend gates, section K)
   ↓  push branch
   ↓  open PR → main
   ↓  USER reviews and merges manually
   ↓  build installer from the merged commit
   ↓  smoke test the installed app (real install, not a sandbox copy)
   ↓  GitHub Release with installer + SHA256SUMS + source zip
```

- Remote: `https://github.com/jiangshan001/OpenISave2.0`; default branch
  `main`.
- **Agents do not merge to `main`, push to `main`, force-push, or create
  GitHub Releases unless the user explicitly asks in that session.**
- One coherent release commit per version is acceptable; don't split
  artificially.
- Run `git fetch origin --prune` before judging what is merged: local
  remote-tracking refs go stale, and GitHub deletes a PR's head branch after
  merge (pushing the branch again simply recreates it; never force-push).
- Commit only source: never `release/`, installers, databases, statements,
  logs, screenshots of real data, `node_modules`, `.venv`, `desktop/target`,
  `frontend/dist`, PyInstaller `build/`/`dist/`. `.gitignore` covers these —
  still check `git status --ignored` before committing.

---

## N. Safety rules for future agents

> ### ⚠️ Non-negotiable
>
> - **Never touch the real encrypted vault** (`%LOCALAPPDATA%\OpenISave2Data\`)
>   unless the user explicitly asks — not to read, "inspect", copy, migrate or
>   clean.
> - **Never reset, delete or recreate the production database** or its backups.
> - **Never print financial data** (amounts, merchants, account names, card
>   numbers) in logs, test output or commits.
> - **Never commit statements** (`*.xlsx`, `*.csv`, …), databases, backups or
>   screenshots showing real balances.
> - **Never expose encryption keys or recovery keys** — not in code, `.env`,
>   logs, docs, or chat.
> - **Tests use a scratch vault** (`conftest.py` isolation); manual dev uses
>   `OPENISAVE_DEV_LOCAL_DATA=1`.
> - **Do not silently change accounting semantics** (section E). Propose, get
>   agreement, migrate, test.
> - **Do not use floats for money.**
> - **Do not assume the local time zone for imported source dates** — use the
>   statement's zone (Asia/Shanghai for WeChat) and keep `source_date`.
> - **Do not duplicate backend financial calculations in the frontend.**
> - **No handwritten frontend file over 350 lines** (`npm run check:size`).
>   Split components instead.
> - **Never assume a generated installer is current** — rebuild from the
>   commit you are testing.
> - **Always distinguish the source version from the installed desktop
>   version.** Check the version shown in the sidebar of the running app /
>   the installed files, not just the repo.
> - **Never add an inline `<style>` element to `frontend/index.html`**: the
>   packaged app's CSP then blocks every Ant Design runtime style (section G).
>   Verify UI changes in the installed app, not only in Vite.
> - **UI screenshots come from a scratch vault** seeded with
>   `scripts/ui_review_fixture.py`; `docs/ui-review/` is git-ignored and must
>   not be force-added.
> - Don't merge, force-push, push to `main` or publish releases without an
>   explicit request.

---

## O. Known limitations and technical debt

Verified against the 2.4.0 working tree:

- **Budget build/install follow-up**: source metadata is synchronised to 2.4.0;
  full gates, PyInstaller, Tauri and NSIS builds pass. The new installer was
  launched via Explorer, but Windows is locked and installation awaits unlock.
  Actual installed EXE/registry remain 2.3.0. The user authorised a read-only
  production baseline (complete) and normal safety-backed startup migration
  (not yet run). Real-App smoke tests and final data comparisons remain pending;
  see BUDGET_SIMPLIFICATION_WINDOWS_INSTALL.md. This is the last verified
  installation state from 2026-10-04; it was not rechecked during source
  publication. Installation and production validation remain separate
  follow-up work; no merge or GitHub Release is authorised here.
- Legacy Budget `total_*` API fields and Reports still aggregate independent
  category lines; parent/child overlap may repeat category actuals. New Overall
  values are independent ledger totals and Budget/Overview never use legacy
  aggregates as a global limit or actual.

- **Importers**: only WeChat Pay XLSX. No Alipay, HSBC, Monzo, or generic
  CSV/OFX importer yet (the `StatementImporter` registry is ready for them).
- Import account mapping supports **CNY accounts only**.
- **Refunds always go to Needs Review**; no automatic netting against the
  original purchase.
- **Recurring**: resuming a paused rule skips occurrences that fell during
  the pause (no "catch up"); automatic rules are processed on app launch only
  (no background scheduler while the app is closed).
- **No AI classification** (by design; could be an optional future add-on).
- **No investment holdings engine**: no securities, quantities, cost basis or
  market prices — investment accounts are balances only.
- **No monthly snapshots / historical net worth** series; reports use the
  ledger for the month, not stored month-end balances.
- **Asset valuation history has no chart** (table only on the asset page).
- Asset purchase/sale currency must match the asset's currency (no
  cross-currency asset purchase).
- Liability **amortisation / interest accrual not modelled**.
- **No bills / committed cash-flow view**: Upcoming lists the next 14 days of
  recurring occurrences but does not compare commitments with balances.
- **No export** (PDF/CSV) of reports; **no tags**; **no attachments/receipts**.
- **Frontend bundle is a single ~2.1 MB chunk** (2,085 kB, 626 kB gzip; Vite
  warns >500 kB); no code splitting / lazy routes yet.
- Account identity themes know eight institutions; others get a
  deterministic fallback palette (by design, section G).
- Single FX provider (Frankfurter).
- **Windows-only**: the Tauri shell is cross-platform, but only Windows is
  built and tested; key storage is Windows Credential Manager specific.
- Category re-parenting only via the edit dialog (no drag and drop).

---

## P. Recommended next steps

Roadmap only; nothing below is implemented.

1. **Real-world WeChat import rule tuning**: run the opt-in parser test and
   imports against several real monthly statements (kept outside the repo),
   tune the built-in rules, add redacted regression cases for new layouts.
2. **Generic transaction import pipeline expansion**: generic CSV with column
   mapping, reusing preview / staging / confirm and duplicate identity.
3. **Monzo / HSBC importers** (then Alipay) on the same pipeline.
4. **Monthly snapshots + historical net worth** chart.
5. **Bills / committed future cash flow**: build on recurring rules
   (upcoming totals vs. account balances).
6. **Tags** on transactions.
7. **Transaction attachments** (encrypted, inside the vault folder).
8. **Optional receipt recognition** (local, opt-in; never required).
9. **Investment holdings engine** (securities, cost basis, prices).

Smaller debt worth picking off: code splitting / lazy routes, asset
valuation chart, refund matching, recurring catch-up option, report export.

> The UI has just had a complete overhaul (2.3.0). **Do not start another
> large-scale visual redesign unless the user explicitly asks.** New screens
> should reuse the tokens, primitives and rules in section G.

---

## Q. Git state at the time of writing

| | |
|---|---|
| Version | **2.4.0** source and existing local installer; Budget adds a table/API without changing ledger accounting rules |
| Branch | `codex/budget-simplification`; implementation base `55188529353d28dd7c1e0dc2d58bf6f5e5275b53` |
| Latest source commit | [`f74c100c880ec2aba88282a8955096817843a8de`](https://github.com/jiangshan001/OpenISave2.0/commit/f74c100c880ec2aba88282a8955096817843a8de) — `Simplify monthly budgets with optional category limits` |
| Published branch HEAD | [Current branch on GitHub](https://github.com/jiangshan001/OpenISave2.0/tree/codex/budget-simplification); the following documentation-only commit records this source SHA and PR. Resolve its exact SHA with `git rev-parse HEAD` after pulling the branch |
| PR | [#4 — OpenISave 2.4.0: simplified monthly budgeting and 2.3 UI polish](https://github.com/jiangshan001/OpenISave2.0/pull/4); open, unmerged; base `main`, compare `codex/budget-simplification`; user merges manually |
| Upstream | `origin/codex/budget-simplification`; source commit pushed and PR created; this metadata is published by a small follow-up documentation commit |
| Remote main | Fresh fetch for publication: `eb690b820808de7df5f5aaea785603dfe95dea50`; no local or remote main write authorised |
| Already merged | 2.2.0 via [#2](https://github.com/jiangshan001/OpenISave2.0/pull/2); first 2.3.0 theme/visual commit `3f90436` via [#3](https://github.com/jiangshan001/OpenISave2.0/pull/3) |
| PR scope | Existing 2.3 final polish commit `5518852` (sidebar/buttons, account identities, goal milestones) plus the 2.4.0 Overall Monthly Budget and optional Category Budgets |
| Alembic head | `d9e5a1b7c302`; production schema was last verified at `c4d8f2a6e913` on 2026-10-04 and was not accessed for publication |
| Latest full validation | 2026-10-04: backend 344 passed / 1 skipped; frontend 165 passed / 26 files; typecheck, lint, check:size and production build passed |
| This publication | Documentation/Git work only; dependencies not reinstalled, full tests/build not rerun; no source logic change during or after cleanup |
| Merge / GitHub Release | Neither performed nor authorised for this publication |

Final 2.3 polish base: `5518852` (also on `origin/release/v2.3.0`). Fresh
`git fetch origin --prune` for this publication confirms `origin/main` at
`eb690b8`; the first 2.3 theme commit was merged, final polish has not reached
main and is included in this feature branch's ancestry. Budget simplification
is documented in
[`BUDGET_SIMPLIFICATION_IMPLEMENTATION.md`](BUDGET_SIMPLIFICATION_IMPLEMENTATION.md).

### Real installed app (2026-10-04 pre-install verification)

| | |
|---|---|
| Installed version | 2.3.0 at `%LOCALAPPDATA%\OpenISave\openisave.exe` (uninstall registry key `DisplayVersion` = 2.3.0) |
| New installer | `release\OpenISave_2.4.0_x64-setup.exe` (git-ignored), SHA-256 `1abb1f9f55e96031df81a937c204a40292f930361e7c200612233166115a1de6`; built now, Explorer-launched, not yet installed |
| Production vault | `%LOCALAPPDATA%\OpenISave2Data`; historical authorised read-only integrity checks passed. Private record counts/fingerprints remain only in ignored local evidence; no reset/delete and no vault access during publication |
| Current blocker | Windows locked (LockApp / LogonUI). Asked user to unlock; no authentication input attempted. Real-App migration, Budget/Overview/theme smoke and after-install counts pending. OpenISave = 0, sidecar = 0. |
| Historical 2.3 checks | Prior Explorer install and read-only Light/Dark/System/accounts/goals/Overview verification passed. These historical checks do not establish that the newly built 2.4.0 app is installed. |

Update this section whenever the branch, head commit, PR or test totals
change.
