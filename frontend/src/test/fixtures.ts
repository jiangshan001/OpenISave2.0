import type { AccountBalance, Category, Goal } from '@/types';
import type { Asset, Liability } from '@/types/asset';

export function makeAccount(overrides: Partial<AccountBalance> = {}): AccountBalance {
  return {
    id: 1,
    name: '招商银行',
    institution: 'China Merchants Bank',
    account_type: 'savings',
    currency: 'CNY',
    purpose: 'long_term_savings',
    opening_balance_minor: 10_000_000,
    include_in_net_worth: true,
    is_active: true,
    is_archived: false,
    note: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    balance_minor: 10_000_000,
    base_balance_minor: 10_000_000,
    base_currency: 'CNY',
    fx_rate: '1',
    fx_freshness: 'identity',
    group: 'savings',
    is_liability: false,
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    name: '三年存够50万',
    currency: 'CNY',
    target_amount_minor: 50_000_000,
    deadline: '2029-09-22',
    selection_mode: 'selected',
    note: null,
    is_active: true,
    current_amount_minor: 18_650_000,
    progress_percent: 37.3,
    remaining_minor: 31_350_000,
    fx_freshness: 'fresh',
    account_count: 2,
    account_ids: [1, 2],
    contributions: [
      {
        account_id: 1,
        account_name: '招商银行',
        currency: 'CNY',
        balance_minor: 8_000_000,
        converted_minor: 8_000_000,
        fx_freshness: 'identity',
        is_eligible: true,
        shared_with_goals: 1,
      },
      {
        account_id: 2,
        account_name: 'HSBC Savings',
        currency: 'GBP',
        balance_minor: 620_000,
        converted_minor: 10_650_000,
        fx_freshness: 'fresh',
        is_eligible: true,
        shared_with_goals: 2,
      },
    ],
    unconverted_accounts: [],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 1,
    name: 'MacBook Pro',
    asset_category_id: 1,
    category_name: 'Electronics',
    description: null,
    purchase_date: '2026-01-01',
    purchase_price_minor: 1_800_000,
    purchase_currency: 'CNY',
    purchase_base_minor: 1_800_000,
    status: 'holding',
    sale_date: null,
    sale_price_minor: null,
    sale_currency: null,
    sale_base_minor: null,
    include_in_net_worth: true,
    linked_liability_id: null,
    liability_name: null,
    note: null,
    current_value: {
      value_minor: 1_800_000,
      currency: 'CNY',
      base_minor: 1_800_000,
      valuation_date: '2026-01-01',
      source: 'purchase_price',
      fx_freshness: 'identity',
    },
    days_held: 264,
    holding_cost_per_day_minor: 6818,
    net_cost_minor: null,
    effective_cost_per_day_minor: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeLiability(overrides: Partial<Liability> = {}): Liability {
  return {
    id: 1,
    name: 'Apple Financing',
    liability_type: 'financing',
    account_id: 9,
    account_name: 'Apple Financing',
    currency: 'CNY',
    original_amount_minor: 1_200_000,
    outstanding_minor: 1_000_000,
    base_outstanding_minor: 1_000_000,
    repaid_minor: 200_000,
    repaid_percent: 16.7,
    fx_freshness: 'identity',
    start_date: '2026-01-01',
    end_date: null,
    interest_rate_percent: null,
    lender: 'Apple',
    note: null,
    linked_asset_names: ['MacBook Pro'],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Food',
    kind: 'expense',
    parent_id: null,
    sort_order: 0,
    is_active: true,
    depth: 0,
    transaction_count: 0,
    subtree_transaction_count: 0,
    ...overrides,
  };
}
