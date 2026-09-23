# OpenISave 2.0 — V2 Implementation Status

Date: 2026-09-22

V2 is an incremental upgrade on the working V1. Every V1 capability still works;
nothing was rewritten. The previous status report is kept as history in
[`V1_IMPLEMENTATION_STATUS.md`](V1_IMPLEMENTATION_STATUS.md).

This round delivered four things:

1. **Savings Goals 2.0** — one goal spanning many accounts
2. **Assets, valuations and liabilities**
3. **Category management UI**
4. **Windows desktop application**

---

## Changed from V1

### Breaking: the goal API

A goal no longer has a single `linked_account_id`. The relationship is now
many-to-many through a `goal_accounts` table.

| V1 | V2 |
| -- | -- |
| `POST /goals {"linked_account_id": 3}` | `POST /goals {"account_ids": [3, 5, 7]}` |
| one account per goal | any number of accounts per goal |
| — | `"selection_mode": "selected" \| "all_eligible"` |
| `linked_account_name` on the response | `contributions[]`, `account_count`, `account_ids` |

The migration copies every existing link into the new table, so no goal loses
its account. Downgrading restores the first linked account.

### Other changes

- `TransactionType` gained `asset_purchase` and `asset_sale`.
- `transactions` and `postings` gained a nullable `asset_id`, so a purchase or
  sale balances against the thing being bought.
- `NetWorthService` now takes an `AssetService` and includes physical assets;
  the dashboard gained a `physical_assets` group and `physical_assets_minor`.
- Categories are no longer limited to one level of nesting (now three), and
  gained `PATCH`, archive/restore, usage counts and a guarded `DELETE`.
- The backend now applies its own migrations at startup (for the packaged app),
  taking a backup first.
- CORS allows the Tauri webview origins in addition to the Vite dev server.
- Frontend form validation no longer produces unhandled promise rejections
  (`utils/forms.ts`).

---

## Implemented

### Savings Goals 2.0

- A goal aggregates any number of accounts; the same account may fund several
  goals at once, which duplicates a *label*, never money.
- Balances are converted into the goal's currency using the existing FX
  service. An account with no usable rate is excluded from the total and named,
  never valued at 1.0.
- Two selection modes:
  - **Choose accounts** — an explicit list.
  - **All eligible accounts** — re-evaluated on every read, so new accounts join
    and archived ones leave automatically.
- **Eligibility rule** (implemented once, in `is_eligible_for_goals`, and
  mirrored in the picker): active, not archived, counted in net worth, and not a
  liability type. Credit cards, loans and other debts can never fund a goal.
- An explicitly chosen account that later becomes ineligible stays in the goal
  and is flagged, so a total never moves silently.
- A negative balance contributes zero rather than eating into other accounts.
- The Goals page shows per-goal progress and expands to a per-account table:
  native balance, converted value, share of the goal, and a "shared" marker when
  an account funds more than one goal.

### Assets

- First-class `assets` entity with its own page, detail view and category set
  (Electronics, Vehicle, Furniture, Collectibles, Property, Other), kept
  separate from spending categories.
- Purchase date, price and currency; native currency retained with a frozen base
  value, exactly like transactions.
- **Holding cost**, defined once in `asset_service.py` and never recomputed in
  the frontend:
  - `days_held` = elapsed whole days, floored at 1
  - `holding_cost/day` = purchase price ÷ days held
  - `net_cost` = purchase price − sale proceeds
  - `effective/day` = net cost ÷ ownership days
- **Valuation history** in `asset_valuations`, appended and never overwritten.
  Current value uses the latest valuation, falling back to the purchase price —
  and the UI always says "using purchase value" when it does.
- **Sale flow**: sale date, price, outcome (sold / disposed) and an optional
  destination account that receives the proceeds. History is fully retained.
- Assets marked `holding` and included in net worth count towards total assets;
  sold assets drop out of current assets but keep their record.

### No double counting

Buying an asset is a change of form, not spending:

```text
asset_purchase postings
  cash account       -cash portion
  liability account  -financed portion   (optional)
  asset leg          +purchase price     → sums to zero
```

Because the transaction type is not `income` or `expense`, cash-flow totals are
untouched, and because the postings balance, net worth does not fall by the
purchase price. Recording an asset with no payment is supported and means "I
already owned this".

### Liabilities

- `liabilities` holds contract metadata only: type, lender, original amount,
  start/end dates, interest rate, linked asset.
- **Outstanding debt has one source of truth** — the linked liability account's
  balance. The liability row stores no balance at all, so the two can never
  disagree.
- Creating a liability creates its account automatically, or attaches to an
  existing liability account.
- Repayments are ordinary transfers, so they reduce the debt without touching
  income, expense or net worth.
- Deleting a liability removes the metadata only; the account, its balance and
  its transaction history survive, and linked assets are unlinked.
- A mixed cash-plus-financing purchase works end to end and leaves net worth
  unchanged.

