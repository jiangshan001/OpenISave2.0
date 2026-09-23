import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';

import {
  assetsApi,
  liabilitiesApi,
  type AssetPayload,
  type AssetSalePayload,
  type LiabilityPayload,
} from '@/api/assets';
import { errorMessage } from '@/api/client';
import type { AssetStatus } from '@/types/asset';
import { LEDGER_DEPENDENT_KEYS, queryKeys } from './queryKeys';

function useInvalidate() {
  const client = useQueryClient();
  return () =>
    [...LEDGER_DEPENDENT_KEYS, 'assets', 'liabilities'].forEach((key) => {
      void client.invalidateQueries({ queryKey: [key] });
    });
}

export function useAssets(status?: AssetStatus) {
  return useQuery({ queryKey: queryKeys.assets(status), queryFn: () => assetsApi.list(status) });
}

export function useAsset(id: number) {
  return useQuery({
    queryKey: queryKeys.asset(id),
    queryFn: () => assetsApi.get(id),
    enabled: Number.isFinite(id),
  });
}

export function useAssetCategories() {
  return useQuery({
    queryKey: queryKeys.assetCategories,
    queryFn: () => assetsApi.categories(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveAsset(onDone?: () => void) {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: AssetPayload }) =>
      input.id ? assetsApi.update(input.id, input.payload) : assetsApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Asset updated.' : 'Asset added.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useSellAsset(onDone?: () => void) {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id: number; payload: AssetSalePayload }) =>
      assetsApi.sell(input.id, input.payload),
    onSuccess: () => {
      invalidate();
      message.success('Asset marked as sold. Its full history is kept.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useAddValuation(onDone?: () => void) {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: {
      id: number;
      payload: { value_minor: number; valuation_date?: string; note?: string };
    }) => assetsApi.addValuation(input.id, input.payload),
    onSuccess: () => {
      invalidate();
      message.success('Valuation recorded.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useDeleteAsset(onDone?: () => void) {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => assetsApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success('Asset removed.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useLiabilities() {
  return useQuery({ queryKey: queryKeys.liabilities, queryFn: () => liabilitiesApi.list() });
}

export function useSaveLiability(onDone?: () => void) {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: LiabilityPayload }) =>
      input.id
        ? liabilitiesApi.update(input.id, input.payload)
        : liabilitiesApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Liability updated.' : 'Liability added.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useRepayLiability(onDone?: () => void) {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: {
      id: number;
      payload: { from_account_id: number; amount_minor: number; transaction_date?: string };
    }) => liabilitiesApi.repay(input.id, input.payload),
    onSuccess: () => {
      invalidate();
      message.success('Repayment recorded.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useDeleteLiability() {
  const invalidate = useInvalidate();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => liabilitiesApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success('Liability removed. The account and its history are kept.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}
