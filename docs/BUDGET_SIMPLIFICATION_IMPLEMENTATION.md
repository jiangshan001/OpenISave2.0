# Budget simplification — 2.4.0 local implementation

Date: 2026-10-04. Branch: `codex/budget-simplification`, base `5518852`.
The initial implementation round performed no commit, push, merge, PR, release
or installation. On 2026-10-04 the user subsequently authorised building and
installing this working tree before Git review. Version metadata is now 2.4.0:
an additive monthly-budget feature, schema and API change after 2.3.0.
This feature is not retroactively part of 2.3.0's presentation-only history.

## Architecture and financial semantics

Before: `Budget` / `budgets` was one row per `(year, month, category_id)`,
holding `amount_minor` in CNY. There was no period header. Category actuals
include descendants. `total_budget_minor`, `total_actual_minor`, remaining
and Dashboard `total_used_percent` aggregate those independent lines; overlapping
parent/child actuals can be counted in more than one line.

Now: the original model, table, category API and independent line semantics
are retained. New `MonthlyBudget` / `monthly_budgets` stores a unique period and
nullable `overall_limit_minor`, with a positive-or-null check and timestamps.
It has no relationship that deletes or rewrites existing category budgets.
No period row means no overall limit. Clear changes an existing limit to NULL;
clearing a never-set period is a no-op. Reopening retains the value in the DB.

**Overall actual = eligible period expenses from the ledger, never
sum(category budget actuals).** BudgetService reuses the existing
TransactionRepository `period_totals` expense result. Non-void expense headers
in the inclusive calendar month are summed using frozen CNY base amounts;
uncategorised expenses count too. Income, transfer principal, adjustment,
asset purchase and asset sale are excluded. Existing transfer fees written as
separate expense transactions by LedgerService remain included.

Category limits are optional guardrails. They do not need to add up to the
overall limit, and their sum may exceed it. Parent/child overlap is unchanged;
the global query does not join or sum budget lines, so every eligible transaction
is counted once. Saving or clearing either layer leaves the other unchanged.
No legacy rows are merged, removed or converted into generated overall limits.

Limits are positive integer minor units (API maximum: JavaScript's safe integer
ceiling), zero is rejected, clear is null. Money arithmetic uses integers and
Decimal. New overall percentage uses Decimal with half-up rounding to 0.1%;
no spending is 0%, exactly at the limit is 100%, overspending can exceed 100%.
Remaining is limit minus actual in the backend and may be negative in the API;
UI presents the magnitude as an amount over budget. Without a limit, remaining
and percentage are null but actual is available. Currency remains CNY; no
new currency model or FX rule was introduced.

Existing `total_*` and `total_used_percent` retain category meanings for old
clients and Reports; they must not be interpreted as Overall values. Reports
remain category variance in this scoped change. Ledger, FX, net worth, recurring,
WeChat import, assets, goals, encryption, backup and recovery are unchanged.

## API and migration

- `GET /api/v1/budgets/{year}/{month}`: existing category payload plus
  `overall_limit_minor`, `overall_actual_minor`, `overall_remaining_minor`,
  `overall_used_percent`.
- `PUT /api/v1/budgets/{year}/{month}`: unchanged `{entries: [...]}` category
  replacement, preserving overall. Category zero continues to omit that line.
- `PATCH /api/v1/budgets/{year}/{month}/overall`:
  `{overall_limit_minor: positive integer | null}`, preserving categories.
- Dashboard `budget` forwards the same four overall fields from BudgetService.

Migration: `c4d8f2a6e913` → **`d9e5a1b7c302`**. Upgrade only creates the new
table. Existing production tables are never rebuilt; no existing rows are
rewritten. Downgrade only drops the new table (overall limits are lost on
downgrade; category/ledger data survives). Tests use disposable encrypted
SQLCipher databases, pass a keyed connection to Alembic and never invoke the
production-unlocking Alembic CLI. Existing startup safety-backup behaviour is
unchanged and its regression tests pass.

## UX

- Default: Monthly Budget amount, Spent, Remaining, true percentage and shared
  Meter progress; Edit budget opens a small inline form with Save, Cancel and
  Clear monthly budget. Clearing never removes category lines.
- No overall: Set a monthly budget / Decide how much you want to spend this
  month, one MoneyInput and Set budget. Blank/zero cannot be submitted.
- Category Budgets: secondary, Optional, collapsed by default. Existing data
  shows a count and Manage categories; empty data shows Show category budgets.
  Expanded section keeps category limit, actual, remaining and percentage,
  plus the original editor's category select/add/edit/remove capabilities.
  Brief copy explains independent limits and overlapping descendants.
