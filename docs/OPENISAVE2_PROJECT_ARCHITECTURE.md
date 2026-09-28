# OpenISave 2.0 — Project Architecture & Engineering Charter

> **Document role:** This file is the architectural constitution of OpenISave 2.0.  
> All future implementation, refactoring, code review, and feature design should follow the principles and constraints defined here unless this document is explicitly amended.

---

## 1. Project Vision

OpenISave 2.0 is a **local-first personal finance management application** designed for a single user who manages money across multiple bank accounts, currencies, savings goals, assets, liabilities, and spending categories.

The system is not only an expense tracker. It is intended to function as a personal finance operating system covering:

- Daily income and expense tracking
- Multi-currency bookkeeping
- Multiple bank account management
- Purpose-based fund allocation
- Savings goals
- Monthly budgets
- Assets and liabilities
- Investment tracking
- Net worth calculation
- Monthly financial reporting
- Financial planning guidance
- Local encrypted storage
- RMB/CNY-based consolidated reporting

The product must remain:

- Simple enough for one person to run locally
- Reliable enough to serve as a long-term financial record
- Modular enough to support future expansion
- Privacy-first
- Auditable
- Easy to maintain

---

# 2. Core Product Principles

## 2.1 Local First

All sensitive personal financial information must remain on the user's local machine.

The following data must never require cloud storage:

- Salary
- Bank balances
- Transactions
- Assets
- Liabilities
- Savings goals
- Investment positions
- Budget information
- Personal financial reports

External network access is allowed only for clearly defined non-sensitive services such as exchange-rate retrieval.

The application must remain usable without Internet access using cached data.

---

## 2.2 RMB as Base Reporting Currency

The application's default and primary reporting currency is:

```text
CNY
```

All consolidated financial views use CNY unless the user explicitly chooses otherwise in the future.

However, original account balances and transactions must remain stored in their native currency.

Example:

```text
HSBC UK
Native balance: GBP 8,500

Dashboard reporting value:
≈ CNY 82,xxx
```

The application must never permanently replace the original GBP balance with its RMB equivalent.

---

## 2.3 Native Currency Is the Source of Truth

Every monetary record must retain:

- Native amount
- Native currency
- Relevant FX rate
- CNY equivalent when required for reporting

Historical financial statements must use the exchange rate associated with the historical transaction or reporting snapshot.

Current net worth may use the latest available exchange rate.

---

## 2.4 Bank Accounts Are First-Class Entities

A bank account is not merely a label attached to a transaction.

Bank accounts are a core part of the domain model.

The user must be able to create and manage multiple bank accounts for different purposes.

Examples:

```text
招商银行 — Daily Spending
中国银行 — Emergency Fund
HSBC UK — UK Daily Expenses
Monzo — Travel
Alipay
WeChat Pay
Trading 212 Cash
```

Each account should independently maintain:

- Account name
- Institution
- Account type
- Currency
- Current balance
- Opening balance
- Purpose
- Optional note
- Whether it contributes to net worth
- Whether it is active or archived

The application must support purposeful fund separation.

Example:

```text
招商银行
Purpose: Daily spending

中国银行
Purpose: Emergency fund

Monzo
Purpose: UK daily expenses

HSBC Savings
Purpose: Long-term savings
```

---

# 3. Legacy OpenISave Policy

OpenISave 2.0 is a clean redesign.

The previous OpenISave database and transaction history will **not** be migrated.

Therefore:

- No old database migration script is required.
- No backwards compatibility with `finance.db` is required.
- No backwards compatibility with `finance_web.db` is required.
- No legacy API compatibility is required.
- Old data models must not constrain the new architecture.

The old repository may be used only as:

- UX reference
- Feature reference
- Lessons learned
- Exchange-rate implementation reference

OpenISave 2.0 starts with a clean database.

---

# 4. Recommended Technology Stack

## 4.1 Frontend

```text
React
TypeScript
Vite
```

Recommended supporting libraries:

```text
React Router
TanStack Query
Zod
ECharts or Recharts
Ant Design OR shadcn/ui
```

Choose one major UI system and use it consistently.

Do not mix multiple competing component libraries unless there is a strong reason.

---

## 4.2 Backend

```text
Python
FastAPI
Pydantic
SQLAlchemy 2.x
Alembic
```

FastAPI responsibilities:

- REST API
- Validation
- Application orchestration
- Local service layer access

FastAPI routes must not contain substantial business logic.

---

## 4.3 Database

Primary database:

```text
SQLite
```

Production/local encrypted option:

```text
SQLCipher
```

SQLite is preferred because:

- Single-user application
- Local-first architecture
- No external database server
- Easy backup
- Easy recovery
- Small deployment footprint

---

# 5. High-Level Architecture

```text
┌─────────────────────────────────────────────┐
│                 Frontend                    │
│                                             │
│ React + TypeScript + Vite                   │
│                                             │
│ Dashboard                                   │
│ Transactions                                │
│ Bank Accounts                               │
│ Savings Goals                               │
│ Budgets                                     │
│ Assets & Liabilities                        │
│ Investments                                 │
│ Reports                                     │
│ Settings                                    │
└─────────────────────┬───────────────────────┘
                      │
                      │ REST / JSON
                      ▼
┌─────────────────────────────────────────────┐
│                  FastAPI                    │
│                                             │
│ API Layer                                   │
│ Service Layer                               │
│ Domain Logic                                │
│                                             │
│ Ledger Service                              │
│ Account Service                             │
│ FX Service                                  │
│ Budget Service                              │
│ Goal Service                                │
│ Net Worth Service                           │
│ Asset Service                               │
│ Report Service                              │
│ Backup Service                              │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│          SQLAlchemy + SQLite/SQLCipher      │
│                                             │
│ Local encrypted financial database          │
└─────────────────────────────────────────────┘

                    Optional Internet
                          │
                          ▼
                 Exchange Rate Provider
```

---

# 6. Backend Layering Rules

The backend must use explicit layers.

```text
API
↓
Application / Service Layer
↓
Domain Logic
↓
Repository / Database
```

## 6.1 API Layer

Responsibilities:

- Parse request
- Validate input
- Call service
- Return response
- Convert application exceptions to HTTP responses

Must NOT:

- Perform complex SQL
- Calculate financial reports directly
- Implement budget algorithms
- Perform FX conversions directly
- Calculate account balances directly

---

## 6.2 Service Layer

Responsibilities:

- Business workflows
- Financial rules
- Domain coordination
- Transaction boundaries

Examples:

```text
create_transaction()
transfer_between_accounts()
calculate_net_worth()
allocate_goal_funds()
generate_monthly_report()
refresh_exchange_rates()
```

---

## 6.3 Repository Layer

Responsibilities:

- Database reads
- Database writes
- Query encapsulation

Examples:

```text
AccountRepository
TransactionRepository
FxRateRepository
GoalRepository
BudgetRepository
AssetRepository
```

Business rules must not live inside repository classes.

---

# 7. Backend Directory Structure

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   └── v1/
│   │       ├── accounts.py
│   │       ├── transactions.py
│   │       ├── categories.py
│   │       ├── fx.py
│   │       ├── goals.py
│   │       ├── budgets.py
│   │       ├── assets.py
│   │       ├── investments.py
│   │       ├── reports.py
│   │       └── settings.py
│   │
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── money.py
│   │   ├── exceptions.py
│   │   └── logging.py
│   │
│   ├── db/
│   │   ├── base.py
│   │   ├── session.py
│   │   └── migrations/
│   │
│   ├── models/
│   │   ├── account.py
│   │   ├── transaction.py
│   │   ├── posting.py
│   │   ├── category.py
│   │   ├── fx_rate.py
│   │   ├── recurring_rule.py
│   │   ├── goal.py
│   │   ├── budget.py
│   │   ├── asset.py
│   │   ├── investment.py
│   │   └── snapshot.py
│   │
│   ├── schemas/
│   │   ├── account.py
│   │   ├── transaction.py
│   │   ├── goal.py
│   │   ├── budget.py
│   │   ├── asset.py
│   │   └── report.py
│   │
│   ├── repositories/
│   │   ├── accounts.py
│   │   ├── transactions.py
│   │   ├── fx.py
│   │   ├── goals.py
│   │   ├── budgets.py
│   │   └── assets.py
│   │
│   ├── importers/            statement parsers (2.2)
│   │   ├── base.py
│   │   └── wechat.py
│   │
│   ├── services/
│   │   ├── ledger_service.py
│   │   ├── account_service.py
│   │   ├── fx_service.py
│   │   ├── budget_service.py
│   │   ├── goal_service.py
│   │   ├── asset_service.py
│   │   ├── investment_service.py
│   │   ├── networth_service.py
│   │   ├── report_service.py
│   │   └── backup_service.py
│   │
│   └── providers/
│       └── fx/
│           ├── base.py
│           └── default_provider.py
│
├── tests/
├── alembic.ini
└── pyproject.toml
```

---

# 8. Frontend Architecture

Frontend code must be feature-oriented.

```text
frontend/
│
├── src/
│   ├── app/
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── App.tsx
│   │
│   ├── api/
│   │   ├── client.ts
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── goals.ts
│   │   ├── budgets.ts
│   │   ├── assets.ts
│   │   ├── fx.ts
│   │   └── reports.ts
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── charts/
│   │   ├── tables/
│   │   └── common/
│   │
│   ├── features/
│   │   ├── dashboard/
│   │   ├── transactions/
│   │   ├── accounts/
│   │   ├── goals/
│   │   ├── budgets/
│   │   ├── assets/
│   │   ├── investments/
│   │   ├── reports/
│   │   └── settings/
│   │
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   ├── constants/
│   └── styles/
│
├── tests/
├── package.json
└── vite.config.ts
```

---

# 9. Mandatory Frontend File Size Rule

## HARD RULE

Every frontend source file must remain below:

```text
350 lines
```

This rule applies to:

```text
.ts
.tsx
.js
.jsx
.css
.scss
```

Generated files and lockfiles are excluded.

### Target size

Although 350 lines is the absolute maximum, normal frontend files should ideally remain:

```text
50–250 lines
```

When a file approaches 300 lines, consider refactoring before adding more code.

---

## 9.1 Required Refactoring Strategy

If a page becomes too large, split by responsibility.

Bad:

```text
DashboardPage.tsx
650 lines
```

Good:

```text
DashboardPage.tsx
DashboardSummaryCards.tsx
NetWorthChart.tsx
CashFlowChart.tsx
BudgetStatus.tsx
RecentTransactions.tsx
SavingsGoalsSummary.tsx
```

---

## 9.2 Components Must Have One Primary Responsibility

Avoid components that simultaneously:

- Fetch data
- Transform data
- Manage modal state
- Render charts
- Render forms
- Perform calculations
- Handle API calls

Separate them.

Recommended pattern:

```text
feature/
├── api.ts
├── hooks.ts
├── types.ts
├── utils.ts
├── components/
└── page.tsx
```

---

## 9.3 No Giant Utility Files

Avoid:

```text
utils.ts
1200 lines
```

Instead:

```text
utils/
├── currency.ts
├── dates.ts
├── percentages.ts
├── reports.ts
└── validation.ts
```

---

# 10. Money Representation

## 10.1 Never Use Binary Float for Stored Money

Forbidden:

```python
amount = 123.45
```

as a database monetary representation.

Recommended:

```text
amount_minor = 12345
currency = CNY
```

For CNY:

```text
¥123.45
→
12345 fen
```

For GBP:

```text
£123.45
→
12345 pence
```

---

## 10.2 FX Values

Exchange rates should use decimal-safe numeric types.

Python:

```text
Decimal
```

Database:

```text
NUMERIC / DECIMAL-compatible representation
```

Never rely on ordinary binary float for financial calculations.

---

# 11. Core Domain Model

The application should distinguish between:

```text
Account
Transaction
Posting
Category
FX Rate
Budget
Goal
Asset
Liability
Investment
Snapshot
```

---

# 12. Account Model

Accounts represent locations where financial value exists.

Possible types:

```text
bank
cash
ewallet
savings
credit_card
loan
investment
provident_fund
property
other_asset
other_liability
```

Recommended fields:

```text
id
name
institution
account_type
currency
purpose
opening_balance_minor
include_in_net_worth
is_active
is_archived
note
created_at
updated_at
```

---

# 13. Bank Account Management

The application must provide a dedicated **Bank Accounts** area.

The user must be able to:

- Create account
- Rename account
- Set bank/institution
- Set currency
- Set purpose
- Set opening balance
- View current balance
- View transaction history
- Transfer money between accounts
- Archive account
- Exclude an account from net worth if necessary

Example:

```text
Account: 中国银行储蓄账户
Institution: Bank of China
Currency: CNY
Purpose: Emergency Fund
Current Balance: ¥67,000
```

Another:

```text
Account: Monzo
Institution: Monzo
Currency: GBP
Purpose: UK Daily Expenses
Current Balance: £2,180
```

---

# 14. Account Purpose

Each account may have an optional purpose.

Suggested purposes:

```text
Daily Spending
Bills
Emergency Fund
Long-Term Savings
Travel
Investment
Education
Housing
Business
Other
```

Purpose is descriptive metadata.

Purpose must not replace formal account types or goal relationships.

---

# 15. Ledger Model

OpenISave 2.0 should use a lightweight double-entry-inspired ledger.

The user interface must remain simple.

Example user action:

```text
Tesco
£35
Food
Monzo
```

Internally:

```text
Transaction
├── Posting: Monzo        -3500 GBP minor units
└── Posting: Food          3500 GBP equivalent classification
```

This ledger design prevents future inconsistencies when handling transfers, multi-currency accounts, liabilities, and savings.

---

# 16. Transaction Types

Supported high-level transaction intentions:

```text
expense
income
transfer
adjustment
asset_purchase
asset_sale
investment_buy
investment_sell
```

The frontend may initially expose only:

```text
expense
income
transfer
```

while advanced types can be added later.

---

# 17. Transfers Between Accounts

Transfers must never be counted as ordinary income or expense.

Example:

```text
Transfer:
HSBC UK
→
Monzo

