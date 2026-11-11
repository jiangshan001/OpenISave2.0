import { describe, expect, it, vi } from 'vitest';
import { transactionsApi } from '@/api/transactions';
import type { Transaction } from '@/types';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { BudgetAllocationModal } from './BudgetAllocationModal';

describe('budget allocation', () => {
  it('sets three months on an existing expense without modifying its amount', async () => {
    const tx = { id: 9, type: 'expense', description: 'Rent', amount_minor: 900001, currency: 'CNY',
      budget_months: 1, budget_start_month: null } as Transaction;
    const save = vi.spyOn(transactionsApi, 'setBudgetAllocation').mockResolvedValue(tx);
    const user = setupUser();
    renderWithProviders(<BudgetAllocationModal transaction={tx} onClose={() => {}} />);
    const months = screen.getByRole('spinbutton');
    await user.clear(months);
    await user.type(months, '3');
    await user.click(screen.getByRole('button', { name: 'Save allocation' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(9, { months: 3, start_month: null }));
  });
});