- Both editors use MoneyInput string mode; decimal digits are concatenated
  into safe integer minor units without floating-point multiplication. Other
  MoneyInput consumers retain their existing numeric behaviour. Category inputs
  allow a temporary blank rather than immediately replacing it with 0.00.
- Overview: overall usage first and optional active category count; legacy
  category-only shows count / Set overall budget without a fake total; no
  budgets shows Set your monthly budget with a Budget page CTA.
- Bands: below 85% normal, 85–100% warning, above 100% over. Only the visual
  track is clamped; text shows real percentages and words as well as colour.
  Existing tokens, theme provider and Meter are reused; no new animation,
  inline style element, glow, neon or large redesign.
- Labels added to Budget period selectors, amount inputs and icon-only remove
  actions; category disclosure uses aria-expanded / aria-controls. Theme and
  reduced-motion behaviour remain inherited from the shared design system.

## Validation and data isolation

| Check | Result |
|---|---|
| Full backend pytest | 344 passed, 1 skipped (opt-in real statement) |
| Full frontend npm test | 165 passed, 26 files; `--maxWorkers=2 --minWorkers=1` |
| Typecheck | pass |
| Lint | pass |
| check:size | pass, 194 handwritten files, largest 318 lines |
| Frontend production build | pass; existing >500 kB chunk warning (2,087.40 kB / 626.19 kB gzip) |
| Migration scratch verification | fresh encrypted DB, existing 2.3 schema with synthetic category/ledger rows, downgrade/re-upgrade, every original row preserved, model/DB diff empty, cipher/DB/FK integrity pass |
| Browser UI smoke | Budget + Overview × overall-only / combined / category-only × Light / Dark; System selected and resolved current OS theme; zero console errors |
| Installed Windows app | not opened or modified this round; installation / read-only verification deferred to release phase per handoff M |
| Production vault | never opened, copied, inspected or modified by this work |

Backend additions: 29 cases in `test_overall_budget.py` and 2 cases in
`test_overall_budget_migration.py`. Coverage includes set/update/clear, strict
positive minor units, null/no overall, exact/no/over spending, period bounds,
income/transfer/void/assets exclusions, transfer-fee eligibility, frozen FX,
uncategorised spending, category-only legacy data, independent layer writes,
parent/child overlap, dashboard states and API validation.

Frontend additions: Budget page setup/set/edit/clear, backend remaining/progress,
over-budget copy, default collapse, discoverable legacy lines, category add/edit/
remove, Light/Dark provider rendering and exact decimal conversion. Dashboard
tests cover overall versus misleading category aggregates, 85/100% band boundaries, true overspending,
legacy fallback, empty CTA and navigation. All existing theme/System tests pass.
No brittle screenshot pixel comparisons.

Manual UI uses a new named `%TEMP%/openisave-budget-ui-20261004/data` vault,
memory key store, separate credential service and absent legacy directory,
seeded with `scripts/ui_review_fixture.py`. `scripts/budget_ui_scenario.py`
refuses every data root except that exact scratch path. It selects three Budget
scenarios and an extra empty state. Synthetic category editing was also saved
through the real UI and confirmed not to alter the overall limit.

Screenshots are git-ignored under `docs/ui-review/budget-simplification/`:
`{overall-only,combined,category-only}-{budget,overview}-{light,dark}.png`, plus
expanded category views. The 1440 × 900 viewport matches the desktop default.
Screenshots show synthetic financial data only; they are review evidence, not
automated pixel tests or installed-app verification.

## Windows build/install follow-up

The explicit follow-up request overrides the normal post-merge packaging order
for this local installation only. All version fields are synchronised to 2.4.0;
all backend/frontend gates have been rerun before rebuilding the PyInstaller
sidecar, Tauri and NSIS. The new migration is bundled and its packaged copy's
SHA256 matches the source. A packaged scratch sidecar reports 2.4.0 and returns
the new overall-budget fields. No production Budget creation, update or deletion
is authorised. NSIS packaging has completed, and the new installer was launched
through Explorer. Windows is locked, so actual installation and real-App smoke
verification await unlock; the installed app remains 2.3.0 and no production
migration has run. See BUDGET_SIMPLIFICATION_WINDOWS_INSTALL.md and the handoff
for verified evidence and remaining steps. The current user request authorises
committing and pushing the validated source through a PR to main, with manual
merge by the user. It does not authorise further installation, vault access,
rebuilding, merging or a GitHub Release.

Publication uses the final full 2026-10-04 validation totals above. Dependencies
and build artifacts were removed on 2026-10-07 to reclaim disk space; source
content and the complete Git diff were preserved. This publication updates
documentation and Git metadata only. Dependencies were not reinstalled and
the tests or build gates were not rerun. Current branch, source commit and PR
are recorded in DEVELOPMENT_HANDOFF.md, section Q.
