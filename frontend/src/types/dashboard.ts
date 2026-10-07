import type { AccountGroup, AccountType, CurrencyCode, FxRateStatus, TransactionType,
  OverallBudgetUsage } from '.';

export interface CategoryBreakdown {
  category_id: number | null;
  category_name: string;
  parent_name: string | null;
  amount_minor: number;
}

export interface CashFlowPoint {
  month: string;
  income_minor: number;
  expense_minor: number;
  net_minor: number;
}

export interface DashboardAccount {
  id: number;
  name: string;
  institution: string | null;
  account_type: AccountType;
  purpose: string | null;
  currency: CurrencyCode;
  balance_minor: number;
  base_balance_minor: number | null;
  group: AccountGroup;
  fx_freshness: string;
  include_in_net_worth: boolean;
}

export interface DashboardBudgetLine {
  category_id: number;
  category_name: string;
  parent_name: string | null;
  budget_minor: number;
  actual_minor: number;
  remaining_minor: number;
  used_percent: number | null;
}

export interface DashboardGoal {
  id: number;
  name: string;
  currency: CurrencyCode;
  target_amount_minor: number | null;
  current_amount_minor: number | null;
  progress_percent: number | null;
  selection_mode: string;
  account_count: number;
}

export interface DashboardTransaction {
  id: number;
  type: TransactionType;
  transaction_date: string;
  description: string;
  amount_minor: number;
  currency: CurrencyCode;
  base_amount_minor: number;
  category_id: number | null;
}

export interface Dashboard {
  base_currency: CurrencyCode;
  period: { year: number; month: number };
  net_worth_minor: number;
  /** Net worth assets only: accounts plus physical assets that count. */
  total_assets_minor: number;
  net_worth_assets_minor: number;
  total_liabilities_minor: number;
  groups: Record<AccountGroup, number>;
  /** Physical assets included in net worth. */
  physical_assets_minor: number;
  /** Held personal possessions: a reference value, never part of net worth. */
  personal_possessions_minor: number;
  unconverted_accounts: string[];
  month_income_minor: number;
  month_expense_minor: number;
  net_cash_flow_minor: number;
  savings_rate_percent: number | null;
  accounts: DashboardAccount[];
  expense_by_category: CategoryBreakdown[];
  income_by_category: CategoryBreakdown[];
  cash_flow_series: CashFlowPoint[];
  /** Every active monthly budget line with its live ledger actual. */
  budget: OverallBudgetUsage & {
    total_budget_minor: number;
    total_actual_minor: number;
    total_remaining_minor: number;
    total_used_percent: number | null;
    lines: DashboardBudgetLine[];
  };
  goals: DashboardGoal[];
  recent_transactions: DashboardTransaction[];
  fx_status: FxRateStatus[];
}

export type ActivityKind = 'expense' | 'income';

/** One day with income or expense activity; days without any are omitted. */
export interface ActivityDay {
  date: string;
  amount_minor: number;
  count: number;
  /** Colour intensity 0-4: the backend's percentile-rank quartile of this day. */
  level: number;
}

export interface ActivitySeries {
  total_minor: number;
  max_minor: number;
  active_days: number;
  days: ActivityDay[];
}

/** Daily cash-flow activity for the Overview heatmap (GET /dashboard/activity). */
export interface DailyActivity {
  base_currency: CurrencyCode;
  start: string;
  end: string;
  months: number;
  series: Record<ActivityKind, ActivitySeries>;
}

export interface AccountMovement {
  account_id: number;
  account_name: string;
  currency: CurrencyCode;
  opening_balance_minor: number;
  deposits_minor: number;
  withdrawals_minor: number;
  closing_balance_minor: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  base_currency: CurrencyCode;
  period_start: string;
  period_end: string;
  summary: {
    income_minor: number;
    expense_minor: number;
    net_cash_flow_minor: number;
    savings_rate_percent: number | null;
    net_worth_minor: number;
    total_assets_minor: number;
    total_liabilities_minor: number;
    personal_possessions_minor: number;
  };
  expense_by_category: CategoryBreakdown[];
  income_by_category: CategoryBreakdown[];
  account_movement: AccountMovement[];
  budget: {
    total_budget_minor: number;
    total_actual_minor: number;
    total_remaining_minor: number;
    lines: DashboardBudgetLine[];
  };
  goals: DashboardGoal[];
  cash_flow_series: CashFlowPoint[];
}
