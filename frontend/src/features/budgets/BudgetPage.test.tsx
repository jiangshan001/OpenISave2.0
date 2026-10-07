import { beforeEach, describe, expect, it, vi } from 'vitest';

import { budgetsApi, categoriesApi } from '@/api/resources';
import { makeCategory } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { BudgetPeriod } from '@/types';
import { currentPeriod } from '@/utils/dates';
import { BudgetPage } from './BudgetPage';
import { budgetInputMinor, budgetInputValue } from './budgetMoney';

const line = { category_id: 1, category_name: 'Food', parent_name: null,
  budget_minor: 400_000, actual_minor: 200_000, remaining_minor: 200_000, used_percent: 50 };
let period: BudgetPeriod;

beforeEach(() => {
  period = { ...currentPeriod(), currency: 'CNY', total_budget_minor: 0, total_actual_minor: 0,
    total_remaining_minor: 0, overall_limit_minor: null, overall_actual_minor: 842_000,
    overall_remaining_minor: null, overall_used_percent: null, lines: [] };
  vi.spyOn(budgetsApi, 'get').mockImplementation(async () => ({ ...period }));
  vi.spyOn(categoriesApi, 'list').mockResolvedValue([makeCategory(), makeCategory({ id: 2, name: 'Travel' })]);
  vi.spyOn(budgetsApi, 'saveOverall').mockImplementation(async (_year, _month, limit) => {
    period = { ...period, overall_limit_minor: limit, overall_remaining_minor: limit === null ? null : 658_000,
      overall_used_percent: limit === null ? null : 56.1 };
    return period;
  });
  vi.spyOn(budgetsApi, 'save').mockImplementation(async (_year, _month, entries) => {
    period = { ...period, lines: entries.map((entry) => ({ ...line,
      category_id: entry.category_id, budget_minor: entry.amount_minor })) };
    return period;
  });
});

