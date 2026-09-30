# OpenISave 2.2.0 — Recurring Transactions and WeChat Statement Import

Built on the uncommitted V2.1.1 UI work on `release/v2.1.1`; nothing of it was
reverted. Version 2.2.0 is set in the backend (`APP_VERSION`, `pyproject.toml`),
both `package.json`/lockfile roots, `desktop/Cargo.toml`, `Cargo.lock`
(`openisave`) and `tauri.conf.json` (installer name and sidebar follow it).
Not committed, not built, not released.

## 1. Recurring Transactions

| Area | What exists |
|------|-------------|
| Model | `recurring_rules` (template + schedule + mode + status + `next_run_date` cursor + `last_generated_at`), `recurring_occurrences` with `UNIQUE(rule_id, occurrence_date)`, `transactions.recurring_rule_id` |
| Schedules | weekly / monthly / yearly, every *n* periods, start date, optional end date, monthly day 1–31 (31 = last day) |
| Maths | `app/services/recurrence.py`, pure; occurrence *k* computed from the start date (no drift): 31 Jan → 28/29 Feb → 31 Mar → 30 Apr; 29 Feb yearly → 28 Feb in common years |
| Modes | **Review first** (default): due items listed with Create / Skip. **Automatic**: created by `POST /recurring/process-due`, which the app calls once per launch |
| Lifecycle | create, edit (schedule edits move the cursor), pause, resume (continues from today), archive (history kept) |
| Ledger | every occurrence goes through `LedgerService` (`commit=False`) → postings, frozen FX, reports, budgets unchanged in behaviour |
| Idempotency | occurrence row + transaction in one DB transaction; repeated calls return the existing occurrence; a racing insert hits the UNIQUE key and rolls back; voiding a generated transaction does not free its date |
| UI | Sidebar → **Recurring** (table: name, schedule, amount, next date + due count, account, category, mode, status; Edit/Pause/Resume/Archive; *Due now* list; *Coming up* list). Overview → **Upcoming** card (next 14 days, hidden when there are no schedules) |

API: `GET/POST /recurring`, `GET/PATCH /recurring/{id}`, `POST /recurring/{id}/pause|resume|archive`,
`GET /recurring/upcoming?days=`, `POST /recurring/{id}/occurrences/{date}/generate|skip`,
`POST /recurring/process-due`.

## 2. WeChat Pay statement import

Flow: Transactions → Import → *WeChat Pay Statement* → choose `.xlsx` →
**Parse** (memory only) → **Preview** → **Account mapping** → **Auto
categorisation** → **Review** → **Confirm import** (atomic). Nothing is written
before Confirm.

| Area | What exists |
|------|-------------|
| Abstraction | `StatementImporter` protocol (`app/importers/base.py`), `WeChatStatementImporter`, registry for future Monzo/HSBC/CSV importers |
| Header detection | scans each sheet (up to 200 rows) for the required columns; full-width parentheses and whitespace tolerated; missing columns → "Unsupported format … missing 交易单号" |
| Values | amount via Decimal → fen (≤ 2 decimals, float cells read from their shortest repr); 交易单号 kept as string, numeric cells rejected; "/" = empty; `转账备注:` split into the note |
| Dates | `occurred_at` is timezone-aware (+08:00); `source_date` is the Asia/Shanghai calendar date and becomes `transaction_date`, independent of the computer's zone; both plus `source_timezone` are stored on the import reference |
| Skip vs ignore | *Skip this import*: not recorded, needs review next time. *Ignore permanently*: `import_ignored_items UNIQUE(source, external_id)`, shown as Ignored in later statements, listed under *Ignored items* on the import page with Restore |
| Movements | income / expense / transfer (零钱充值, 零钱提现, 零钱通, 信用卡还款, 理财通, neutral 收/支) / needs review (refunds, unmappable neutral rows) / ignored (failed, closed, returned) |
| Account mapping | per funding label, persisted in `import_account_mappings`, remembered on confirm; CNY accounts only |
| Duplicates | `external_transaction_refs UNIQUE(source, external_id)`; preview shows *Already imported*; also detects repeats inside one file |
| Provenance | `transactions.external_source/external_transaction_id/import_batch_id/classification_rule_id`; raw merchant, product, payment method, status, note, merchant order id and classification reason on the ref |
| History | `import_batches` (detected / imported / duplicates / skipped / ignored) with transaction ids |

## 3. Deterministic categorisation rules

`categorisation_rules` with origin user/system, match field (merchant, product,
note, any text, statement type), exact/contains, optional second keyword,
direction, category, priority, enabled. Order: user rules → exact merchant →
merchant keyword → product keyword → note keyword → statement-type fallback →
needs review. 18 built-ins are seeded (idempotently, never overwriting edits),
e.g. ROOFOODS LTD → Food › Delivery, 同程旅行+机票 → Flights, 哔哩哔哩+连续包月 →
Subscriptions, DeepSeek → Lifestyle › Software & AI (new seed category),
微信红包 received → Gift. Rules pointing at archived categories are skipped.
Review rows can be corrected with *Remember this rule*; the rule applies to
similar rows in the same preview at once and is saved on confirm.
Managed under Categories → **Auto-categorisation rules** (view, create, edit,
enable/disable, delete user rules, reorder user rules).

**No AI is used or required** for parsing or classification.

## 4. Migrations

`a7c3e91f4b2d_recurring_and_statement_import` (after `5d1c7e9a2b40`). Additive
only: six new tables and five nullable columns on `transactions` (indexed, no
FK clause, because SQLite would have to rebuild `transactions`). Verified:
model/DB diff empty, existing rows preserved, downgrade round-trip, and the
existing SQLCipher migration tests run it over an encrypted vault. The app
takes its usual pre-migration encrypted backup before applying it.

`c4d8f2a6e913_import_ignores_and_source_date` (after `a7c3e91f4b2d`):
`import_ignored_items` table and `external_transaction_refs.source_date /
source_timezone`. Additive; model/DB diff empty; downgrade round-trip verified.

## 5. Tests

- Backend: **313 passed, 1 skipped** (baseline 217). New: `test_recurring.py`
  (32), `test_wechat_parser.py` (27, incl. the opt-in real-sample test enabled
  with `OPENISAVE_WECHAT_SAMPLE`), `test_statement_import.py` (19),
  `test_import_dates.py` (12, incl. subprocess runs under London, UTC, Los
  Angeles and China local time), `test_import_ignore.py` (7).
  `test_networth_classification.py` now compares FX rates as Decimal: its
  string comparison flipped between "1" and "1.0000000000" whenever garbage
  collection made SQLAlchemy reload the row.
- Frontend: **65 tests / 18 files** (baseline 46 / 12), typecheck, lint,
  `check:size` and production build all pass.

## 6. Known limits / follow-ups

- Refunds always go to review; a future option could net them against the
  original purchase.
- Resume skips occurrences that fell during a pause; there is no "catch up"
  option yet.
