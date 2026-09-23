# OpenISave 2.0 — V1 Implementation Status

Date: 2026-09-22

This version is a **functional V1**: it starts, records real financial data and
saves it to a local database. It covers Phases 0–4 of the architecture plus
working Goals and Budget.

---

## Implemented

### Foundation (Phase 0)

- FastAPI backend with explicit layering: API → service → repository → SQLAlchemy → SQLite.
  Routes contain no business logic; the React app never touches the database.
- React 18 + TypeScript + Vite frontend, Ant Design 5, Recharts, TanStack Query,
  React Router.
- Alembic migrations (`alembic upgrade head`); tables are never auto-created at startup.
- Database, backups and logs live under `%LOCALAPPDATA%\OpenISave2\`, never in the repo.
  `OPENISAVE_DEV_LOCAL_DATA=1` opts into a repo-local database for development.
- Backend binds to `127.0.0.1` only, `debug = False` by default.
- Seeded reference data only: 7 currencies, 10 account purposes, 45 categories.
  No sample accounts, balances or transactions.

### Settings

- Base currency CNY, timezone, locale, FX staleness threshold.
- Supported currencies: CNY, GBP, USD, EUR, JPY, CAD, AUD (with correct minor-unit
  digits — JPY has none).
- Settings page: reporting configuration, FX freshness threshold, data-location
  explanation, live exchange rate table with refresh and manual-rate entry.

### Accounts (Phase 1)

- Full first-class entity with name, institution, type, currency, purpose,
  opening balance, note, net-worth inclusion, active/archived state, timestamps.
- 11 account types (bank, cash, ewallet, savings, credit_card, loan, investment,
  provident_fund, property, other_asset, other_liability) and 10 purposes.
- Create, edit, archive, restore; accounts page with group subtotals and cards;
  account detail page with metadata and full transaction history.
- Liability accounts hold negative balances; the form asks for "amount currently
  owed" and stores the sign correctly.
- Currency cannot be changed once an account has transactions.

### Ledger (Phase 2)

- Transaction header + postings (double-entry inspired). An expense produces an
  account leg and a category leg that sum to zero; a transfer produces a source
  and a destination leg.
- Income, expense and transfer, with hierarchical categories.
- Transactions page: filter by account, type, category, currency, date range and
  free text; paginated table; add/edit/void.
- Editing rebuilds the transaction atomically (old one voided, replacement created).
- Deletion is a void: `is_voided` / `voided_at` are kept for auditability.
- Transfer fees become a separate linked expense transaction, so the fee is
  reported honestly without making the transfer itself an expense.

### FX (Phase 3)

- `FxProvider` abstraction with a Frankfurter (ECB) implementation; no HTTP calls
  in routes or services' business logic.
- Rates cached locally as `<currency> → CNY` pairs, so the app works offline.
- Resolution order: exact-date cached rate → most recent on or before the date →
  most recent available → **error**. A missing rate is never treated as 1.0.
- Cross rates derived through CNY when a direct pair is missing.
- Freshness states (fresh / stale / missing) surfaced in the header badge, the
  Settings table and a dashboard warning.
- Manual rate entry as the documented offline fallback.
- Each transaction freezes `fx_rate_to_base`, `fx_rate_date`, `fx_source` and
  `base_amount_minor`, so historical reports never move.
- Current net worth uses the latest available rate.
- Accounts with no usable rate are reported but excluded from consolidated
  totals, with the account named in the UI.

### Dashboard (Phase 4)

- Net worth, total assets, total liabilities.
- Group breakdown: cash & bank, savings, investments, other assets, liabilities.
- This month's income, expenses, net cash flow, savings rate.
- 6-month income/expense/net chart, expense-by-category donut.
- Account summary, budget progress, goal progress, recent transactions.
- FX status and warnings.

### Goals

- Name, optional target amount, currency, optional deadline, linked account, note.
- Progress read from the linked account's balance, converted when the currencies
  differ. Goals never hold or duplicate money.
- Supports targets with and without a deadline, and no-target accumulation goals.
- Create, edit, remove; progress bars on the Goals page and the dashboard.

### Budget

- Monthly per-category budgets in CNY.
- Actuals derived from the ledger — the user never enters them.
- A budget on a parent category absorbs spending booked to its children.
- Foreign-currency expenses count at the rate frozen on the transaction.
- Budget page: totals, per-category table with budget / actual / remaining /
  used %, over-budget highlighting, month picker and an editor dialog.

### Reports

- Monthly report for any selected year and month.
- Income, expenses, net cash flow, savings rate, net worth.
- 12-month cash flow chart and expense-mix donut.
- Expenses and income by category with share percentages.
- Account movement: opening, in, out, closing — in each account's own currency.
- Budget vs actual, goal progress.

### Error, loading and empty states

- Every API failure returns `{code, message, details}`; the frontend never shows a
  bare 500. Example: *"Exchange rate unavailable for GBP/CNY. Refresh exchange
  rates or enter a manual rate."*
- Shared `StateBoundary` renders loading skeletons, actionable errors with retry,
  and empty states with a call to action.
- Form validation covers required fields, amount > 0, valid currency, distinct
  transfer accounts and valid dates.

---

## Verified by running the application

The full required scenario was executed against the running app in a browser,
with the backend writing to the real SQLite database:

| Step | Result |
| ---- | ------ |
| 招商银行 CNY, opening ¥20,000, Daily Spending | created |
| 中国银行 CNY, opening ¥50,000, Emergency Fund | created |
| Monzo GBP, opening £2,000, Daily Spending | created, shown as £2,000.00 ≈ ¥17,937.22 |
| Salary ¥10,000 → 招商银行 | balance ¥30,000 |
| Restaurant ¥200 from 招商银行 | balance ¥29,800 |
| Transfer ¥3,000 招商银行 → 中国银行 | ¥26,800 / ¥53,000; income, expense and net worth all unchanged |
| Tesco £20 from Monzo, Food/Groceries | stored as GBP 20.00, CNY 179.37 frozen |
| Goal: Emergency Fund ¥100,000 linked to 中国银行 | 53.0%, ¥47,000 to go |
| Budget: Food ¥3,000 | actual ¥379.37 derived automatically (¥200 + ¥179.37) |
| Monthly report | income ¥10,000, expenses ¥379.37, account movement for all three accounts |
| Dashboard | net worth ¥97,557.85 |

**FX failure path, tested live:** deleting the cached GBP rate made the header
badge read "FX rates missing", raised a dashboard warning naming Monzo, and
dropped net worth to ¥79,800 — Monzo excluded rather than valued at 1:1. Entering
a manual rate of 8.90 restored the valuation to ¥17,622.00, while the historical
Tesco expense stayed at ¥179.37 (frozen at the 8.9686 rate it was recorded with).

Checks run: `pytest` (69 passed), `tsc --noEmit`, `eslint --max-warnings 0`,
`vite build`, `npm run check:size`. The browser console is clean.

---

## Tests

69 backend tests, all passing.

| File | Tests | Covers |
| ---- | ----- | ------ |
| `test_money.py` | 11 | minor-unit conversion, JPY zero-decimal, ROUND_HALF_UP, repeated addition exactness, cross-scale conversion, rejection of non-positive rates |
| `test_accounts.py` | 7 | opening balance, balance calculation, foreign-currency valuation, duplicate names, unsupported currency, archived accounts, liability classification |
| `test_ledger.py` | 8 | income increases balance, expense decreases balance, balanced postings, native currency retained, positive-amount rule, category-kind rule, void reverses effect |
| `test_transfers.py` | 9 | same-currency transfer, transfer is not income/expense, net worth unchanged, cross-currency legs and rate, legs net to zero in CNY, same-account rejection, missing destination amount, fee as linked expense, void cascades to fee |
| `test_fx.py` | 13 | missing rate raises instead of defaulting to 1.0, cache population, offline fallback to cache, stale flagging, manual rates, cross rates via CNY, identity rate, historical FX frozen, current net worth uses latest rate, unconvertible account excluded |
| `test_budget_goal_dashboard.py` | 15 | budget actual from ledger, parent absorbs children, month isolation, foreign expense in CNY budget, income-category rejection, goal progress and conversion, goal does not change net worth, dashboard asset/liability/net worth totals, cash flow, excluded accounts, monthly report movement and breakdown |
| `test_api_end_to_end.py` | 6 | health, empty first run, the full nine-step scenario over HTTP, transfer validation message, actionable FX error, void instead of hard delete |

Frontend: no automated test suite in V1 (see Deferred). Type checking, linting,
the production build and the 350-line rule all run clean.

---

## Architecture compliance

| Invariant | Status |
| --------- | ------ |
| 1. CNY is the default consolidated reporting currency | Yes |
| 2. Native account currency is never discarded | Yes — stored per account, per transaction and per posting |
| 3. Transfers do not count as income or expense | Yes — totals read `type IN (income, expense)`; tested |
| 4. Historical reports do not change when current FX changes | Yes — rate frozen per transaction; tested live |
| 5. Money is not stored as binary floating point | Yes — integer minor units + `Decimal`; no `float()` in money paths |
| 6. Bank accounts are first-class entities | Yes — own table, pages, detail view, lifecycle |
| 7. Savings goals do not duplicate real money | Yes — progress derived from the linked account |
| 8. Net worth is calculated centrally | Yes — only `NetWorthService`; dashboard, reports and the accounts page consume it |
| 9. Sensitive financial data stays local | Yes — only currency codes leave the machine |
| 10. Backend exposed on localhost only | Yes — `127.0.0.1` |
| 11. Old OpenISave data is not migrated | Yes — no importer, no legacy compatibility, clean schema |
| 12. No handwritten frontend file exceeds 350 lines | Yes — enforced by `npm run check:size`; largest is 263 |

No conflicts with the architecture document were found, so
`docs/ARCHITECTURE_QUESTIONS.md` has not been created.

---

## Partially implemented

- **Account movement in reports** is shown in each account's native currency. A
  consolidated CNY column would need month-end balance snapshots, which are not
  yet built.
- **Net worth in a historical report** shows today's net worth, labelled as such
  in the UI, rather than the net worth as at that month end. Same reason.
- **Categories** can be created through the API and are fully hierarchical, but
  the frontend has no category management screen yet; the seeded tree is used.
- **Transfer fees** are supported end to end but have no dedicated reporting view.
- **Editing a transfer** is not supported in place; the transfer must be voided
  and re-created. This keeps the postings consistent.

---

## Deferred (not in V1)

These are intentionally out of scope for this version and do not distort the
ledger design:

- Phase 5 virtual goal allocations (several goals sharing one account). The data
  model supports adding them; V1 is one goal ↔ one linked account.
- Phase 7 assets and liabilities beyond account types: manual valuations,
  property, valuation history.
- Phase 8 investments: holdings, cost basis, market values.
- Phase 10: SQLCipher encryption, OS keychain, automated backup/restore UI,
  desktop packaging. The schema and configuration leave room for SQLCipher.
- Monthly snapshots (architecture §32 / §61).
- Recurring rules (§21), financial guidance (§26), PDF/CSV export (§62).
- Frontend automated tests.
- CSV/OFX import, Open Banking, Alipay/WeChat sync, market data, tax summaries.

---

## Known limitations

- The database is a standard SQLite file, not encrypted. Anyone with access to
  your Windows account can read it. SQLCipher is the Phase 10 plan.
- There is no authentication. This is a single-user local application bound to
  127.0.0.1.
- Backups are only taken by `scripts\reset_database.ps1`. There is no scheduled
  backup yet, and none before migrations.
- Exchange rates come from a single provider (Frankfurter/ECB). If it is
  unreachable the app uses cached rates and tells you they are stale; enter a
  manual rate if you need a fresh one.
- Frankfurter publishes on ECB business days, so a rate is typically 1–3 days
  old at weekends. The staleness threshold defaults to 3 days and is configurable.
- The frontend bundle is a single ~1.8 MB chunk (550 kB gzipped). Fine for local
  use; code splitting would be the improvement.
- The transfer form requires you to type the amount received for cross-currency
  transfers. It does not pre-fill from the market rate, deliberately — the actual
  amount your bank credited is the truth.

---

## How to run

See [`../README.md`](../README.md). In short:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_openisave.ps1
```

then open http://127.0.0.1:5173.

---

## Next recommended phase

**Phase 7 — Assets & Liabilities**, followed by monthly snapshots.

Reasons, in order:

1. Property, provident fund and loans are the largest missing pieces of an
   accurate net worth. The account types already exist; what is missing is manual
   valuation with history.
2. Monthly snapshots (§32) then become worthwhile, and they unlock the two
   "partially implemented" report items above: true month-end account balances
   and historical net worth.
3. After that, Phase 8 (investments) reuses the same valuation machinery.

Phase 10 (SQLCipher plus an automated backup and restore flow) is the right
follow-up once the data you keep in OpenISave is worth protecting properly.