GBP 500
```

Financial effect:

```text
HSBC: -500 GBP
Monzo: +500 GBP
```

Total net worth remains unchanged.

For cross-currency transfers:

```text
HSBC GBP
→
招商银行 CNY
```

The transaction should record:

```text
source amount
source currency
destination amount
destination currency
exchange rate
fees
```

Fees may be classified separately as an expense.

---

# 18. Categories

Expense categories should be hierarchical.

Example:

```text
Housing
├── Rent
├── Utilities
└── Maintenance

Food
├── Groceries
├── Restaurants
├── Coffee
└── Delivery

Transport
├── Public Transport
├── Taxi
├── Fuel
└── Rail

Lifestyle
├── Entertainment
├── Shopping
├── Clothing
└── Subscriptions
```

Categories should be configurable.

## 18.1 Hierarchy Rules

Expense and income categories form separate trees.

```text
maximum depth: 3 levels (a root plus two levels of nesting)
```

A category's `kind` can never change. A child always shares its parent's kind.

A category can never become its own ancestor; moving a category into its own
subtree must be rejected. Names must be unique among siblings, but the same
name may appear under different parents.

## 18.2 Archiving, Not Deleting

Financial history must stay readable, so a category that anything references is
archived rather than deleted.

```text
category referenced by a transaction, posting or budget
→ archive only

category referenced by nothing, and with no children
→ may be deleted outright
```

Archiving a category archives its whole branch, so nothing orphaned stays
selectable. A child cannot be restored while its parent is archived.

Archived categories disappear from pickers but continue to render on the
historical transactions filed under them.

## 18.3 Usage Visibility

The category manager shows how many non-voided transactions use each category,
both directly and across its branch, so the user can tell what is safe to
change.

---

# 19. Income Model

Income examples:

```text
Salary
Bonus
Freelance
Part-Time
Investment Income
Interest
Gift
Other
```

Recurring salary records should support:

```text
gross salary
net salary
pay date
currency
destination bank account
```

Future extensions may include payroll details.

---

# 20. Provident Fund

Provident fund should be modeled as an asset account.

Example:

```text
Account:
Housing Provident Fund

Type:
provident_fund

Currency:
CNY
```

Payroll configuration may include:

```text
employee contribution %
employer contribution %
```

Monthly contribution should increase the provident fund account balance.

---

# 21. Recurring Rules

Recurring rules should support:

```text
salary
rent
subscriptions
utilities
loan payments
savings transfers
```

Recommended fields:

```text
frequency
amount
currency
source account
destination account
category
start date
optional end date
```

The system should never silently create financial records without user awareness.

Recommended initial implementation:

```text
Generate expected recurring items
→
User confirms
→
Create transaction
```

## 21.1 Implementation (2.2)

```text
recurring_rules         the template: type, account(s), category, amount,
                        frequency (weekly|monthly|yearly), interval, start_date,
                        optional end_date, day_of_month, next_run_date cursor,
                        mode (review|automatic), status (active|paused|archived)
recurring_occurrences   one row per handled scheduled date:
                        UNIQUE(rule_id, occurrence_date), status generated|skipped,
                        transaction_id
transactions.recurring_rule_id   provenance of a generated transaction
```

Rules never pre-create future transactions. Schedule maths lives in
`services/recurrence.py` and is pure: the k-th occurrence is computed from the
start date (never by stepping from the previous one), so the 31st becomes
28/29 Feb and 30 Apr but returns to the 31st in May, and 29 Feb yearly rules
fall on 28 Feb in common years. `day_of_month = 31` means "last day".

Modes:

```text
review (default)   due items appear on the Overview/Recurring page; the user
                   presses Create (or Skip) for each one
automatic          POST /recurring/process-due, called once per app launch,
                   creates every due occurrence; a failure (e.g. no FX rate)
                   stops that rule at the failing date, never skipping ahead
