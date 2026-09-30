import { useMutation } from '@tanstack/react-query';
import { App } from 'antd';
import { useRef, useState } from 'react';

import { errorMessage } from '@/api/client';
import { importsApi } from '@/api/imports';
import { useInvalidateAfterImport } from '@/hooks/useImports';
import type { ImportDecisions, ImportPreview, ImportResult, RowOverride } from '@/types/imports';

/**
 * State of one statement import. The component only collects decisions
 * (account per payment method, per-row category/transfer/skip); after every
 * change the backend re-plans the whole statement and returns the new
 * preview, so classification, duplicates and totals are never computed here.
 */
export function useImportSession(source: string) {
  const { message } = App.useApp();
  const invalidate = useInvalidateAfterImport();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, number | null>>({});
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const latest = useRef(0);

  const decisions = (
    nextMappings = mappings,
    nextOverrides = overrides,
  ): ImportDecisions => ({ mappings: nextMappings, overrides: Object.values(nextOverrides) });

  const parse = useMutation({
    mutationFn: (file: File) => importsApi.parse(source, file),
    onSuccess: (next) => {
      setPreview(next);
      setMappings({});
      setOverrides({});
      setResult(null);
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const refresh = useMutation({
    mutationFn: async (input: { id: number; decisions: ImportDecisions }) => ({
      id: input.id,
      preview: await importsApi.preview(preview!.token, input.decisions),
    }),
    onSuccess: ({ id, preview: next }) => {
      if (id === latest.current) setPreview(next); // ignore out-of-order replies
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const replan = (nextMappings: typeof mappings, nextOverrides: typeof overrides) => {
    latest.current += 1;
    refresh.mutate({ id: latest.current, decisions: decisions(nextMappings, nextOverrides) });
  };

  const setMapping = (label: string, accountId: number | null) => {
    const next = { ...mappings, [label]: accountId };
    setMappings(next);
    replan(next, overrides);
  };

  const setOverride = (rowId: number, override: Omit<RowOverride, 'row_id'> | null) => {
    const next = { ...overrides };
    if (override) next[rowId] = { row_id: rowId, ...override };
    else delete next[rowId];
    setOverrides(next);
    replan(mappings, next);
  };

  const confirm = useMutation({
    mutationFn: (options: { rememberMappings: boolean; skipUnresolved: boolean }) =>
      importsApi.confirm(preview!.token, {
        ...decisions(),
        remember_mappings: options.rememberMappings,
        skip_unresolved: options.skipUnresolved,
      }),
    onSuccess: (done) => {
      setResult(done);
      invalidate();
      message.success(`Imported ${done.imported_count} transactions.`);
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const reset = () => {
    if (preview && !result) void importsApi.discard(preview.token).catch(() => undefined);
    setPreview(null);
    setMappings({});
    setOverrides({});
    setResult(null);
  };

  return {
    preview,
    mappings,
    overrides,
    result,
    parse,
    refreshing: refresh.isPending,
    confirm,
    setMapping,
    setOverride,
    reset,
  };
}

export type ImportSession = ReturnType<typeof useImportSession>;
