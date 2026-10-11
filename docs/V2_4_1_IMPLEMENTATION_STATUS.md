# OpenISave 2.4.1 — transaction/category UX and update notifications

Validated locally on 2026-10-11. Branch: `codex/v2.4.1-transaction-category-ux`,
based on the existing 2.4.0 checkout (`925e4af`), fast-forwarded to the merged
`origin/main` (`38eac92`) before the authorised release/install follow-up.

## User-facing behaviour

1. **Transaction entry:** accounts are grouped by currency. Currency groups are
   ordered by the number of valid recorded transactions, and accounts inside
   each group are ordered by their own usage. Income and expense are independent.
   Ties use the latest transaction date, then the existing configured account
   order. Unused accounts remain available; inactive and archived accounts are
   excluded. Voided transactions, transfers and their linked fee rows do not
   contribute to this ranking. Imported and recurring income/expense do count.
   The ranking reads the ledger, persists across app restarts and updates through
   existing ledger-query invalidation. A new empty form defaults to its most-used
   account. Switching type preserves an explicitly selected account or an amount
   already entered in its currency. Editing preserves the original transaction.
2. **Overview category charts:** only top-level categories are shown initially.
   Clicking a sector or an accessible legend button opens its child breakdown;
   percentages now refer to that parent total. Children share the parent's colour
   and use different line/dot textures in the chart and matching legend. The
   breadcrumb returns to all categories, or the previous ancestor for a third
   level. Overview shows every parent, without hiding roots in an Other bucket.
   Archived categories remain in historical totals. Direct parent entries are
   shown as a separate `(direct)` child when descendants also have transactions.
   Parent totals are calculated in the backend from frozen base-currency ledger
   values. Existing flat monthly report responses are retained.
3. **Category creation:** the modal explicitly offers Parent (top level) and
   Child (subcategory). A child can choose an existing parent or enter a new
   top-level parent name. The new parent and child are saved in one DB transaction;
   a failed child validation rolls back the new parent. Existing duplicate-name,
   kind, cycle and three-level depth rules remain. Archived parents cannot take
   new children. Category changes refresh dashboard and report queries as well.
4. **Manual update notifications:** the desktop shell reads this repository's
   public GitHub latest-release API. It accepts a valid stable version only when
   a matching Windows installer exists. Startup and hourly UI ticks share a
   persistent 24-hour successful-check cooldown; failed checks retry after one
   hour. Settings provides an explicit check, plain-text notes, per-version skip,
   and a button opening the validated GitHub release page in the default browser.
   Newer releases restore the sidebar notice. Explicit checking also redisplays
   a skipped update. No installer is downloaded or executed by the app.
   Network errors are shown separately from the last known available version and
   never claim a failed check is up to date. Cache is in Tauri's config directory,
   outside the encrypted vault, and contains no financial records or credentials.

## API and storage

- `GET /api/v1/transactions/entry-options?type=expense|income` returns ordered
  currency groups and account IDs, with usage counts; no financial amounts.
- Dashboard adds `expense_by_parent_category` and `income_by_parent_category`
  containing nested category IDs, names, amounts and children. The existing
  `expense_by_category` / `income_by_category` fields remain flat.
- `POST /api/v1/categories` accepts optional `new_parent_name`, mutually
  exclusive with `parent_id`.
- **No new 2.4.1 migration.** Alembic head remains `d9e5a1b7c302`. All version
  metadata and both package/Cargo lockfiles are synchronised to 2.4.1.
- Production data was neither read nor modified. UI writes used a verified
  temporary root `openisave-ui-fixture-v241-01a12992`, an in-memory key store,
  invented data from `scripts/ui_review_fixture.py` and additional synthetic
  income rows to demonstrate a different currency ranking.

## Validation

- Backend full suite: **354 passed, 1 skipped** (355 collected; optional real
  WeChat statement parser skipped). All runs used the existing conftest isolation.
- Frontend full suite: **182 passed in 30 files**, with two workers. A subsequent
  initial-check status fix adds a sixth update-control test (183 tests total).
  The update tests cover user-controlled download-page navigation, per-version
  skips, network failure, last known availability, initial unchecked state and
  plain-text release notes.
- Rust update logic: **6 passed** (numeric SemVer including build metadata,
  stable/complete Windows releases, URL boundaries, cooldown/manual checks,
  skip-version/offline state, atomic cache replacement and corrupt-cache recovery).
- TypeScript, ESLint, frontend file-size gate and production build passed.
  Largest handwritten frontend file remains 318 lines, below the 350-line limit.
- Browser UI: parent overview, sector/legend drill-down, child textures, return
  navigation, Light/Dark, separate CNY expense / GBP income defaults, currency
  group ordering, and real creation of Hobbies → Photography all verified on
  synthetic data. Browser console errors: zero. Original Dark preference restored.
  Screenshots and raw test/build logs are kept under git-ignored `docs/ui-review/`.
- PyInstaller backend and Tauri/NSIS Windows builds completed. Vite's existing
  large-chunk warning and the Rust linker informational warning remain.

## Delivery boundary

The installer is `release/OpenISave_2.4.1_x64-setup.exe`; the source ZIP and
checksums are assembled using `scripts/package_release.ps1` after the final build.
The user subsequently authorised publication and a per-user overwrite-install of
the final 2.4.1, including update notifications. Release assets and installed EXE
must match the rebuilt artifact; publishing the feature branch/tag does not
require merging main. Future-version notification/download behaviour is covered
by isolated fixtures and is scheduled for a real end-to-end check on the next
release, as requested by the user.

During the initial local-only iteration, an isolated smoke run of the packaged backend was rejected by automatic
approval review (`blocked by policy`, without a specific reason). That run was not
completed. Source tests and browser UI validation passed, but installed WebView/CSP,
packaged-backend runtime and real-vault upgrade smoke checks remain unverified.
No installer was launched or production vault accessed during that initial phase.
