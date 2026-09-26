import { describe, expect, it } from 'vitest';

import { makeDashboard } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import type { DashboardBudgetLine } from '@/types/dashboard';
import { BudgetUsageCard } from './BudgetUsageCard';
import { CategorySplitCard } from './CategorySplitCard';

function line(overrides: Partial<DashboardBudgetLine>): DashboardBudgetLine {
  return {
    category_id: 1,
    category_name: 'Food',
    parent_name: null,
    budget_minor: 100_000,
    actual_minor: 68_000,
    remaining_minor: 32_000,
    used_percent: 68,
    ...overrides,
  };
}

describe('BudgetUsageCard', () => {
  it('shows live actual, percentage and remaining for each budget', () => {
    const data = makeDashboard({
      budget: {
        total_budget_minor: 100_000,
        total_actual_minor: 68_000,
        total_remaining_minor: 32_000,
        total_used_percent: 68,
        lines: [line({})],
      },
    });
    renderWithProviders(<BudgetUsageCard data={data} />);
    const row = screen.getByTestId('budget-line');
    expect(row).toHaveTextContent('Food');
    expect(row).toHaveTextContent('68.0%');
    expect(row).toHaveTextContent('¥680.00 / ¥1,000.00');
    expect(row).toHaveTextContent('Remaining: ¥320.00');
  });

  it('flags overspending and collapses long budget lists', async () => {
    const lines = Array.from({ length: 8 }, (_, index) =>
      line({ category_id: index + 1, category_name: `Cat ${index + 1}` }),
    );
    lines[0] = line({
      category_id: 1,
      category_name: 'Coffee',
      actual_minor: 15_000,
      budget_minor: 10_000,
      remaining_minor: -5_000,
      used_percent: 150,
    });
    const data = makeDashboard({
      budget: {
        total_budget_minor: 710_000,
        total_actual_minor: 491_000,
        total_remaining_minor: 219_000,
        total_used_percent: 69.2,
        lines,
      },
    });
    const user = setupUser();
    renderWithProviders(<BudgetUsageCard data={data} />);

    expect(screen.getByText('Over by ¥50.00')).toBeInTheDocument();
    expect(screen.getAllByTestId('budget-line')).toHaveLength(6);
    await user.click(screen.getByText('Show all 8 (2 more)'));
    expect(screen.getAllByTestId('budget-line')).toHaveLength(8);
  });

  it('invites the user to create a budget when none is set', () => {
    renderWithProviders(<BudgetUsageCard data={makeDashboard()} />);
    expect(screen.getByText('No budget set for this month')).toBeInTheDocument();
  });
});

describe('CategorySplitCard', () => {
  it('shows an empty state when there is no income this month', () => {
    renderWithProviders(
      <CategorySplitCard
        title="Income by category"
        rows={[]}
        currency="CNY"
        emptyText="No income recorded this month"
      />,
    );
    expect(screen.getByText('Income by category')).toBeInTheDocument();
    expect(screen.getByText('No income recorded this month')).toBeInTheDocument();
  });
});
