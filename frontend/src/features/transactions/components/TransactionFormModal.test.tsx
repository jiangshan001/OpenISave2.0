import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accountsApi } from '@/api/accounts';
import { categoriesApi } from '@/api/resources';
import { transactionsApi, type TransactionEntryOptions } from '@/api/transactions';
import { makeAccount } from '@/test/fixtures';
import { act, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import type { Transaction } from '@/types';
import { TransactionFormModal } from './TransactionFormModal';

const ACCOUNTS = [
  makeAccount({ id: 1, name: 'Old bank', currency: 'CNY' }),
  makeAccount({ id: 2, name: 'Daily wallet', currency: 'CNY' }),
  makeAccount({ id: 3, name: 'Salary bank', currency: 'GBP' }),
];
const options = (type: 'expense' | 'income'): TransactionEntryOptions => ({ type, currencies:
  type === 'expense' ? [
    { currency: 'CNY', usage_count: 20, accounts: [{ account_id: 2, usage_count: 18 }, { account_id: 1, usage_count: 2 }] },
    { currency: 'GBP', usage_count: 0, accounts: [{ account_id: 3, usage_count: 0 }] },
  ] : [
    { currency: 'GBP', usage_count: 12, accounts: [{ account_id: 3, usage_count: 12 }] },
    { currency: 'CNY', usage_count: 0, accounts: [{ account_id: 1, usage_count: 0 }, { account_id: 2, usage_count: 0 }] },
  ] });

describe('TransactionFormModal usage ranking', () => {
  beforeEach(() => {
    vi.spyOn(accountsApi, 'list').mockResolvedValue(ACCOUNTS);
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([]);
    vi.spyOn(transactionsApi, 'entryOptions').mockImplementation(async (type) => options(type));
  });

  it('chooses the frequent account and uses a separate income default', async () => {
    const user = setupUser();
    renderWithProviders(<TransactionFormModal open onClose={() => {}} />);
    expect(await screen.findByText('Daily wallet · CNY')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(await screen.findByText('Salary bank · GBP')).toBeInTheDocument();
    expect(screen.getByText('Amount (GBP)')).toBeInTheDocument();
    await waitFor(() => expect(transactionsApi.entryOptions).toHaveBeenCalledWith('income'));
  });

  it('keeps the currency/account and amount once money has been entered', async () => {
    const user = setupUser();
    renderWithProviders(<TransactionFormModal open onClose={() => {}} />);
    await screen.findByText('Daily wallet · CNY');
    await user.type(screen.getByRole('spinbutton'), '25');
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByText('Daily wallet · CNY')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue('25.00');
    expect(screen.getByText('Amount (CNY)')).toBeInTheDocument();
  });

  it('waits for a delayed ranking without resetting what the user has entered', async () => {
    let resolve!: (value: TransactionEntryOptions) => void;
    vi.mocked(transactionsApi.entryOptions).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const user = setupUser();
    renderWithProviders(<TransactionFormModal open onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Description/), 'Test draft');
    await waitFor(() => expect(transactionsApi.entryOptions).toHaveBeenCalled());
    await act(async () => resolve(options('expense')));
    expect(await screen.findByText('Daily wallet · CNY')).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toHaveValue('Test draft');
  });

  it('keeps a manually selected account when switching type', async () => {
    const user = setupUser();
    renderWithProviders(<TransactionFormModal open onClose={() => {}} />);
    await screen.findByText('Daily wallet · CNY');
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByText('Old bank · CNY'));
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByText('Old bank · CNY', { selector: '.ant-select-selection-item' })).toBeInTheDocument();
    expect(screen.getByText('Amount (CNY)')).toBeInTheDocument();
  });

  it('preserves an existing transaction account and amount instead of applying defaults', async () => {
    const transaction = { id: 12, type: 'income', account_id: 1, currency: 'CNY',
      amount_minor: 12345, transaction_date: '2026-10-01', description: 'Existing',
      category_id: null, note: null } as Transaction;
    renderWithProviders(<TransactionFormModal open transaction={transaction} onClose={() => {}} />);
    expect(await screen.findByText('Old bank · CNY')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue('123.45');
    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked();
  });
});