```

Generation calls `LedgerService.create_transaction/create_transfer` with
`commit=False`, inserts the occurrence row, and commits once. A retry, a
second trigger, a crash-and-restart or two processes can therefore create at
most one transaction per (rule, date): the second attempt finds the row or
hits the UNIQUE constraint and rolls back. Voiding a generated transaction
does not free its date. Pausing stops generation; resuming continues from the
resume date (occurrences that fell in the pause are not created). Archiving
stops a rule for good and keeps its history.

---

# 21A. Statement Import and Deterministic Categorisation (2.2)

Statement files are imported locally; this is **not** a WeChat Pay API
integration (section 54 still applies).

```text
importers/base.py      StatementImporter protocol, StatementRow, Movement
importers/wechat.py    WeChatStatementImporter (.xlsx)
services/import_staging.py            parsed rows held in memory under a token
services/import_preview.py            per-row plan (pure)
services/statement_import_service.py  parse / preview / confirm / history
services/categorisation_service.py    rules and the Classifier
```

## 21A.1 Parsing

- The header row is found by scanning for the required columns
  (交易时间 交易类型 交易对方 收/支 金额(元) 支付方式 当前状态 交易单号); the preamble
  length is never assumed. A workbook without them is rejected as unsupported.
- 金额 → Decimal → integer fen (at most two decimals, no float arithmetic).
- 交易单号 must be a text cell; a numeric cell (already rounded by Excel) is
  rejected rather than silently corrupted.
- 交易时间 is Asia/Shanghai (UTC+08:00) regardless of the computer's timezone.
  Two values are kept, deliberately distinct:

  ```text
  occurred_at   timezone-aware instant, e.g. 2026-09-12T01:30:00+08:00
  source_date   the statement's own calendar date in its source zone
                (importers/base.py source_calendar_date), e.g. 2026-09-12
  ```

  `source_date` becomes the ledger `transaction_date`, so budgets, reports and
  the heatmap file the row under the day printed on the statement — never the
  computer's local date (the same instant is 11 Sep 18:30 in London). The
  import reference stores `occurred_at`, `source_date` and `source_timezone`.
  A naive time is refused rather than read in the local zone.
- The file is parsed from memory. It is never written to disk, never kept after
  parsing and never logged; parsed rows live in memory only until confirm
  (30-minute expiry).

## 21A.2 Movement rules (WeChat vocabulary)

```text
商户消费 / 转账 / 红包 with 收入 or 支出   income or expense (category by rules)
零钱充值, 零钱提现, 零钱通转入/转出,
信用卡还款, 理财通, other 收/支 "/"      transfer between two mapped accounts
refunds (…-退款, 已退款)                 needs review
failed / closed / returned              ignored
anything not provable from the row      needs review — never income/expense
```

## 21A.3 Account mapping

Each funding label (零钱, 中国银行储蓄卡(8080), 零钱通…) maps to an account through
`import_account_mappings (source, label) UNIQUE`. Mappings are data chosen by
the user and remembered on confirm; no card number is hard-coded. Only accounts
in the statement currency (CNY) can receive its rows.

## 21A.4 Duplicate protection

`external_transaction_refs UNIQUE(source, external_id)` records every imported
row (plus raw merchant, product, payment method, status, note and the
classification reason). The preview marks known ids as *Already imported*; the
constraint is the real guard at confirm time. References survive edits (which
void and replace a transaction) and voids, so a row deliberately deleted is not
re-imported either.

A row the user does not want is handled in one of two ways:

```text
Skip this import     nothing is recorded; the row needs review again next time
Ignore permanently   import_ignored_items UNIQUE(source, external_id) is written
                     in the same atomic confirm; every later statement shows the
                     row as Ignored. Restoring deletes the record.
```

Precedence in the preview: already imported → permanently ignored → ignore
requested now → not a completed payment → skip requested now → planning.

## 21A.5 Categorisation (no AI)

Rules match a statement field (merchant, product, note, any text, statement
type) exactly or by keyword, optionally with a second keyword condition, and
file income or expense under one category. Order:

```text
1 user rules (user-defined priority)
2 built-in exact merchant rules
3 built-in merchant keyword rules
4 built-in product keyword rules
5 built-in note / text keyword rules
6 built-in statement-type fallbacks (微信红包 received → Gift)
7 otherwise → needs review
```

A rule whose category is archived or of the wrong kind is skipped. Every
imported transaction stores `classification_rule_id`; the preview shows the
rule's explanation. Corrections can be remembered as user rules; a remembered
correction immediately classifies similar rows in the same preview and is
saved only if an imported row uses it.

## 21A.6 Atomic import

Confirm re-plans the statement, refuses while rows need review (unless the
user explicitly skips them), then writes the batch, rules, mappings, every
ledger transaction (through LedgerService with `commit=False`) and every
reference in ONE database transaction. Any failure rolls all of it back.

---

# 22. Exchange Rate Engine

The FX system must support:

```text
CNY
GBP
USD
EUR
JPY
CAD
AUD
```

with future extensibility.

---

## 22.1 Exchange Rate Provider Abstraction

Never hardcode the entire system to one API.

Interface concept:

```text
FxProvider
├── get_latest_rates()
└── get_rate(base, quote, date)
```

Providers can later be replaced without changing domain logic.

---

## 22.2 FX Failure Policy

Forbidden:

```text
missing rate
→
assume 1.0
```

Required logic:

```text
Latest API rate
↓
if unavailable
Cached rate
↓
if stale
Show warning
↓
if unavailable
Require manual rate
```

---

## 22.3 Historical FX

Historical transactions must preserve their reporting conversion.

Example:

```text
2026-01-01

Expense:
GBP 100

GBP/CNY on transaction:
9.10

Historical CNY value:
910
```

Future exchange-rate movement must not modify the historical January report.

---

## 22.4 Current Net Worth FX

Current account and asset values may use latest available rates.

Therefore:

```text
Historical report
→ historical FX

Current net worth
→ latest FX
```

---

# 23. Savings Goals

Savings goals are separate from bank accounts.

Example:

```text
Goal:
Emergency Fund

Target:
¥100,000

Current allocated:
¥36,000
```

Possible goal types:

```text
Target amount + deadline
Target amount without deadline
No target, accumulation only
```

Examples:

```text
Emergency Fund
Target ¥100,000

Travel Fund
Target ¥30,000

General Savings
No target
```

---

# 24. Linking Goals to Accounts

A goal aggregates **one or more** accounts. The relationship is many-to-many:

```text
goals
goal_accounts
accounts
```

`goal_accounts` holds at least `goal_id`, `account_id` and `created_at`, and is
easy to extend should a future version need per-link configuration.

## 24.1 Selection Modes

A goal chooses its accounts in one of two ways:

```text
selected       the user picks specific accounts
all_eligible   every eligible account, followed automatically
```

## 24.2 Eligibility Rule

An account is eligible for savings goals when **all** of the following hold:

```text
is_active = true
is_archived = false
include_in_net_worth = true
account_type is not a liability type
```

Liability types (`credit_card`, `loan`, `other_liability`) are never savings and
can never be selected for a goal.

An `all_eligible` goal re-evaluates this rule on every read, so new accounts
join and archived accounts leave automatically. Accounts a user picked
explicitly stay in the goal even if they later stop being eligible, so a total
never moves silently; the UI flags them instead.

## 24.3 Aggregation

```text
Goal current value =
Σ (each linked account balance, converted to the goal currency)
```

Rules:

- A negative account balance contributes zero, not a deduction.
- Conversion uses the existing FX service. An account with no usable rate is
  excluded from the total and named in the response — never valued at 1.0.

## 24.4 Goals Never Hold Money

Goal allocations must not duplicate real cash. They are labels over existing
account balances.

The same account may belong to any number of goals. This is a reporting
relationship, so it must not:

```text
change any account balance
change total assets or net worth
change income or expense
create virtual cash
```

The UI may point out that an account is shared between goals, but must not
forbid it.

---

# 25. Budget System

Budget must operate monthly.

Example:

```text
September 2026