### Category management

- Full tree UI under **Categories**, split into Expense and Income tabs.
- Create, rename, re-parent, archive, restore; delete only when nothing
  references the category and it has no children.
- Up to three levels of nesting; cycles are impossible (a category cannot move
  into its own subtree) and the depth limit is enforced on both sides.
- Archiving hides the whole branch from pickers but leaves historical
  transactions rendering exactly as before. A child cannot be restored inside an
  archived parent.
- Usage counts are shown per category and per branch, so the user can see what
  is safe to change.

### Windows desktop application

- Tauri 2 shell wrapping the same React build, with the FastAPI backend bundled
  by PyInstaller as a sidecar.
- Launch sequence: pick a free loopback port → start the sidecar → wait for it
  to accept connections → load the UI, which asks the shell for the backend URL.
- **No orphan processes.** The sidecar is killed on window destroy and on app
  exit, and is additionally placed in a Windows job object configured to
  terminate it when the parent's handle closes — so even an abnormal exit cannot
  leave a server listening.
- **No fixed-port assumption.** The OS assigns an unused port at launch.
- Still binds to `127.0.0.1` only, with `debug = false`.
- Data stays in `%LOCALAPPDATA%\OpenISave2\`; the database is never packaged
  inside the executable, and upgrading never overwrites it.
- The packaged app applies its own Alembic migrations at startup, backing the
  database up first and keeping the 10 most recent backups.
- Development mode is unchanged: `uvicorn` + `npm run dev` still work, and
  `npm run desktop:dev` opens the shell against the Vite dev server.

---

## Verified by running the application

All scenarios below were run through the real UI (browser against the dev
servers, on a scratch database) or the installed desktop app.

**Goals 2.0** — `三年存够50万`, target ¥500,000, linked to 招商银行 ¥80,000,
中国银行 ¥50,000 and HSBC Savings £6,200: current ¥185,510.79 (GBP converted at the
live rate), 37.1%, ¥314,489.21 remaining, per-account shares 43.1 / 27.0 / 29.9%.
Adding 招商银行 to a second goal was allowed, flagged "shared", and net worth stayed
at exactly ¥185,510.79 before and after.

**Asset** — MacBook Pro, Electronics, 2026-01-01, ¥18,000 paid from 招商银行:
bank −¥18,000, net worth unchanged, 264 days held, ¥68.18/day, "using purchase
value". Valuation ¥12,000: current value switched to the valuation, history kept,
net worth fell by the ¥6,000 depreciation. Sold for ¥8,000 into 招商银行: bank
+¥8,000, removed from holdings, net worth fell only by the ¥4,000 shortfall
against its valuation, net cost ¥10,000, ¥37.88/day, record kept under **Sold**.
Neither purchase nor sale counted as income or expense.

**Financing** — Laptop ¥20,000 = ¥8,000 cash + ¥12,000 Apple Financing: bank
−¥8,000, liability account −¥12,000 (the only stored balance), asset ¥20,000
"financed by Apple Financing", net worth unchanged.

**Categories** — built `Lifestyle › Electronics › Computer Accessories` in the
tree UI, recorded a ¥199 expense against it, archived it: delete stayed disabled
while in use, the old transaction still shows **Computer Accessories**, and new
transactions no longer offer it.

**Desktop** — installed `OpenISave_2.0.0_x64-setup.exe` over an earlier install:
the database was untouched (row counts and balances fingerprinted before and
after). Launch: responsive window in 0.6 s, backend ready in 2.5 s on an
OS-assigned port, the user's existing data shown. Created a record through the
packaged backend, closed the window: **0 processes left**, port closed. Reopened:
new port, record still there (then removed). Hard-killed the shell to simulate a
crash: **the sidecar died with it** (job object). Start Menu and desktop
shortcuts created.

### Bugs the smoke tests caught (all fixed)

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Desktop window frozen ("Not responding") and blank for ~45 s, then closed | Shell waited for the backend on the UI thread | Backend now starts on a worker thread; the page shows a splash and polls `api_info` |
| Packaged backend alive but never listening | Windowed PyInstaller build has `sys.stdout = None`; uvicorn's formatter calls `isatty()` | `run_server.py` points missing streams at `logs/server-console.log`; `use_colors=False` |
| Third-level category showed as just "Computer Accessories" in pickers | Option builder assumed one level of nesting | Rewritten depth-first with full path labels; regression test added |
| Archiving a category turned its old transactions into "Uncategorised" | History tables resolved names from the active-only list | History views load all categories; the edit form keeps an archived category the transaction already uses |
| `global.css` reached 361 lines | Splash styles appended | Split into `styles/startup.css` — caught by `npm run check:size` |

---

## Database migrations

One new revision, `042bb366d803`, on top of the V1 initial schema:

```text
92eb242c8f4f  (V1 initial schema)
    ↓
