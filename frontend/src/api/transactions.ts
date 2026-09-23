import { api } from './client';
import type { CurrencyCode, Page, Transaction, TransactionType } from '@/types';

export interface TransactionFilters {
  account_id?: number;
  type?: TransactionType;
  category_id?: number;
  currency?: CurrencyCode;
  date_from?: string;
  date_to?: string;
  search?: string;
  include_voided?: boolean;
  limit?: number;
  offset?: number;
}

export interface TransactionPayload {
  type: 'income' | 'expense';
  account_id: number;
  amount_minor: number;
  transaction_date: string;
  description: string;
  category_id?: number | null;
  note?: string | null;
  fx_rate?: string | null;
}

export interface TransferPayload {
  from_account_id: number;
  to_account_id: number;
  amount_minor: number;
  dest_amount_minor?: number | null;
  transaction_date: string;
  description?: string | null;
  note?: string | null;
  fee_minor?: number;
}

export const transactionsApi = {
  list: (filters: TransactionFilters = {}) =>
    api.get<Page<Transaction>>('/transactions', filters as Record<string, unknown>),
  get: (id: number) => api.get<Transaction>(`/transactions/${id}`),
  create: (payload: TransactionPayload) => api.post<Transaction>('/transactions', payload),
  update: (id: number, payload: Partial<TransactionPayload>) =>
    api.patch<Transaction>(`/transactions/${id}`, payload),
  void: (id: number) => api.post<Transaction>(`/transactions/${id}/void`),
  transfer: (payload: TransferPayload) => api.post<Transaction>('/transfers', payload),
};
