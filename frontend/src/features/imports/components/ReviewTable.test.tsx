import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, setupUser, within } from '@/test/utils';
import type { Category } from '@/types';
import type { ImportRow, ImportSummary } from '@/types/imports';
import { ConfirmBar } from './ConfirmBar';
import { ReviewTable } from './ReviewTable';

const categories: Category[] = [
  { id: 1, name: 'Food', kind: 'expense', parent_id: null, sort_order: 0, is_active: true, depth: 0, transaction_count: 0, subtree_transaction_count: 0 },
  { id: 2, name: 'Delivery', kind: 'expense', parent_id: 1, sort_order: 1, is_active: true, depth: 1, transaction_count: 0, subtree_transaction_count: 0 },
];

function row(overrides: Partial<ImportRow>): ImportRow {
  return {
    row_id: 0, row_number: 19, external_id: '4200000000000000000000000000001',
    occurred_at: '2026-09-19T12:00:00+08:00', transaction_date: '2026-09-19',
    source_timezone: 'Asia/Shanghai', source_type: '商户消费',
    direction: 'expense', counterparty: 'ROOFOODS LTD', product: 'txn_x', note: '', remark: '',
    payment_method: '零钱', amount_minor: 19093, currency: 'CNY', source_label: '零钱', dest_label: '',
    status: 'ready', kind: 'expense', account_id: null, counter_account_id: null, category_id: 2,
    method: 'rule', rule_id: 7, rule_name: 'Deliveroo (ROOFOODS LTD)',
    reason: 'Built-in rule: merchant is “ROOFOODS LTD”', issues: [], ignore_state: null,
    ...overrides,
  };
}

const rows = [
  row({}),
  row({ row_id: 1, counterparty: 'nathan', note: '8月艺鸣课时费', status: 'needs_review', category_id: null,
        method: 'none', rule_id: null, rule_name: null, reason: null, issues: ['No rule matched: choose a category'] }),
  row({ row_id: 2, counterparty: 'Old Shop', status: 'duplicate', reason: 'Already imported' }),
  row({ row_id: 3, counterparty: 'Tutor', status: 'ignored', ignore_state: 'permanent',
        reason: 'Ignored permanently by you', category_id: null, method: 'none' }),
];

describe('ReviewTable', () => {
  it('opens on the rows that need review and explains why', async () => {
    const user = setupUser();
    renderWithProviders(
      <ReviewTable rows={rows} overrides={{}} accounts={[]} categories={categories} loading={false} onOverride={vi.fn()} />,
    );
    expect(screen.getByText('nathan')).toBeInTheDocument();
    expect(screen.queryByText('ROOFOODS LTD')).not.toBeInTheDocument();
    expect(screen.getByText('No rule matched: choose a category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();

    await user.click(screen.getByText('All · 4'));
    const ready = screen.getByText('ROOFOODS LTD').closest('tr') as HTMLElement;
    expect(within(ready).getByText('Food · Delivery')).toBeInTheDocument();
    expect(within(ready).getByText('Rule: Deliveroo (ROOFOODS LTD)')).toBeInTheDocument();
    expect(within(ready).getByText('-¥190.93')).toBeInTheDocument();
    const duplicate = screen.getByText('Old Shop').closest('tr') as HTMLElement;
    expect(within(duplicate).getByText('Already imported')).toBeInTheDocument();
    expect(within(duplicate).queryByRole('button')).not.toBeInTheDocument();
    const ignored = screen.getByText('Tutor').closest('tr') as HTMLElement;
    expect(within(ignored).getByText('Ignored permanently')).toBeInTheDocument();
    expect(within(ignored).queryByRole('button')).not.toBeInTheDocument();
  });

  it('can mark a row to be ignored permanently', async () => {
    const onOverride = vi.fn();
    const user = setupUser();
    renderWithProviders(
      <ReviewTable rows={rows} overrides={{}} accounts={[]} categories={categories} loading={false} onOverride={onOverride} />,
    );
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await user.click(await screen.findByText('Ignore permanently'));
    expect(screen.getByText(/Whenever WeChat transaction/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onOverride).toHaveBeenCalledWith(1, { ignore: true });
  });

  it('distinguishes skipping this import from ignoring permanently', async () => {
    const onOverride = vi.fn();
    const user = setupUser();
    renderWithProviders(
      <ReviewTable rows={rows} overrides={{}} accounts={[]} categories={categories} loading={false} onOverride={onOverride} />,
    );
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await user.click(await screen.findByText('Skip this import'));
    expect(screen.getByText('Not imported now. It shows up again in later imports.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onOverride).toHaveBeenCalledWith(1, { skip: true });
  });
});

const summary: ImportSummary = {
  detected: 18, new: 18, duplicates: 0, ready: 15, auto_classified: 12,
  needs_review: 3, ignored: 0, permanently_ignored: 0, to_ignore: 0, skipped: 0, invalid: 0,
};

describe('ConfirmBar', () => {
  it('blocks the import until unresolved rows are resolved or explicitly skipped', async () => {
    const onConfirm = vi.fn();
    const user = setupUser();
    renderWithProviders(<ConfirmBar summary={summary} busy={false} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Import 15 transactions' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Resolve 3 rows first, or skip them.')).toBeInTheDocument();

    await user.click(screen.getByText('Skip unresolved rows (3)'));
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledWith({ rememberMappings: true, skipUnresolved: true });
  });

  it('cannot import when nothing is ready', () => {
    renderWithProviders(
      <ConfirmBar summary={{ ...summary, ready: 0, needs_review: 0, duplicates: 18 }} busy={false}
        onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();
  });

  it('allows confirming an import that only records permanent ignores', async () => {
    const onConfirm = vi.fn();
    const user = setupUser();
    renderWithProviders(
      <ConfirmBar summary={{ ...summary, ready: 0, needs_review: 0, to_ignore: 2, ignored: 2 }} busy={false}
        onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: 'Ignore 2 rows permanently' });
    expect(button).toBeEnabled();
    expect(screen.getByText(/2 will be ignored permanently/)).toBeInTheDocument();
    await user.click(button);
    expect(onConfirm).toHaveBeenCalled();
  });
});