042bb366d803  goals multi account, assets, liabilities
```

It adds `asset_categories`, `goal_accounts`, `liabilities`, `assets`,
`asset_valuations`; adds `goals.selection_mode`; adds `asset_id` to
`transactions` and `postings`; copies every `goals.linked_account_id` into
`goal_accounts`; and then drops that column.

The chain was verified on a throwaway database seeded with V1 data:
upgrade → data preserved → downgrade → first link restored → upgrade again.

---

## Tests

**Backend: 157 tests, all passing** (88 of them new).

| File | Tests | Covers |
| ---- | ----- | ------ |
| `test_money.py` | 11 | minor units, JPY, ROUND_HALF_UP, cross-scale conversion |
| `test_accounts.py` | 7 | opening balance, balances, currencies, archiving, liabilities |
| `test_ledger.py` | 8 | income, expense, balanced postings, native currency, voiding |
| `test_transfers.py` | 9 | same and cross-currency transfers, net worth unchanged, fees |
| `test_fx.py` | 13 | missing rate never 1.0, cache, staleness, manual rates, frozen history |
| `test_budget_goal_dashboard.py` | 15 | budget actuals from ledger, goal progress, dashboard totals |
| `test_goals_v2.py` | 19 | multi-account aggregation, multi-currency, all-eligible mode, shared accounts, eligibility rule, archived accounts, goals never change net worth |
| `test_assets.py` | 22 | days held, holding cost, valuations and history, sale, net cost, effective cost/day, purchase is not an expense, postings balance, foreign assets, no rate |
| `test_liabilities.py` | 11 | account-backed outstanding, single source of truth, repayments, financed purchase leaves net worth unchanged, deletion keeps history |
| `test_categories.py` | 22 | create/rename/move, cycle prevention, depth limit, archive branch, restore rules, history survives archiving, delete guards, usage counts |
| `test_api_end_to_end.py` | 6 | the full V1 scenario over HTTP |
| `test_api_v2.py` | 8 | goals, assets, liabilities and categories over HTTP |

**Frontend: 26 tests in 5 files, all passing** (new in V2 — V1 had none).

| File | Covers |
| ---- | ------ |
| `GoalAccountPicker.test.tsx` | eligibility rule, multi-select, all-eligible mode |
| `AssetTable.test.tsx` | holding cost display, "using purchase value" labelling, sold-asset figures |
| `AssetSellModal.test.tsx` | sale payload, same-currency destination filtering, validation |
| `CategoryTree.test.tsx` | tree building, cycle/depth guards, archive-not-delete, usage counts |
| `categoryOptions.test.ts` | full-path labels at every depth, orphaned children still offered |

---

## Known limitations

- **Asset payments must match the asset's currency.** Buying a GBP asset from a
  CNY account is rejected with a clear message rather than guessing a rate. The
  model stores the currency on every side, so cross-currency purchases are a
  UI/service addition, not a schema change.
- **Mixed cash-plus-financing needs the liability to exist first.** The flow
  works and is tested, but you create the liability on the Assets page before
  recording the purchase. A single combined form would be friendlier.
- **Liability amortisation is not modelled.** Interest rate and dates are
  recorded, but no schedule is generated and interest is not accrued
  automatically — record it as an expense.
- **Asset depreciation has no chart yet.** The valuation history is stored and
  listed; plotting it is a small addition.
- **Editing an asset cannot change its purchase price or currency**, because a
  ledger transaction may already reference them. Void and re-create instead.
- **Re-parenting a category is available through the edit dialog only**, not
  drag and drop.
- Carried over from V1: standard SQLite (not SQLCipher), no authentication,
  single FX provider, and a single ~1.9 MB frontend bundle.

---

## Deferred

- Phase 8 investments: holdings, cost basis, market values.
- Monthly snapshots (architecture §32 / §61), and with them true month-end
  account balances and historical net worth in reports.
- SQLCipher encryption, OS keychain, a restore UI.
- Recurring rules, financial guidance, PDF/CSV export.
- Code splitting for the frontend bundle.
- macOS and Linux desktop builds (the Tauri shell is cross-platform, but only
  Windows was built and tested).

---

## How to run

See [`../README.md`](../README.md).

Install the app and launch it from the Start menu, or for development:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start_frontend.ps1
```

---

## How to build the installer

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package_windows.ps1
```

Produces `desktop\target\release\bundle\nsis\OpenISave_2.0.0_x64-setup.exe`
(per-user install, Start menu shortcut, optional desktop shortcut).

Requires Rust and the MSVC build tools:

```powershell
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

---

## Next recommended phase

**Monthly snapshots**, then **Phase 8 investments**.

Snapshots are now the highest-value missing piece: assets and liabilities make
net worth meaningful, and a stored month-end snapshot is what turns the reports
from "today's figures" into a real financial history. It also closes the two
report items that have been partial since V1.

Investments then reuse the same valuation machinery the assets module
introduced.
