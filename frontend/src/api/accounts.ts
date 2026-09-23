import { api } from './client';
import type { Account, AccountBalance, AccountType, CurrencyCode, Transaction } from '@/types';

export interface AccountPayload {
  name: string;
  institution?: string | null;
  account_type: AccountType;
  currency: CurrencyCode;
  purpose?: string | null;
  opening_balance_minor: number;
  include_in_net_worth: boolean;
  note?: string | null;
}

export interface PurposeOption {
  value: string;
  label: string;
}

export const accountsApi = {
  list: (includeArchived = false) =>
    api.get<AccountBalance[]>('/accounts', { include_archived: includeArchived }),
  get: (id: number) => api.get<AccountBalance>(`/accounts/${id}`),
  create: (payload: AccountPayload) => api.post<Account>('/accounts', payload),
  update: (id: number, payload: Partial<AccountPayload>) =>
    api.patch<Account>(`/accounts/${id}`, payload),
  archive: (id: number, archived: boolean) =>
    api.post<Account>(`/accounts/${id}/archive?archived=${archived}`),
  purposes: () => api.get<PurposeOption[]>('/accounts/purposes'),
  types: () => api.get<AccountType[]>('/accounts/types'),
  transactions: (id: number, limit = 50) =>
    api.get<Transaction[]>(`/accounts/${id}/transactions`, { limit }),
};
