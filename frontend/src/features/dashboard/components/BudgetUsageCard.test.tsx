import { describe, expect, it } from 'vitest';

import { makeDashboard } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import { BudgetUsageCard } from './BudgetUsageCard';
import { CategorySplitCard } from './CategorySplitCard';

const category = {
  category_id: 1, category_name: 'Food', parent_name: null,
  budget_minor: 400_000, actual_minor: 200_000, remaining_minor: 200_000, used_percent: 50,
};

function overall(overrides = {}) {
  const data = makeDashboard();
  data.budget = {
    ...data.budget,
    overall_limit_minor: 1_500_000, overall_actual_minor: 842_000,
    overall_remaining_minor: 658_000, overall_used_percent: 56.1,
    ...overrides,
  };
  return data;
}

describe('BudgetUsageCard', () => {
  it.each([[84.9, 'normal'], [85, 'near'], [100, 'near'], [100.1, 'over']] as const)(
    'uses the correct presentation band at %s percent', (percent, tone) => {
      const { container } = renderWithProviders(<BudgetUsageCard data={overall({overall_used_percent: percent})} />);
      expect(container.querySelector('[data-budget-status]')).toHaveAttribute('data-budget-status', tone);
      expect(screen.getByText(`${percent.toFixed(1)}% used`)).toBeInTheDocument();
    },
  );

  it('shows overall figures from the backend, independently of category totals', () => {
    const data = overall({ total_budget_minor: 400_000, total_actual_minor: 200_000, lines: [category] });
    renderWithProviders(<BudgetUsageCard data={data} />);
    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
    expect(screen.getByText('¥8,420.00 spent of ¥15,000.00')).toBeInTheDocument();
    expect(screen.getByText('56.1% used')).toBeInTheDocument();
    expect(screen.getByText('¥6,580.00 remaining')).toBeInTheDocument();
    expect(screen.getByText('· 1 active')).toBeInTheDocument();
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });

  it('shows true overspending with a visually capped progress track', () => {
    renderWithProviders(<BudgetUsageCard data={overall({
      overall_actual_minor: 1_686_000, overall_remaining_minor: -186_000, overall_used_percent: 112.4,
    })} />);
    expect(screen.getByText('112.4% used')).toBeInTheDocument();
    expect(screen.getByText('¥1,860.00 over budget')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('supports category-only legacy data without inventing an overall total', () => {
    const data = makeDashboard();
    data.budget = { ...data.budget, total_budget_minor: 400_000, lines: [category] };
    renderWithProviders(<BudgetUsageCard data={data} />);
    expect(screen.getByText('Category budgets')).toBeInTheDocument();
    expect(screen.getByText('· 1 active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set overall budget' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/¥4,000/)).not.toBeInTheDocument();
  });

  it('invites the user to set a monthly budget and navigates to Budget', async () => {
    const { Routes, Route } = await import('react-router-dom');
    const user = setupUser();
    renderWithProviders(<Routes>
      <Route path="/" element={<BudgetUsageCard data={makeDashboard()} />} />
      <Route path="/budget" element={<p>Budget destination</p>} />
    </Routes>);
    expect(screen.getByText('Set your monthly budget')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set budget' }));
    expect(screen.getByText('Budget destination')).toBeInTheDocument();
  });
});

describe('CategorySplitCard', () => {
  it('shows an empty state when there is no income this month', () => {
    renderWithProviders(<CategorySplitCard title="Income by category" rows={[]}
      currency="CNY" emptyText="No income recorded this month" />);
    expect(screen.getByText('Income by category')).toBeInTheDocument();
    expect(screen.getByText('No income recorded this month')).toBeInTheDocument();
  });
});
