import { api } from './client';
import type {
  AppSettings,
  BudgetPeriod,
  Category,
  CategoryKind,
  Currency,
  CurrencyCode,
  FxRateStatus,
  Goal,
  GoalSelectionMode,
} from '@/types';
import type { DailyActivity, Dashboard, MonthlyReport } from '@/types/dashboard';

export const categoriesApi = {
  list: (kind?: CategoryKind, includeInactive = false) =>
    api.get<Category[]>('/categories', { kind, include_inactive: includeInactive }),
  create: (payload: { name: string; kind: CategoryKind; parent_id?: number | null }) =>
    api.post<Category>('/categories', payload),
  update: (id: number, payload: { name?: string; parent_id?: number | null }) =>
    api.patch<Category>(`/categories/${id}`, payload),
  archive: (id: number, archived: boolean) =>
    api.post<Category>(`/categories/${id}/archive?archived=${archived}`),
  remove: (id: number) => api.delete<void>(`/categories/${id}`),
};

export interface GoalPayload {
  name: string;
  currency: CurrencyCode;
  target_amount_minor?: number | null;
  deadline?: string | null;
  selection_mode?: GoalSelectionMode;
  account_ids?: number[];
  note?: string | null;
}

export const goalsApi = {
  list: () => api.get<Goal[]>('/goals'),
  create: (payload: GoalPayload) => api.post<Goal>('/goals', payload),
  update: (id: number, payload: Partial<GoalPayload>) => api.patch<Goal>(`/goals/${id}`, payload),
  remove: (id: number) => api.delete<void>(`/goals/${id}`),
};

export const budgetsApi = {
  saveOverall: (year: number, month: number, overall_limit_minor: number | null) =>
    api.patch<BudgetPeriod>(`/budgets/${year}/${month}/overall`, { overall_limit_minor }),
  get: (year: number, month: number) => api.get<BudgetPeriod>(`/budgets/${year}/${month}`),
  save: (year: number, month: number, entries: { category_id: number; amount_minor: number }[]) =>
    api.put<BudgetPeriod>(`/budgets/${year}/${month}`, { entries }),
};

export const fxApi = {
  rates: () => api.get<FxRateStatus[]>('/fx/rates'),
  refresh: () =>
    api.post<{ ok: boolean; updated: number; message: string; rates: FxRateStatus[] }>(
      '/fx/refresh',
    ),
  setManual: (payload: {
    from_currency: CurrencyCode;
    to_currency: CurrencyCode;
    rate: string;
    rate_date?: string | null;
  }) => api.post<FxRateStatus[]>('/fx/rates', payload),
};

export const reportsApi = {
  dashboard: () => api.get<Dashboard>('/dashboard'),
  activity: (months = 12) => api.get<DailyActivity>('/dashboard/activity', { months }),
  monthly: (year: number, month: number) =>
    api.get<MonthlyReport>(`/reports/monthly/${year}/${month}`),
};

export const settingsApi = {
  get: () => api.get<AppSettings>('/settings'),
  update: (payload: Partial<Pick<AppSettings, 'timezone' | 'locale' | 'fx_stale_after_days'>>) =>
    api.put<AppSettings>('/settings', payload),
  currencies: () => api.get<Currency[]>('/currencies'),
  health: () => api.get<{ status: string; version: string }>('/health'),
};