describe('BudgetPage', () => {
  it('starts with a simple setup and collapsed optional categories', async () => {
    renderWithProviders(<BudgetPage />);
    expect(await screen.findByText('Set a monthly budget')).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly budget (CNY)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set budget' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show category budgets' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sets an exact minor-unit amount then displays backend progress and remaining', async () => {
    const user = setupUser();
    renderWithProviders(<BudgetPage />);
    await user.type(await screen.findByLabelText('Monthly budget (CNY)'), '15000.01');
    await user.click(screen.getByRole('button', { name: 'Set budget' }));
    await waitFor(() => expect(budgetsApi.saveOverall).toHaveBeenCalledWith(period.year, period.month, 1_500_001));
    expect(await screen.findByText('Monthly Budget')).toBeInTheDocument();
    expect(screen.getByText('56.1% used')).toBeInTheDocument();
    expect(screen.getByText('¥6,580.00 remaining')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '56');
  });

  it('edits and clears only the monthly limit, retaining existing category budgets', async () => {
    period = { ...period, overall_limit_minor: 1_500_000, overall_remaining_minor: 658_000,
      overall_used_percent: 56.1, lines: [line] };
    const user = setupUser();
    renderWithProviders(<BudgetPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit budget' }));
    const input = screen.getByLabelText('Monthly budget (CNY)');
    expect(input).toHaveValue('15000.00');
    await user.clear(input);
    await user.type(input, '16000');
    await user.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(budgetsApi.saveOverall).toHaveBeenCalledWith(period.year, period.month, 1_600_000));
    await user.click(await screen.findByRole('button', { name: 'Edit budget' }));
    await user.click(screen.getByRole('button', { name: 'Clear monthly budget' }));
    expect(await screen.findByText('Set a monthly budget')).toBeInTheDocument();
    expect(screen.getByText('1 category budget')).toBeInTheDocument();
    expect(budgetsApi.saveOverall).toHaveBeenLastCalledWith(period.year, period.month, null);
    expect(budgetsApi.save).not.toHaveBeenCalled();
  });

  it('shows over-budget copy and the true percentage without negative remaining copy', async () => {
    period = { ...period, overall_limit_minor: 1_500_000, overall_actual_minor: 1_686_000,
      overall_remaining_minor: -186_000, overall_used_percent: 112.4 };
    renderWithProviders(<BudgetPage />);
    expect(await screen.findByText('¥1,860.00 over budget')).toBeInTheDocument();
    expect(screen.getByText('112.4% used')).toBeInTheDocument();
    expect(screen.queryByText(/-¥/)).not.toBeInTheDocument();
  });

  it('keeps legacy categories discoverable and editable while overall is unset', async () => {
    period = { ...period, lines: [line], total_budget_minor: 400_000 };
    const user = setupUser();
    renderWithProviders(<BudgetPage />);
    await user.click(await screen.findByRole('button', { name: 'Manage categories' }));
    expect(screen.getByRole('table')).toHaveTextContent('Food');
    await user.click(screen.getByRole('button', { name: 'Edit category budgets' }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Category limit 1');
    await user.clear(input);
    await user.type(input, '4500');
    expect(input).toHaveValue('4500');
    await user.click(within(dialog).getByRole('button', { name: 'Save category budgets' }));
    await waitFor(() => expect(budgetsApi.save).toHaveBeenCalledWith(period.year, period.month,
      [{ category_id: 1, amount_minor: 450_000 }]));
    expect(budgetsApi.saveOverall).not.toHaveBeenCalled();
  });

  it('adds and removes category budgets through the existing editor', async () => {
    const user = setupUser();
    renderWithProviders(<BudgetPage />);
    await user.click(await screen.findByRole('button', { name: 'Show category budgets' }));
    await user.click(screen.getByRole('button', { name: 'Add category budget' }));
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    await user.type(screen.getByLabelText('Category limit 1'), '4000');
    await user.click(screen.getByRole('button', { name: 'Save category budgets' }));
    await waitFor(() => expect(budgetsApi.save).toHaveBeenCalledWith(period.year, period.month,
      [{ category_id: 1, amount_minor: 400_000 }]));
    await user.click(await screen.findByRole('button', { name: 'Edit category budgets' }));
    await user.click(screen.getByRole('button', { name: 'Remove category budget 1' }));
    await user.click(screen.getByRole('button', { name: 'Save category budgets' }));
    await waitFor(() => expect(budgetsApi.save).toHaveBeenLastCalledWith(period.year, period.month, []));
  });

  it.each(['light', 'dark'] as const)('renders the page in %s with the shared theme provider', async (mode) => {
    localStorage.setItem('openisave.appearance', mode);
    period = { ...period, overall_limit_minor: 1_500_000, overall_remaining_minor: 658_000,
      overall_used_percent: 56.1, lines: [line] };
    renderWithProviders(<ThemeProvider><BudgetPage /></ThemeProvider>);
    expect(await screen.findByText('Monthly Budget')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', mode);
    expect(screen.getByRole('button', { name: 'Manage categories' })).toHaveAttribute('aria-expanded', 'false');
    localStorage.removeItem('openisave.appearance');
  });
});

describe('Exact budget input', () => {
  it.each([['15000.01', 'CNY', 1_500_001], ['0.01', 'CNY', 1], ['100', 'JPY', 100],
    ['0', 'CNY', null], ['-1', 'CNY', null], ['', 'CNY', null], ['2.675', 'CNY', null],
    ['90071992547409.92', 'CNY', null]] as const)('converts %s %s safely', (value, currency, minor) => {
    expect(budgetInputMinor(value, currency)).toBe(minor);
  });
  it('prefills editing without floating point division', () => {
    expect(budgetInputValue(1_500_001, 'CNY')).toBe('15000.01');
    expect(budgetInputValue(1, 'CNY')).toBe('0.01');
  });
});
