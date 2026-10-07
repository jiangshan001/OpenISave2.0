import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/utils';
import type { Dashboard } from '@/types/dashboard';
import { NetWorthHero } from './NetWorthHero';

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    base_currency: 'CNY',
    period: { year: 2026, month: 9 },
    net_worth_minor: 3_200_000,
    total_assets_minor: 3_200_000,
    net_worth_assets_minor: 3_200_000,
    total_liabilities_minor: 0,
    groups: {
      cash: 3_200_000,
      savings: 0,
      investments: 0,
      other_assets: 0,
      physical_assets: 0,
      liabilities: 0,
    },
    physical_assets_minor: 0,
    personal_possessions_minor: 1_800_000,
    unconverted_accounts: [],
    month_income_minor: 0,
    month_expense_minor: 0,
    net_cash_flow_minor: 0,
    savings_rate_percent: null,
    accounts: [],
    expense_by_category: [],
    income_by_category: [],
    cash_flow_series: [],
    budget: {
      overall_limit_minor: null,
      overall_actual_minor: 0,
      overall_remaining_minor: null,
      overall_used_percent: null,
      total_budget_minor: 0,
      total_actual_minor: 0,
      total_remaining_minor: 0,
      total_used_percent: null,
      lines: [],
    },
    goals: [],
    recent_transactions: [],
    fx_status: [],
    ...overrides,
  };
}

describe('NetWorthHero - net worth and composition', () => {
  it('shows possessions separately and marks them as reference only', () => {
    renderWithProviders(<NetWorthHero data={dashboard()} />);
    expect(screen.getByText('Net worth assets')).toBeInTheDocument();
    expect(screen.getByText('Personal possessions')).toBeInTheDocument();
    expect(screen.getByText('reference only · not in net worth')).toBeInTheDocument();
    // ¥18,000 of possessions is displayed but net worth stays ¥32,000.
    expect(screen.getByText('¥18,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('¥32,000.00').length).toBeGreaterThanOrEqual(2);
  });
});
