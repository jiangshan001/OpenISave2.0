import { describe, expect, it, vi, beforeEach } from 'vitest';

import { assetsApi } from '@/api/assets';
import { accountsApi } from '@/api/accounts';
import { makeAccount, makeAsset } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { AssetSellModal } from './AssetSellModal';

describe('AssetSellModal', () => {
  beforeEach(() => {
    vi.spyOn(accountsApi, 'list').mockResolvedValue([
      makeAccount({ id: 1, name: '招商银行', account_type: 'bank' }),
      makeAccount({ id: 2, name: 'Monzo', currency: 'GBP' }),
      makeAccount({ id: 3, name: 'Card', account_type: 'credit_card', is_liability: true }),
    ]);
  });

  it('explains that history is kept', () => {
    renderWithProviders(
      <AssetSellModal open asset={makeAsset()} onClose={() => {}} />,
    );
    expect(screen.getByText(/keeps its full history/i)).toBeInTheDocument();
  });

  it('sends the sale with the proceeds and destination account', async () => {
    const user = setupUser();
    const sell = vi.spyOn(assetsApi, 'sell').mockResolvedValue(makeAsset({ status: 'sold' }));
    const onClose = vi.fn();

    renderWithProviders(<AssetSellModal open asset={makeAsset()} onClose={onClose} />);

    await user.type(screen.getByRole('spinbutton'), '8000');

    // Only same-currency, non-liability accounts may receive the money.
    const combos = screen.getAllByRole('combobox');
    await user.click(combos[combos.length - 1]);
    await waitFor(() => expect(screen.getByTitle('招商银行 · CNY')).toBeInTheDocument());
    expect(screen.queryByTitle('Monzo · GBP')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Card · CNY')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('招商银行 · CNY'));

    await user.click(screen.getByRole('button', { name: 'Mark as sold' }));

    await waitFor(() => expect(sell).toHaveBeenCalledTimes(1));
    expect(sell.mock.calls[0][0]).toBe(1);
    expect(sell.mock.calls[0][1]).toMatchObject({
      sale_price_minor: 800_000,
      sale_currency: 'CNY',
      destination_account_id: 1,
      status: 'sold',
    });
  });

  it('requires a sale price', async () => {
    const user = setupUser();
    const sell = vi.spyOn(assetsApi, 'sell');
    renderWithProviders(<AssetSellModal open asset={makeAsset()} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Mark as sold' }));

    await waitFor(() =>
      expect(screen.getByText('Enter the sale price')).toBeInTheDocument(),
    );
    expect(sell).not.toHaveBeenCalled();
  });
});
