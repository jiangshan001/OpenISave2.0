import { api } from './client';
import type {
  OccurrenceResult,
  ProcessDueResult,
  RecurringPayload,
  RecurringRule,
  UpcomingItem,
} from '@/types/recurring';

export const recurringApi = {
  list: (includeArchived = false) =>
    api.get<RecurringRule[]>('/recurring', { include_archived: includeArchived }),
  create: (payload: RecurringPayload) => api.post<RecurringRule>('/recurring', payload),
  update: (id: number, payload: Partial<RecurringPayload>) =>
    api.patch<RecurringRule>(`/recurring/${id}`, payload),
  pause: (id: number) => api.post<RecurringRule>(`/recurring/${id}/pause`),
  resume: (id: number) => api.post<RecurringRule>(`/recurring/${id}/resume`),
  archive: (id: number) => api.post<RecurringRule>(`/recurring/${id}/archive`),
  upcoming: (days = 14) => api.get<UpcomingItem[]>('/recurring/upcoming', { days }),
  generate: (id: number, date: string) =>
    api.post<OccurrenceResult>(`/recurring/${id}/occurrences/${date}/generate`),
  skip: (id: number, date: string) =>
    api.post<OccurrenceResult>(`/recurring/${id}/occurrences/${date}/skip`),
  processDue: () => api.post<ProcessDueResult>('/recurring/process-due'),
};