Housing       ¥13,000
Food           ¥3,500
Transport      ¥1,500
Entertainment  ¥2,000
Shopping       ¥2,000
```

Each category should show:

```text
Budget
Actual
Remaining
Percentage used
```

---

# 26. Financial Guidance

Financial guidance should be rule-based and explainable.

Initial guidance may use:

```text
income
fixed expenses
historical spending
savings goals
debt obligations
monthly surplus
```

Example:

```text
Food spending:
6-month median ¥3,420

Recommended monthly range:
¥3,300–¥3,600
```

Avoid opaque recommendations.

The system should show why a recommendation was generated.

---

# 27. Assets

Assets include:

```text
Cash
Bank savings
Provident fund
Investments
Property
Vehicles
Other assets
```

Non-bank assets should support manual valuation updates.

Example:

```text
Property

Value:
£500,000

Last updated:
2026-09-20
```

Each valuation update should create a historical snapshot.

---

# 27A. Physical Assets

Physical possessions — laptops, phones, cameras, vehicles, furniture — are a
first-class entity, not merely an account type.

```text
asset_categories
assets
asset_valuations
```

Asset categories are deliberately separate from transaction categories: one
describes a thing you own, the other describes where money went.

## 27A.1 Asset Fields

```text
name, asset_category_id, description
purchase_date, purchase_price_minor, purchase_currency, purchase_base_minor
status (holding | sold | disposed)
sale_date, sale_price_minor, sale_currency, sale_base_minor
include_in_net_worth
linked_liability_id
note, created_at, updated_at
```

Purchase and sale amounts keep their native currency plus a frozen base value,
exactly as transactions do.

## 27A.2 Valuation Policy

Valuations are appended to `asset_valuations`, never overwritten, so
depreciation stays visible.

Current value resolution:

```text
latest valuation
↓ if none
purchase price, labelled "using purchase value" in the UI
```

The fallback must always be visible so an estimate is never mistaken for a
current market value.

## 27A.3 Holding Cost

These definitions are implemented once, in the asset service. No frontend page
recomputes them.

```text
days_held        = elapsed whole days from purchase to the reference date,
                   floored at 1 (an asset bought today has been held one day)

while held:
holding_cost/day = purchase price / days_held

once sold:
net_cost         = purchase price - sale proceeds
ownership_days   = elapsed whole days from purchase to sale, floored at 1
effective/day    = net_cost / ownership_days
```

## 27A.4 Assets and Net Worth (revised in 2.1)

Net worth counts **stores of wealth only**. Personal possessions are tracked
with every feature above (valuations, days held, holding cost, sale, net
ownership cost) but never enter Total Assets or Net Worth.

```text
asset_categories.include_in_net_worth_default
    Property            true
    Investment Asset    true   (when created)
    Electronics         false
    Vehicle             false
    Furniture           false
    Collectibles        false
    Other / none        false

assets.include_in_net_worth          effective flag (always stored)
assets.include_in_net_worth_manual   false → follows the category default
                                     true  → explicit user choice, kept when
                                             the category changes
```

The rule lives in the asset service; the frontend only displays it. An
untouched "Include in net worth" toggle is sent as `null` ("follow the
category"). Changing the flag or a category default changes the asset row
only — never the ledger.

```text
status = holding AND include_in_net_worth = true
→ counted in Total Assets (= "Net Worth Assets") at its current value

status = holding AND include_in_net_worth = false
→ summed separately as personal_possessions_minor: a reference figure,
  excluded from every total

status = sold or disposed
→ removed from current assets, history retained
```

Examples:

```text
MacBook 18,000 paid from the bank            bank -18,000   net worth -18,000
Laptop 20,000 = 8,000 cash + 12,000 financed cash -8,000, debt +12,000
                                             net worth -20,000
Property 500,000 = 200,000 cash + 300,000 mortgage
                                             asset +500,000, debt +300,000
                                             net contribution +200,000
                                             (net worth unchanged: cash → equity)
```

An asset with no usable exchange rate is excluded from consolidated totals and
named, like an account in the same position.

## 27A.5 Buying and Selling Is Not Spending

Buying an asset changes the *form* of value, it does not consume it. The ledger
uses the reserved transaction types:

```text
asset_purchase
asset_sale
```

Postings for an asset purchase:

```text
cash account        -cash portion
liability account   -financed portion   (optional)
asset leg           +purchase price
```

These sum to zero and the type is not `income` or `expense`, so cash-flow
totals are unaffected. Whether net worth moves depends on 27A.4: an included
asset offsets the cash, a personal possession does not.

Postings for an asset sale:

```text
destination account +proceeds
asset leg           -proceeds
```

Net worth then moves only by the difference between the asset's carrying value
and what it actually fetched.

Recording an asset **without** a payment is legitimate and means "I already
owned this": the asset is tracked (and joins net worth if included) with no
cash movement.

---

# 28. Liabilities

Liabilities include:

```text
Credit cards
Personal loans
Mortgage
Financing / instalments
Other debt
```

Net worth formula:

```text
Net Worth =
Total Assets
-
Total Liabilities
```

All values should be converted to CNY for consolidated reporting.

## 28.1 One Source of Truth for Outstanding Debt

There must be exactly one place that records how much is owed.

```text
Account          = the balance container (carries the debt as a negative balance)
Liability record = contract metadata only
```

The `liabilities` table therefore stores no balance. It holds:

```text
name, liability_type, account_id (unique)
original_amount_minor, currency
start_date, end_date, interest_rate_percent
lender, note
```

Outstanding is always derived:

```text
outstanding = -(linked account balance), floored at zero
```

Creating a liability without an existing account creates its liability account
automatically. Deleting a liability removes the metadata only — the account and
its transaction history survive.

## 28.2 Repayments

A repayment is an ordinary transfer from a cash account to the liability
account. It therefore leaves net worth unchanged and is neither income nor
expense.

## 28.3 Assets and Liabilities Are Distinct

An asset may reference the liability financing it (`linked_asset`), but the two
remain separate objects with separate values:

```text
Asset:     Laptop            ¥20,000
Liability: Apple Financing   ¥12,000 outstanding
```

Buying that laptop with ¥8,000 cash and ¥12,000 financing must leave net worth
unchanged.

---

# 29. Investments

Initial investment support should remain simple.

Recommended structure:

```text
Investment Account
↓
Holdings
↓
Valuation
```

Holding fields may include:

```text
symbol/name
quantity
cost basis
currency
manual/current price
market value
```

Automatic market data is optional and should not be required for the first production version.

---

# 30. Dashboard

Main dashboard should include:

```text
Total Net Worth

