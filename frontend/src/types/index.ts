export type CurrencyCode = 'CNY' | 'GBP' | 'USD' | 'EUR' | 'JPY' | 'CAD' | 'AUD';

export type AccountType =
  | 'bank'
  | 'cash'
  | 'ewallet'
  | 'savings'
  | 'credit_card'
  | 'loan'
  | 'investment'
  | 'provident_fund'
  | 'property'
  | 'other_asset'
  | 'other_liability';

export type TransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'adjustment'
  | 'asset_purchase'
  | 'asset_sale';
export type CategoryKind = 'expense' | 'income';
export type FxFreshness = 'fresh' | 'stale' | 'missing' | 'identity';
export type AccountGroup =
  | 'cash'
  | 'savings'
  | 'investments'
  | 'other_assets'
  | 'physical_assets'
  | 'liabilities';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  minor_unit_digits: number;
  display_name: string;
  is_active: boolean;
}

export interface Account {
  id: number;
  name: string;
  institution: string | null;
  account_type: AccountType;
  currency: CurrencyCode;
  purpose: string | null;
  opening_balance_minor: number;
  include_in_net_worth: boolean;
  is_active: boolean;
  is_archived: boolean;
  note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountBalance extends Account {
  balance_minor: number;
  base_balance_minor: number | null;
  base_currency: CurrencyCode;
  fx_rate: string | null;
  fx_freshness: FxFreshness;
  group: AccountGroup;
  is_liability: boolean;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  transaction_date: string;
  description: string;
  note: string | null;
  category_id: number | null;
  account_id: number | null;
  amount_minor: number;
  currency: CurrencyCode;
  from_account_id: number | null;
  to_account_id: number | null;
  dest_amount_minor: number | null;
  dest_currency: CurrencyCode | null;
  transfer_rate: string | null;
  base_currency: CurrencyCode;
  base_amount_minor: number;
  fx_rate_to_base: string;
  fx_rate_date: string | null;
  fx_source: string;
  parent_transaction_id: number | null;
  recurring_rule_id?: number | null;
  import_batch_id?: number | null;
  external_source?: string | null;
  external_transaction_id?: string | null;
  classification_rule_id?: number | null;
  is_voided: boolean;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  parent_id: number | null;
  sort_order: number;
  is_active: boolean;
  depth: number;
  transaction_count: number;
  subtree_transaction_count: number;
}

export type GoalSelectionMode = 'selected' | 'all_eligible';

export interface GoalContribution {
  account_id: number;
  account_name: string;
  currency: CurrencyCode;
  balance_minor: number;
  converted_minor: number | null;
  fx_freshness: FxFreshness;
  is_eligible: boolean;
  shared_with_goals: number;
}

export interface Goal {
  id: number;
  name: string;
  currency: CurrencyCode;
  target_amount_minor: number | null;
  deadline: string | null;
  selection_mode: GoalSelectionMode;
  note: string | null;
  is_active: boolean;
  current_amount_minor: number | null;
  progress_percent: number | null;
  remaining_minor: number | null;
  fx_freshness: FxFreshness;
  account_count: number;
  account_ids: number[];
  contributions: GoalContribution[];
  unconverted_accounts: string[];
  created_at: string;
}

export interface BudgetLine {
  category_id: number;
  category_name: string;
  parent_name: string | null;
  budget_minor: number;
  actual_minor: number;
  remaining_minor: number;
  used_percent: number | null;
}

export interface BudgetPeriod {
  year: number;
  month: number;
  currency: CurrencyCode;
  total_budget_minor: number;
  total_actual_minor: number;
  total_remaining_minor: number;
  lines: BudgetLine[];
}

export interface FxRateStatus {
  from_currency: CurrencyCode;
  to_currency: CurrencyCode;
  rate: string | null;
  rate_date: string | null;
  source: string | null;
  freshness: FxFreshness;
  age_days: number | null;
}

export interface AppSettings {
  base_currency: CurrencyCode;
  timezone: string;
  locale: string;
  fx_stale_after_days: number;
  supported_currencies: CurrencyCode[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
