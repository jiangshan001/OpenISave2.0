import { api } from './client';
import type { CurrencyCode } from '@/types';
import type {
  Asset,
  AssetCategory,
  AssetDetail,
  AssetStatus,
  AssetValuation,
  Liability,
  LiabilityType,
} from '@/types/asset';
import type { Transaction } from '@/types';

export interface AssetPaymentPayload {
  account_id?: number | null;
  cash_amount_minor?: number | null;
  liability_account_id?: number | null;
  financed_amount_minor?: number;
}

export interface AssetPayload {
  name: string;
  asset_category_id?: number | null;
  description?: string | null;
  purchase_date: string;
  purchase_price_minor: number;
  purchase_currency: CurrencyCode;
  /** Omit or null to follow the category default; a boolean is a manual choice. */
  include_in_net_worth?: boolean | null;
  linked_liability_id?: number | null;
  note?: string | null;
  payment?: AssetPaymentPayload | null;
}

export interface AssetSalePayload {
  sale_date?: string | null;
  sale_price_minor: number;
  sale_currency?: CurrencyCode | null;
  destination_account_id?: number | null;
  status?: AssetStatus;
}

export const assetsApi = {
  list: (status?: AssetStatus) => api.get<Asset[]>('/assets', { status }),
  get: (id: number) => api.get<AssetDetail>(`/assets/${id}`),
  create: (payload: AssetPayload) => api.post<Asset>('/assets', payload),
  update: (id: number, payload: Partial<AssetPayload>) =>
    api.patch<Asset>(`/assets/${id}`, payload),
  sell: (id: number, payload: AssetSalePayload) => api.post<Asset>(`/assets/${id}/sell`, payload),
  remove: (id: number) => api.delete<void>(`/assets/${id}`),
  categories: () => api.get<AssetCategory[]>('/assets/categories'),
  createCategory: (name: string) => api.post<AssetCategory>('/assets/categories', { name }),
  valuations: (id: number) => api.get<AssetValuation[]>(`/assets/${id}/valuations`),
  addValuation: (
    id: number,
    payload: { value_minor: number; valuation_date?: string; currency?: CurrencyCode; note?: string },
  ) => api.post<AssetValuation>(`/assets/${id}/valuations`, payload),
  deleteValuation: (assetId: number, valuationId: number) =>
    api.delete<void>(`/assets/${assetId}/valuations/${valuationId}`),
};

export interface LiabilityPayload {
  name: string;
  liability_type: LiabilityType;
  currency: CurrencyCode;
  account_id?: number | null;
  original_amount_minor: number;
  outstanding_amount_minor?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  interest_rate_percent?: string | null;
  lender?: string | null;
  note?: string | null;
}

export const liabilitiesApi = {
  list: () => api.get<Liability[]>('/liabilities'),
  get: (id: number) => api.get<Liability>(`/liabilities/${id}`),
  create: (payload: LiabilityPayload) => api.post<Liability>('/liabilities', payload),
  update: (id: number, payload: Partial<LiabilityPayload>) =>
    api.patch<Liability>(`/liabilities/${id}`, payload),
  remove: (id: number) => api.delete<void>(`/liabilities/${id}`),
  repay: (
    id: number,
    payload: { from_account_id: number; amount_minor: number; transaction_date?: string },
  ) => api.post<Transaction>(`/liabilities/${id}/repayments`, payload),
};
