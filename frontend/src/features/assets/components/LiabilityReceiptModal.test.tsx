import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountsApi } from '@/api/accounts';
import { liabilitiesApi } from '@/api/assets';
import { makeAccount, makeLiability } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { LiabilityReceiptModal } from './LiabilityReceiptModal';

describe('historical loan deposit', () => {
  beforeEach(() => {
    vi.spyOn(accountsApi, 'list').mockResolvedValue([
      makeAccount({ id: 1, name: 'Cash account' }),
      makeAccount({ id: 2, name: 'Pounds', currency: 'GBP' }),
    ]);
  });

  it('requires a duplicate-check confirmation and submits the chosen account', async () => {
    const record = vi.spyOn(liabilitiesApi, 'recordReceipt').mockResolvedValue({} as never);
    const user = setupUser();
    renderWithProviders(<LiabilityReceiptModal liability={makeLiability({ receipt_status: 'available' })} onClose={() => {}} />);
    await user.click(screen.getAllByRole('combobox')[0]);
    await waitFor(() => expect(screen.getByTitle('Cash account')).toBeInTheDocument());
    expect(screen.queryByTitle('Pounds')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Cash account'));
    await user.click(screen.getByRole('button', { name: 'Record deposit' }));
    expect(await screen.findByText('Confirm before recording.')).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Record deposit' }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][1]).toMatchObject({ account_id: 1, amount_minor: 1200000,
      transaction_date: '2026-01-01', confirm_missing: true });
  });
});
