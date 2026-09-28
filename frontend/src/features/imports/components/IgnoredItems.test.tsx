import { describe, expect, it, vi } from 'vitest';

import { importsApi } from '@/api/imports';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import type { IgnoredItem } from '@/types/imports';
import { IgnoredItems } from './IgnoredItems';

const item: IgnoredItem = {
  id: 5,
  source: 'wechat',
  external_id: '4200000000000000000000000000002',
  import_batch_id: 1,
  occurred_at: '2026-09-12T01:30:00+08:00',
  source_date: '2026-09-12',
  amount_minor: 90_000,
  currency: 'CNY',
  raw_type: '转账',
  raw_direction: '支出',
  raw_merchant: 'Tutor',
  raw_product: '8月课时费',
  created_at: '2026-09-27T10:00:00Z',
};

describe('IgnoredItems', () => {
  it('lists permanently ignored rows and restores one', async () => {
    vi.spyOn(importsApi, 'ignored').mockResolvedValue([item]);
    const restore = vi.spyOn(importsApi, 'restoreIgnored').mockResolvedValue(undefined);
    const user = setupUser();
    renderWithProviders(<IgnoredItems />);

    expect(await screen.findByText('Tutor')).toBeInTheDocument();
    expect(screen.getByText('12 Sep 2026')).toBeInTheDocument(); // the statement's own date
    expect(screen.getByText('4200000000000000000000000000002')).toBeInTheDocument();
    expect(screen.getByText('¥900.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    // The confirmation popover adds its own "Restore" button; it is the last one.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(2));
    const buttons = screen.getAllByRole('button', { name: 'Restore' });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(restore).toHaveBeenCalledWith(5));
  });

  it('renders nothing when no row is ignored', async () => {
    const list = vi.spyOn(importsApi, 'ignored').mockResolvedValue([]);
    renderWithProviders(<IgnoredItems />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Ignored items')).not.toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