Cash
Savings
Investments
Other Assets
Liabilities

This Month Income
This Month Expenses
Net Cash Flow

Savings Rate

Budget Progress

Savings Goal Progress

Recent Transactions

Net Worth Trend
```

All consolidated metrics default to CNY.

---

# 31. Monthly Financial Report

Each month should generate a financial report containing:

## Summary

```text
Income
Expenses
Net Cash Flow
Savings
Savings Rate
Net Worth
Net Worth Change
```

## Expense Breakdown

```text
Housing
Food
Transport
Entertainment
Shopping
Travel
Education
Other
```

## Account Movement

For each account:

```text
Opening Balance
Deposits
Withdrawals
Closing Balance
```

## Savings Goals

```text
Goal
Target
Current
Monthly Contribution
Progress
```

## Assets

```text
Cash
Savings
Investments
Provident Fund
Property
Other
```

## Liabilities

```text
Credit Card
Loan
Mortgage
Other
```

## Budget Performance

```text
Budget
Actual
Variance
```

---

# 32. Snapshot Strategy

Historical reports should not unexpectedly change because current exchange rates or current asset prices changed.

Recommended snapshots:

```text
Monthly Net Worth Snapshot
Monthly Account Balance Snapshot
Monthly Asset Valuation Snapshot
Monthly Report Snapshot
```

Snapshots preserve historical truth.

---

# 33. Security Architecture

## 33.1 Local Binding

Backend must bind only to:

```text
127.0.0.1
```

Never:

```text
0.0.0.0
```

for normal desktop usage.

---

## 33.2 Debug Mode

Production/local daily usage must use:

```text
debug = false
```

---

## 33.3 Database Location

Database files must not live inside the Git repository.

Windows location (2.1+), resolved with SHGetKnownFolderPath(LocalAppData):

```text
%LOCALAPPDATA%/OpenISave2Data/
├── vault/
│   └── finance.db        SQLCipher-encrypted
├── backups/
│   ├── daily/  weekly/  monthly/  manual/  safety/
├── config/
│   └── storage.json      non-secret metadata
├── logs/
└── migration/
```

2.0.x kept a plaintext database in `%LOCALAPPDATA%/OpenISave2/data/`; 2.1
migrates it once (see docs/SECURITY_AND_DATA_STORAGE.md).

---

## 33.4 Repository Policy

The Git repository must never contain:

```text
real database files
financial exports
backup databases
credentials
API keys
personal reports
```

`.gitignore` must explicitly exclude them.

---

## 33.5 Encryption

Production database (implemented in 2.1):

```text
SQLCipher 4 via the sqlcipher3 DB-API module
AES-256 page encryption + HMAC-SHA512 page authentication
random 256-bit raw key (no passphrase KDF)
```

SQLAlchemy stays the data-access layer: the `sqlite+pysqlite` dialect runs on
`sqlcipher3`, and every pooled connection is opened by a creator that applies
the key first (`app/db/engine.py`). Alembic runs over the same keyed
connections. Until the vault is unlocked, the API answers only health, status
and recovery endpoints (HTTP 423 otherwise).

Encryption secrets must not be stored in source code, config files, `.env`,
the data folder or logs.

---

## 33.6 Secret Storage

Implemented:

```text
Windows Credential Manager — generic credential
target  OpenISave2/DatabaseEncryptionKey
access  keyring's WinVault backend, instantiated directly
```

Development (`OPENISAVE_DEV_LOCAL_DATA=1`) uses a separate target so it can
never replace the production key. A recovery key (the database key in
checksummed Base32) can be exported on explicit request from Settings → Data &
Security; it is never written to the data folder.

Do not place database encryption passwords in committed `.env` files.

---

# 34. Backup Strategy

Backup is mandatory.

Implemented policy (app/security/backups.py):

```text
7 daily backups      taken at the first startup of each day
4 weekly backups     promoted from that day's daily
12 monthly backups   promoted from that day's daily
20 manual backups    Settings → Back Up Now
10 safety backups    before every schema migration and every restore
```

Backups are encrypted SQLCipher files under the vault key, made with
`VACUUM INTO` over a keyed connection and verified before they are kept.
A plaintext backup is never produced.

Backup must occur before database schema migration (enforced by
`bootstrap.upgrade(before_change=...)`).

---

# 35. Restore Strategy

The application must eventually provide:

```text
Settings
→
Backups
→
Restore Backup
```

Restore must verify:

- Backup integrity (`cipher_integrity_check`, `integrity_check`, foreign keys)
- Database schema compatibility (revision known to this version)
- Encryption access (the current key opens it)

before replacing the active database. Implemented flow: verify → safety
backup of the current database → pause the API → close connections and
checkpoint the WAL → copy, re-verify and atomically rename into place →
reopen, migrate if older, resume. A failure after the swap puts the safety
backup back.

---

# 36. API Design

Version all APIs.

```text
/api/v1/
```

Examples:

```text
GET    /api/v1/accounts
POST   /api/v1/accounts
PATCH  /api/v1/accounts/{id}

GET    /api/v1/transactions
POST   /api/v1/transactions
POST   /api/v1/transfers

GET    /api/v1/goals
POST   /api/v1/goals

GET    /api/v1/budgets/{year}/{month}

GET    /api/v1/reports/monthly/{year}/{month}

POST   /api/v1/fx/refresh
```

---

# 37. Validation Rules

All API input must be validated using Pydantic.

Examples:

```text
amount > 0
currency exists
account exists
date is valid
account is active
transfer source != destination
goal allocation <= available funds
```

Invalid financial records must not silently enter the database.

---

# 38. Data Integrity

Financial mutations involving more than one table must be atomic.

Example:

```text
Cross-account transfer

Create transaction
Create source posting
Create destination posting
Store FX rate
Store fee
```

Either all steps succeed, or none succeed.

Use database transactions.

---

# 39. Deletion Policy

Financial history should not be casually destroyed.

Recommended behavior:

```text
User deletes transaction
→ soft delete / void transaction
```

rather than permanent deletion.

The system should preserve:

```text
created_at
updated_at
voided_at
```

for auditability.

---

# 40. Auditability

Every financial object should have:

```text
created_at
updated_at
```

Important financial changes should be traceable.

The application does not need enterprise audit infrastructure, but it must avoid silently rewriting historical financial data.

---

# 41. Frontend Data Fetching

Use a dedicated API layer.

Components must not scatter raw `fetch()` calls everywhere.

Recommended:

```text
src/api/
```

with:

```text
accounts.ts
transactions.ts
goals.ts
reports.ts
```

TanStack Query or equivalent may manage:

```text
loading
caching
refetching
mutation status
```

---

# 42. Frontend State Management

Do not introduce heavy global state management unless required.

Preferred hierarchy:

```text
Server state
→ TanStack Query

