import { describe, expect, it, vi } from 'vitest';

import { makeAsset } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import { AssetTable } from './AssetTable';

describe('AssetTable — held assets', () => {
  it('shows holding cost figures from the backend', () => {
    renderWithProviders(<AssetTable rows={[makeAsset()]} />);
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    // Purchase price and current value both read ¥18,000.00 before a valuation.
    expect(screen.getAllByText('¥18,000.00')).toHaveLength(2);
    expect(screen.getByText('264')).toBeInTheDocument();
    expect(screen.getByText('¥68.18')).toBeInTheDocument();
  });

  it('says when the value shown is only the purchase price', () => {
    renderWithProviders(<AssetTable rows={[makeAsset()]} />);
    expect(screen.getByText('using purchase value')).toBeInTheDocument();
  });

  it('does not claim an estimate once a real valuation exists', () => {
    const valued = makeAsset({
      current_value: {
        value_minor: 1_200_000,
        currency: 'CNY',
        base_minor: 1_200_000,
        valuation_date: '2026-09-01',
        source: 'valuation',
        fx_freshness: 'identity',
      },
    });
    renderWithProviders(<AssetTable rows={[valued]} />);
    expect(screen.queryByText('using purchase value')).not.toBeInTheDocument();
    expect(screen.getByText('¥12,000.00')).toBeInTheDocument();
  });

  it('offers sell and value actions', async () => {
    const user = setupUser();
    const onSell = vi.fn();
    const onValue = vi.fn();
    const asset = makeAsset();
    renderWithProviders(<AssetTable rows={[asset]} onSell={onSell} onValue={onValue} />);

    await user.click(screen.getByRole('button', { name: 'Sell' }));
    expect(onSell).toHaveBeenCalledWith(asset);

    await user.click(screen.getByRole('button', { name: 'Value' }));
    expect(onValue).toHaveBeenCalledWith(asset);
  });

  it('shows an empty state', () => {
    renderWithProviders(<AssetTable rows={[]} />);
    expect(screen.getByText('No assets recorded yet')).toBeInTheDocument();
  });
});

describe('AssetTable — sold assets', () => {
  const sold = makeAsset({
    status: 'sold',
    sale_date: '2028-03-11',
    sale_price_minor: 800_000,
    sale_currency: 'CNY',
    current_value: null,
    days_held: 800,
    holding_cost_per_day_minor: null,
    net_cost_minor: 1_000_000,
    effective_cost_per_day_minor: 1250,
  });

  it('shows net ownership cost and effective cost per day', () => {
    renderWithProviders(<AssetTable rows={[sold]} sold />);
    expect(screen.getByText('¥8,000.00')).toBeInTheDocument();
    expect(screen.getByText('¥10,000.00')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('¥12.50')).toBeInTheDocument();
  });

  it('shows a gain in the positive tone when sold above cost', () => {
    const profitable = { ...sold, net_cost_minor: -50_000 };
    const { container } = renderWithProviders(<AssetTable rows={[profitable]} sold />);
    expect(container.querySelector('.oi-positive')).not.toBeNull();
  });
});
