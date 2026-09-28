import { api } from './client';
import type {
  CategorisationRule,
  IgnoredItem,
  ImportBatch,
  ImportDecisions,
  ImportPreview,
  ImportResult,
  RulePayload,
} from '@/types/imports';

export const importsApi = {
  /** Parsed locally by the backend; nothing is stored until confirm. */
  parse: (source: string, file: File) =>
    api.upload<ImportPreview>(`/imports/${source}/parse`, file, file.name),
  preview: (token: string, decisions: ImportDecisions) =>
    api.post<ImportPreview>(`/imports/sessions/${token}/preview`, decisions),
  confirm: (
    token: string,
    decisions: ImportDecisions & { remember_mappings: boolean; skip_unresolved: boolean },
  ) => api.post<ImportResult>(`/imports/sessions/${token}/confirm`, decisions),
  discard: (token: string) => api.delete<void>(`/imports/sessions/${token}`),
  history: () => api.get<ImportBatch[]>('/imports/history'),
  batchTransactions: (id: number) => api.get<number[]>(`/imports/history/${id}/transactions`),
  ignored: () => api.get<IgnoredItem[]>('/imports/ignored'),
  restoreIgnored: (id: number) => api.delete<void>(`/imports/ignored/${id}`),
};

export const rulesApi = {
  list: () => api.get<CategorisationRule[]>('/categorisation-rules'),
  create: (payload: RulePayload) => api.post<CategorisationRule>('/categorisation-rules', payload),
  update: (id: number, payload: Partial<RulePayload> & { priority?: number }) =>
    api.patch<CategorisationRule>(`/categorisation-rules/${id}`, payload),
  remove: (id: number) => api.delete<void>(`/categorisation-rules/${id}`),
  reorder: (ruleIds: number[]) =>
    api.post<CategorisationRule[]>('/categorisation-rules/reorder', { rule_ids: ruleIds }),
};