Local UI state
→ React useState/useReducer

Form state
→ form library / local hook

Global app preferences
→ lightweight context/store
```

Avoid unnecessary Redux-style architecture initially.

---

# 43. Component Design Standard

Pages should compose smaller components.

Example:

```text
AccountsPage
├── AccountSummary
├── AccountList
├── AccountCard
├── CreateAccountDialog
└── AccountFilters
```

Business calculations should not be implemented directly in JSX.

---

# 44. Styling Policy

Use one coherent styling system.

Avoid:

```text
random inline styles
large page-specific CSS blobs
duplicated colors
duplicated spacing constants
```

Use shared tokens for:

```text
spacing
typography
border radius
semantic colors
```

---

# 45. Testing Strategy

## Backend

Must test:

```text
money arithmetic
FX conversion
transfers
account balances
goal allocation
budget calculations
net worth
monthly reports
```

Particularly important:

```text
cross-currency transfer
stale FX
missing FX
negative liability balances
historical snapshot integrity
```

---

## Frontend

Test important interactions:

```text
create account
add transaction
transfer money
create savings goal
set budget
render monthly report
```

---

# 46. Financial Calculation Tests

Financial domain functions should use deterministic unit tests.

Example:

```text
Given:
GBP account = £1,000
GBP/CNY = 9.50

Expected:
CNY reporting value = ¥9,500
```

All such calculations must have explicit test coverage.

---

# 47. Logging

Logs must not expose unnecessary personal finance details.

Avoid:

```text
INFO: User salary = 30000
INFO: HSBC balance = 12500
```

Prefer:

```text
INFO: transaction_created id=123
INFO: fx_refresh_completed
INFO: backup_created
```

Sensitive values should not appear in normal logs.

---

# 48. Error Handling

Errors shown to users should be understandable.

Example:

Bad:

```text
sqlite3.IntegrityError
```

Good:

```text
This transfer could not be saved.
The destination account is no longer active.
```

Technical details may be recorded separately in local logs.

---

# 49. Offline Behavior

Without Internet access:

The application must still support:

```text
viewing accounts
adding transactions
viewing historical reports
editing goals
editing budgets
viewing cached net worth
```

Only fresh FX retrieval should be unavailable.

---

# 50. FX Freshness Indicator

Dashboard should communicate exchange-rate freshness.

Example:

```text
GBP/CNY
9.72

Updated:
22 Sep 2026

Status:
Fresh
```

or:

```text
Status:
Stale — using cached rate
```

---

# 51. Initial Product Navigation

Recommended navigation:

```text
Overview

Transactions

Accounts

Assets

Goals

Budget

Categories

Reports

