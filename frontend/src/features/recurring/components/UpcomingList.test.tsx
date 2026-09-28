import { describe, expect, it, vi } from 'vitest';

import { recurringApi } from '@/api/recurring';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import type { UpcomingItem } from '@/types/recurring';
import { UpcomingList } from './UpcomingList';

function item(overrides: Partial<UpcomingItem>): UpcomingItem {
  return {
    rule_id: 1,
    name: 'Rent',
    transaction_type: 'expense',
    amount_minor: 210_000,
    currency: 'GBP',
    account_id: 1,
    destination_account_id: null,
    category_id: null,
    occurrence_date: '2026-09-11',
    days_until: -2,
    is_due: true,
    mode: 'review',
    ...overrides,
  };
}

describe('UpcomingList', () => {
  it('offers Create and Skip only for items that are due', () => {
    renderWithProviders(
      <UpcomingList
        items={[
          item({}),
          item({ rule_id: 2, name: 'Broadband', days_until: 4, is_due: false, occurrence_date: '2026-09-30' }),
        ]}
      />,
    );
    expect(screen.getByText('Overdue by 2 days')).toBeInTheDocument();
    expect(screen.getByText('Due in 4 days')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Skip' })).toHaveLength(1);
    expect(screen.getAllByText('-£2,100.00')).toHaveLength(2);
  });

  it('creates the occurrence through the API', async () => {
    const generate = vi.spyOn(recurringApi, 'generate').mockResolvedValue({
      rule_id: 1,
      occurrence_date: '2026-09-11',
      status: 'generated',
      transaction_id: 99,
    });
    const user = setupUser();
    renderWithProviders(<UpcomingList items={[item({})]} />);
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(generate).toHaveBeenCalledWith(1, '2026-09-11'));
  });

  it('hides actions when asked (Overview compact mode)', () => {
    renderWithProviders(<UpcomingList items={[item({ is_due: false, days_until: 3 })]} actions={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
