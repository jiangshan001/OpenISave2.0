import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';

import { accountsApi, type AccountPayload } from '@/api/accounts';
import { errorMessage } from '@/api/client';
import {
  transactionsApi,
  type TransactionFilters,
  type TransactionPayload,
  type TransferPayload,
} from '@/api/transactions';
import { LEDGER_DEPENDENT_KEYS, queryKeys } from './queryKeys';

/** Invalidate every view whose numbers depend on the ledger. */
function useLedgerInvalidation() {
  const client = useQueryClient();
  return () => {
    LEDGER_DEPENDENT_KEYS.forEach((key) => {
      void client.invalidateQueries({ queryKey: [key] });
    });
  };
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.accounts(includeArchived),
    queryFn: () => accountsApi.list(includeArchived),
  });
}

export function useAccount(id: number) {
  return useQuery({
    queryKey: queryKeys.account(id),
    queryFn: () => accountsApi.get(id),
    enabled: Number.isFinite(id),
  });
}

export function useAccountTransactions(id: number) {
  return useQuery({
    queryKey: queryKeys.accountTransactions(id),
    queryFn: () => accountsApi.transactions(id),
    enabled: Number.isFinite(id),
  });
}

export function useAccountPurposes() {
  return useQuery({
    queryKey: queryKeys.accountPurposes,
    queryFn: () => accountsApi.purposes(),
    staleTime: Infinity,
  });
}

export function useSaveAccount(onDone?: () => void) {
  const invalidate = useLedgerInvalidation();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: AccountPayload }) =>
      input.id ? accountsApi.update(input.id, input.payload) : accountsApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Account updated.' : 'Account created.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useArchiveAccount() {
  const invalidate = useLedgerInvalidation();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id: number; archived: boolean }) =>
      accountsApi.archive(input.id, input.archived),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.archived ? 'Account archived.' : 'Account restored.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: () => transactionsApi.list(filters),
  });
}

export function useSaveTransaction(onDone?: () => void) {
  const invalidate = useLedgerInvalidation();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: TransactionPayload }) =>
      input.id
        ? transactionsApi.update(input.id, input.payload)
        : transactionsApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Transaction updated.' : 'Transaction recorded.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useCreateTransfer(onDone?: () => void) {
  const invalidate = useLedgerInvalidation();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (payload: TransferPayload) => transactionsApi.transfer(payload),
    onSuccess: () => {
      invalidate();
      message.success('Transfer recorded.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useVoidTransaction() {
  const invalidate = useLedgerInvalidation();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => transactionsApi.void(id),
    onSuccess: () => {
      invalidate();
      message.success('Transaction voided. It stays in the history for auditability.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}
