import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';

import { errorMessage } from '@/api/client';
import { importsApi, rulesApi } from '@/api/imports';
import type { RulePayload } from '@/types/imports';
import { LEDGER_DEPENDENT_KEYS, queryKeys } from './queryKeys';

export function useImportHistory() {
  return useQuery({ queryKey: queryKeys.importHistory, queryFn: () => importsApi.history() });
}

/** Refresh every financial view plus import history after a confirmed import. */
export function useInvalidateAfterImport() {
  const client = useQueryClient();
  return () => {
    [...LEDGER_DEPENDENT_KEYS, 'imports'].forEach((key) => {
      void client.invalidateQueries({ queryKey: [key] });
    });
  };
}

export function useIgnoredItems() {
  return useQuery({ queryKey: queryKeys.importIgnored, queryFn: () => importsApi.ignored() });
}

export function useRestoreIgnored() {
  const client = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => importsApi.restoreIgnored(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.importIgnored });
      message.success('Restored. It will be offered again the next time it appears in a statement.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useRules() {
  return useQuery({ queryKey: queryKeys.categorisationRules, queryFn: () => rulesApi.list() });
}

function useRuleInvalidation() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: queryKeys.categorisationRules });
}

export function useSaveRule(onDone?: () => void) {
  const invalidate = useRuleInvalidation();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: Partial<RulePayload> }) =>
      input.id
        ? rulesApi.update(input.id, input.payload)
        : rulesApi.create(input.payload as RulePayload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Rule updated.' : 'Rule created.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useRuleCommands() {
  const invalidate = useRuleInvalidation();
  const { message } = App.useApp();
  const onError = (error: unknown) => message.error(errorMessage(error));
  const toggle = useMutation({
    mutationFn: (input: { id: number; enabled: boolean }) =>
      rulesApi.update(input.id, { is_enabled: input.enabled }),
    onSuccess: invalidate,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) => rulesApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success('Rule deleted.');
    },
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: number[]) => rulesApi.reorder(ids),
    onSuccess: invalidate,
    onError,
  });
  return { toggle, remove, reorder };
}
