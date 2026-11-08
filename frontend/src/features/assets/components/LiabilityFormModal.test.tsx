import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accountsApi } from '@/api/accounts';
import { liabilitiesApi } from '@/api/assets';
import { makeAccount, makeLiability } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { LiabilityFormModal } from './LiabilityFormModal';

describe('new liability deposit', () => {
  beforeEach(() => {
    vi.spyOn(accountsApi, 'list').mockResolvedValue([
      makeAccount({ id: 1, name: 'Bank CNY', currency: 'CNY' }),
      makeAccount({ id: 2, name: 'Bank GBP', currency: 'GBP' }),
      makeAccount({ id: 3, name: 'Card', account_type: 'credit_card', is_liability: true }),
    ]);
  });

  async function chooseDestination() {
    const user = setupUser();
    renderWithProviders(<LiabilityFormModal open onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText('e.g. Apple Financing'), 'Loan');
    await user.type(screen.getAllByRole('spinbutton')[0], '30000');
    const selects = screen.getAllByRole('combobox');
    await user.click(selects[selects.length - 1]);
    await waitFor(() => expect(screen.getByTitle('Bank CNY')).toBeInTheDocument());
    expect(screen.queryByTitle('Bank GBP')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Card')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Bank CNY'));
    return user;
  }

  it('submits the selected receiving account and full loan amount', async () => {
    const create = vi.spyOn(liabilitiesApi, 'create').mockResolvedValue(makeLiability());
    const user = await chooseDestination();
    await user.click(screen.getByRole('button', { name: 'Add liability' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      original_amount_minor: 3000000,
      outstanding_amount_minor: 3000000,
      receipt_account_id: 1,
    });
  });

  it('prevents a new deposit with a different opening debt', async () => {
    const create = vi.spyOn(liabilitiesApi, 'create');
    const user = await chooseDestination();
    await user.type(screen.getAllByRole('spinbutton')[1], '20000');
    await user.click(screen.getByRole('button', { name: 'Add liability' }));
    expect(await screen.findByText(/For a new deposit, enter the original amount/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
