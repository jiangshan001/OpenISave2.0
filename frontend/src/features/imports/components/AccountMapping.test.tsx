import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '@/test/utils';
import type { Account } from '@/types';
import { AccountMapping } from './AccountMapping';

function account(id: number, name: string, currency: 'CNY' | 'GBP'): Account {
  return {
    id, name, currency, institution: null, account_type: 'bank', purpose: null,
    opening_balance_minor: 0, include_in_net_worth: true, is_active: true, is_archived: false,
    note: null, sort_order: 0, created_at: '', updated_at: '',
  };
}

describe('AccountMapping', () => {
  it('lists every payment method with its mapping state', () => {
    renderWithProviders(
      <AccountMapping
        labels={[
          { label: '零钱', account_id: 1, remembered: true, row_count: 12 },
          { label: '中国银行储蓄卡(8080)', account_id: null, remembered: false, row_count: 3 },
        ]}
        accounts={[account(1, 'WeChat', 'CNY'), account(2, 'Monzo', 'GBP')]}
        currency="CNY"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('“零钱”')).toBeInTheDocument();
    expect(screen.getByText('Remembered')).toBeInTheDocument();
    expect(screen.getByText('“中国银行储蓄卡(8080)”')).toBeInTheDocument();
    expect(screen.getByText('1 to map')).toBeInTheDocument();
    expect(screen.getByText('WeChat · CNY')).toBeInTheDocument();
  });
});
