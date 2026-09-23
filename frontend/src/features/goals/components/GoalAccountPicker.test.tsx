
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { makeAccount } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import type { GoalSelectionMode } from '@/types';
import { GoalAccountPicker, isEligible } from './GoalAccountPicker';

const ACCOUNTS = [
  makeAccount({ id: 1, name: '招商银行' }),
  makeAccount({ id: 2, name: '中国银行' }),
  makeAccount({ id: 3, name: 'HSBC Savings', currency: 'GBP' }),
  makeAccount({ id: 4, name: 'Credit Card', account_type: 'credit_card', is_liability: true }),
  makeAccount({ id: 5, name: 'Old Account', is_archived: true, is_active: false }),
  makeAccount({ id: 6, name: 'Shared Pot', include_in_net_worth: false }),
];

function Harness({ onSelected }: { onSelected?: (ids: number[]) => void }) {
  const [mode, setMode] = useState<GoalSelectionMode>('selected');
  const [selected, setSelected] = useState<number[]>([]);
  return (
    <GoalAccountPicker
      accounts={ACCOUNTS}
      mode={mode}
      selected={selected}
      onModeChange={setMode}
      onSelectedChange={(ids) => {
        setSelected(ids);
        onSelected?.(ids);
      }}
    />
  );
}

describe('goal eligibility rule', () => {
  it('accepts active asset accounts counted in net worth', () => {
    expect(isEligible(makeAccount({ account_type: 'savings' }))).toBe(true);
    expect(isEligible(makeAccount({ account_type: 'bank' }))).toBe(true);
  });

  it('rejects liabilities, archived accounts and excluded accounts', () => {
    expect(isEligible(makeAccount({ account_type: 'credit_card' }))).toBe(false);
    expect(isEligible(makeAccount({ account_type: 'loan' }))).toBe(false);
    expect(isEligible(makeAccount({ account_type: 'other_liability' }))).toBe(false);
    expect(isEligible(makeAccount({ is_archived: true }))).toBe(false);
    expect(isEligible(makeAccount({ is_active: false }))).toBe(false);
    expect(isEligible(makeAccount({ include_in_net_worth: false }))).toBe(false);
  });
});

describe('GoalAccountPicker', () => {
  it('only offers eligible accounts', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('招商银行')).toBeInTheDocument();
    expect(screen.getByText('中国银行')).toBeInTheDocument();
    expect(screen.getByText('HSBC Savings')).toBeInTheDocument();
    expect(screen.queryByText('Credit Card')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Shared Pot')).not.toBeInTheDocument();
  });

  it('selects several accounts at once', async () => {
    const user = setupUser();
    const onSelected = vi.fn();
    renderWithProviders(<Harness onSelected={onSelected} />);

    await user.click(screen.getByRole('checkbox', { name: /招商银行/ }));
    await user.click(screen.getByRole('checkbox', { name: /HSBC Savings/ }));

    expect(onSelected).toHaveBeenLastCalledWith([1, 3]);
  });

  it('switches to all-eligible mode and explains what that means', async () => {
    const user = setupUser();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('radio', { name: 'All eligible accounts' }));

    expect(screen.getByText(/follows all 3 eligible accounts/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
