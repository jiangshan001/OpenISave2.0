import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';

import { errorMessage } from '@/api/client';
import {
  budgetsApi,
  categoriesApi,
  fxApi,
  goalsApi,
  reportsApi,
  settingsApi,
  type GoalPayload,
} from '@/api/resources';
import type { CategoryKind } from '@/types';
import { LEDGER_DEPENDENT_KEYS, queryKeys } from './queryKeys';

function useInvalidateFinancialViews() {
  const client = useQueryClient();
  return () =>
    LEDGER_DEPENDENT_KEYS.forEach((key) => {
      void client.invalidateQueries({ queryKey: [key] });
    });
}

export function useCategories(kind?: CategoryKind, includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.categories(kind, includeInactive),
    queryFn: () => categoriesApi.list(kind, includeInactive),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateCategories() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['categories'] });
    void client.invalidateQueries({ queryKey: ['budget'] });
  };
}

export function useSaveCategory(onDone?: () => void) {
  const invalidate = useInvalidateCategories();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: {
      id?: number;
      payload: { name: string; kind: CategoryKind; parent_id?: number | null };
    }) =>
      input.id
        ? categoriesApi.update(input.id, {
            name: input.payload.name,
            parent_id: input.payload.parent_id,
          })
        : categoriesApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Category updated.' : 'Category created.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useArchiveCategory() {
  const invalidate = useInvalidateCategories();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id: number; archived: boolean }) =>
      categoriesApi.archive(input.id, input.archived),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(
        input.archived
          ? 'Category archived. Existing transactions keep it.'
          : 'Category restored.',
      );
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success('Category deleted.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => reportsApi.dashboard() });
}

/** Daily income/expense totals for the heatmap; invalidated with the dashboard. */
export function useDashboardActivity(months = 12) {
  return useQuery({
    queryKey: queryKeys.dashboardActivity(months),
    queryFn: () => reportsApi.activity(months),
  });
}

export function useMonthlyReport(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.report(year, month),
    queryFn: () => reportsApi.monthly(year, month),
  });
}

export function useGoals() {
  return useQuery({ queryKey: queryKeys.goals, queryFn: () => goalsApi.list() });
}

export function useSaveGoal(onDone?: () => void) {
  const invalidate = useInvalidateFinancialViews();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: GoalPayload }) =>
      input.id ? goalsApi.update(input.id, input.payload) : goalsApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Goal updated.' : 'Goal created.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateFinancialViews();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => goalsApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success('Goal removed. No money was affected.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useBudget(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.budget(year, month),
    queryFn: () => budgetsApi.get(year, month),
  });
}

export function useSaveBudget(year: number, month: number, onDone?: () => void) {
  const invalidate = useInvalidateFinancialViews();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (entries: { category_id: number; amount_minor: number }[]) =>
      budgetsApi.save(year, month, entries),
    onSuccess: () => {
      invalidate();
      message.success('Budget saved.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useFxRates() {
  return useQuery({ queryKey: queryKeys.fxRates, queryFn: () => fxApi.rates() });
}

export function useRefreshFx() {
  const client = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: () => fxApi.refresh(),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: queryKeys.fxRates });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void client.invalidateQueries({ queryKey: ['accounts'] });
      if (result.ok) message.success(result.message);
      else message.warning(result.message);
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useSetManualRate(onDone?: () => void) {
  const client = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: fxApi.setManual,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.fxRates });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void client.invalidateQueries({ queryKey: ['accounts'] });
      message.success('Manual rate saved.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => settingsApi.get() });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.settings });
      message.success('Settings saved.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}
