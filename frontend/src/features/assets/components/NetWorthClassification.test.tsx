import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accountsApi } from '@/api/accounts';
import { assetsApi, liabilitiesApi } from '@/api/assets';
import { makeAsset } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import type { AssetCategory } from '@/types/asset';
import { AssetFormModal } from './AssetFormModal';
import { AssetTable } from './AssetTable';
import { NetWorthBadge } from './NetWorthBadge';

const CATEGORIES: AssetCategory[] = [
  { id: 1, name: 'Electronics', sort_order: 0, is_active: true, include_in_net_worth_default: false },
  { id: 5, name: 'Property', sort_order: 4, is_active: true, include_in_net_worth_default: true },
];

describe('NetWorthBadge', () => {
  it('labels a personal possession as excluded', () => {
    renderWithProviders(<NetWorthBadge asset={makeAsset()} />);
    expect(screen.getByText('Personal Possession — excluded from Net Worth')).toBeInTheDocument();
  });

  it('labels a store of wealth as included', () => {
    renderWithProviders(
      <NetWorthBadge asset={makeAsset({ include_in_net_worth: true })} />,
    );
    expect(screen.getByText('Included in Net Worth')).toBeInTheDocument();
  });
});

describe('AssetTable classification', () => {
  it('keeps every holding-cost figure for an excluded possession', () => {
    renderWithProviders(<AssetTable rows={[makeAsset()]} />);
    expect(screen.getByText('Personal Possession — excluded from Net Worth')).toBeInTheDocument();
    expect(screen.getByText('¥68.18')).toBeInTheDocument();
    expect(screen.getByText('264')).toBeInTheDocument();
  });
});

describe('AssetFormModal net worth toggle', () => {
  beforeEach(() => {
    vi.spyOn(accountsApi, 'list').mockResolvedValue([]);
    vi.spyOn(liabilitiesApi, 'list').mockResolvedValue([]);
    vi.spyOn(assetsApi, 'categories').mockResolvedValue(CATEGORIES);
  });

  async function fillAndPick(category: string) {
    const user = setupUser();
    renderWithProviders(<AssetFormModal open onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText('e.g. MacBook Pro'), 'Thing');
    await user.type(screen.getAllByRole('spinbutton')[0], '18000');
    await user.click(screen.getAllByRole('combobox')[0]);
    await waitFor(() => expect(screen.getByTitle(category)).toBeInTheDocument());
    await user.click(screen.getByTitle(category));
    return user;
  }

  it('follows the category default and lets the backend decide', async () => {
    const create = vi.spyOn(assetsApi, 'create').mockResolvedValue(makeAsset());
    const user = await fillAndPick('Property');
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Include in net worth' })).toBeChecked());
    expect(screen.getByText(/Property counts by default/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add asset' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].include_in_net_worth).toBeNull();
  });

  it('sends an explicit choice once the user flips the switch', async () => {
    const create = vi.spyOn(assetsApi, 'create').mockResolvedValue(makeAsset());
    const user = await fillAndPick('Electronics');
    expect(screen.getByRole('switch', { name: 'Include in net worth' })).not.toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'Include in net worth' }));
    expect(screen.getByText(/Set manually/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add asset' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].include_in_net_worth).toBe(true);
  });
});