Settings
```

Investments may initially live under Assets. The Assets area covers physical
assets and liabilities as separate tabs.

---

# 52. MVP Scope

The first usable version should include:

### Accounts
- Multiple bank accounts
- Multiple currencies
- Opening balances
- Purpose tags

### Transactions
- Income
- Expenses
- Transfers
- Categories

### FX
- Latest exchange rate
- Historical transaction rate
- Cached rates

### Dashboard
- Total assets
- Total liabilities
- Net worth
- Monthly income
- Monthly expenses

### Goals
- Savings goals
- Linked accounts
- Progress

### Budget
- Monthly category budgets

### Reports
- Monthly income and expenses
- Account balances
- Net worth

### Security
- Local database
- Localhost only
- Backups

---

# 53. Post-MVP Scope

Possible later additions:

```text
CSV bank imports
OFX/QIF imports
Automatic investment prices
Recurring transaction confirmation
Advanced budget suggestions
Scenario planning
Retirement planning
Tax-related summaries
Custom report exports
Desktop packaging
```

These features must not distort the core ledger architecture.

---

# 54. Explicit Non-Goals for Initial Versions

Do not prioritize:

```text
Open Banking integration
Automatic Chinese bank integration
Alipay API integration
WeChat Pay API integration
Multi-user accounts
Cloud sync
Mobile native app
Microservices
Redis
Kafka
Complex event sourcing
```

They can be reconsidered later.

---

# 55. Simplicity Rules

Prefer:

```text
one backend
one frontend
one local database
one API
```

Avoid infrastructure unless there is a demonstrated need.

---

# 56. Database Migration Policy

All schema changes must use Alembic migrations.

Never ask users to manually edit database tables.

Before a migration:

```text
Create backup
↓
Run migration
↓
Verify schema
```

---

# 57. Naming Standards

Backend:

```text
snake_case
```

Frontend:

```text
camelCase for variables/functions
PascalCase for React components
```

API JSON should consistently use one naming style, preferably:

```text
snake_case
```

or explicitly configure consistent conversion.

Do not mix naming conventions arbitrarily.

---

# 58. Time and Date Rules

Financial transaction dates are business dates, not merely timestamps.

Store transaction date separately:

```text
transaction_date
```

Also keep metadata timestamps:

```text
created_at
updated_at
```

Use ISO formats.

---

# 59. Currency Metadata

Currencies should have metadata:

```text
code
symbol
minor_unit_digits
display_name
```

Example:

```text
CNY
¥
2
Chinese Yuan
```

This prevents hardcoding currency behavior throughout the frontend.

---

# 60. Net Worth Calculation

Net worth should be calculated from active accounts and valuations.

Conceptually:

```text
Net Worth =
Σ converted asset values
-
Σ converted liability values
```

The service performing this calculation must be centralized.

Do not reimplement net worth formulas in multiple pages.

---

# 61. Financial Snapshot Policy

At month-end, the system should be capable of storing a stable snapshot containing:

```text
account balances
FX rates
asset valuations
liabilities
net worth
goal status
budget actuals
```

This supports trustworthy historical comparisons.

---

# 62. Report Export

Initial reports may be rendered directly in the frontend.

Later support may include:

```text
PDF
CSV
JSON
```

Report generation logic should remain separate from ledger logic.

---

# 63. Code Quality Gates

Before merging significant changes:

```text
Frontend lint passes
Frontend type check passes
Backend lint passes
Backend tests pass
Database migration checked
Financial calculation tests pass
```

---

# 64. Frontend 350-Line Enforcement

The 350-line rule should eventually be enforced automatically.

Recommended CI/development script:

```text
check-frontend-file-size
```

It should scan:

```text
src/**/*.ts
src/**/*.tsx
src/**/*.js
src/**/*.jsx
src/**/*.css
src/**/*.scss
```

and fail if a handwritten frontend source file exceeds 350 lines.

Exceptions must be explicitly documented.

---

# 65. Definition of Done for a Feature

A feature is not complete until:

- Domain model is defined
- API contract is defined
- Validation exists
- Backend service exists
- Database changes have migration
- Frontend UI exists
- Error states are handled
- Loading states are handled
- Relevant tests exist
- Frontend files obey the 350-line limit
- Financial calculations use correct money types
- Sensitive values are not unnecessarily logged

---

# 66. Architectural Decision Priorities

When two implementation approaches are possible, prefer the one that improves:

1. Financial correctness
2. Data integrity
3. Privacy
4. Maintainability
5. Simplicity
6. Testability
7. UI convenience

Do not sacrifice financial correctness for shorter implementation time.

---

# 67. Core Architectural Invariants

These rules must remain true throughout the project:

### Invariant 1
CNY is the default consolidated reporting currency.

### Invariant 2
Native account currency is never discarded.

### Invariant 3
Transfers do not count as income or expense.

### Invariant 4
Historical reports do not change because current FX changes.

### Invariant 5
Money is not stored using binary floating-point values.

### Invariant 6
Bank accounts are independent first-class domain entities.

### Invariant 7
Savings goals do not duplicate real money. An account may belong to any number
of goals without changing a single balance.

### Invariant 8
Net worth is calculated centrally.

### Invariant 9
Sensitive financial data remains local by default.

### Invariant 10
Backend is exposed only through localhost during normal local operation.

### Invariant 11
Old OpenISave data is not migrated.

### Invariant 12
No handwritten frontend source file may exceed 350 lines.

### Invariant 13
Outstanding debt has exactly one source of truth: the liability account's
balance. Liability metadata never stores a second copy.

### Invariant 14
Buying or selling an asset changes the form of value, not its amount. An asset
purchase paid from an account leaves net worth unchanged, and is never counted
as income or expense.

### Invariant 15
A category that financial records reference is archived, never deleted, so
historical transactions keep rendering with the category they were filed under.

### Invariant 16
The desktop application starts and stops its own backend. It binds to
127.0.0.1 only, and must never leave an orphaned server process behind.

### Invariant 17
Every transaction — hand-entered, recurring or imported — is written by the
LedgerService. No feature implements its own ledger.

### Invariant 18
One recurring rule and scheduled date produce at most one transaction; one
external statement row is imported at most once. Both are database
constraints.

### Invariant 19
Statement parsing and categorisation are deterministic and local. No AI or
network service is involved, and statement contents never reach the logs.

---

# 67A. Desktop Distribution

OpenISave ships as a Windows desktop application so a user never has to open a
terminal.

```text
Tauri 2 desktop shell
├── React frontend (the same build as the browser app)
└── FastAPI backend as a bundled sidecar executable
```

## 67A.1 Process Lifecycle

```text
user launches OpenISave
→ shell picks a free loopback port
→ shell starts the backend sidecar on that port
→ shell waits for the port to accept connections
→ window loads and asks the shell for the backend URL
```

On exit the shell kills the sidecar. On Windows the child is additionally
placed in a job object configured to terminate it when the parent's handle
closes, so even an abnormal exit cannot orphan the server.

## 67A.2 Ports

A fixed port must never be assumed free. The shell asks the OS for an unused
port at launch, so several copies, or an unrelated service on 8756, cannot
break startup.

## 67A.3 Development Mode Is Preserved

The desktop build is additive. Running the backend with uvicorn and the
frontend with Vite must keep working unchanged; in that mode the shell detects
that no sidecar is bundled and uses the Vite proxy.

## 67A.4 Data Location Is Unchanged

The packaged application stores data in exactly the same place as the
development build:

```text
%LOCALAPPDATA%\OpenISave2\
├── data\
├── backups\
└── logs\
```

The database is never packaged inside the executable, and reinstalling or
upgrading the application must never overwrite it.

## 67A.5 Self-Migration

The packaged app has no shell for `alembic upgrade head`, so it applies its own
migrations at startup — taking a backup first, as section 56 requires.

---

# 68. Recommended Implementation Order

## Phase 0 — Foundation

Build:

```text
frontend shell
FastAPI backend
SQLite database
SQLAlchemy
Alembic
settings
currency definitions
```

---

## Phase 1 — Accounts

Build:

```text
bank accounts
cash accounts
savings accounts
credit cards
account purposes
opening balances
account detail page
```

This must be implemented before advanced transaction work.

---

## Phase 2 — Ledger

Build:

```text
income
expense
transfer
categories
postings
balance calculations
```

---

## Phase 3 — FX

Build:

```text
exchange-rate provider
cache
historical FX
CNY conversion
stale rate warnings
```

---

## Phase 4 — Dashboard

Build:

```text
monthly income
monthly expense
cash flow
asset total
liability total
net worth
account summaries
```

---

## Phase 5 — Goals

Build:

```text
savings goals
target amount
target date
linked account
virtual allocations
progress tracking
```

---

## Phase 6 — Budget

Build:

```text
monthly budgets
category budgets
actual vs budget
remaining amounts
```

---

## Phase 7 — Assets & Liabilities

Build:

```text
manual assets
property
provident fund
loans
other liabilities
valuation history
```

---

## Phase 8 — Investments

Build:

```text
investment accounts
holdings
manual valuation
cost basis
```

---

## Phase 9 — Reports

Build:

```text
monthly report
net worth history
cash-flow trend
category analysis
goal progress
budget variance
```

---

## Phase 10 — Security & Distribution

Build:

```text
SQLCipher
OS keychain
backup system
restore system
desktop launcher
release build
```

---

# 69. Final Product Identity

OpenISave 2.0 should be treated as:

> **A local-first, multi-currency personal finance manager with RMB-based consolidated reporting, purpose-based bank account management, savings planning, budgeting, asset tracking, and auditable financial history.**

The project is intentionally designed around:

```text
Local First
Privacy First
Financial Correctness
Multi-Currency
Multiple Accounts
RMB Reporting
Goal-Based Saving
Long-Term Maintainability
```

---

# 70. Final Engineering Rule

When future development conflicts with this document:

1. Do not silently bypass the architecture.
2. Identify the conflicting requirement.
3. Decide whether the requirement or this architecture should change.
4. Update this document if the architectural decision changes.
5. Then implement the code.

This file is the source of truth for the project architecture.
