import type { CurrencyCode, FxFreshness } from '.';

export type AssetStatus = 'holding' | 'sold' | 'disposed';

export type LiabilityType = 'loan' | 'financing' | 'mortgage' | 'credit_card' | 'other';

export interface AssetCategory {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface CurrentValue {
  value_minor: number;
  currency: CurrencyCode;
  base_minor: number | null;
  valuation_date: string;
  /** 'valuation' when the user supplied one, 'purchase_price' when estimated. */
  source: 'valuation' | 'purchase_price';
  fx_freshness: FxFreshness;
}

export interface AssetValuation {
  id: number;
  asset_id: number;
  valuation_date: string;
  value_minor: number;
  currency: CurrencyCode;
  note: string | null;
  created_at: string;
}

export interface Asset {
  id: number;
  name: string;
  asset_category_id: number | null;
  category_name: string | null;
  description: string | null;
  purchase_date: string;
  purchase_price_minor: number;
  purchase_currency: CurrencyCode;
  purchase_base_minor: number;
  status: AssetStatus;
  sale_date: string | null;
  sale_price_minor: number | null;
  sale_currency: CurrencyCode | null;
  sale_base_minor: number | null;
  include_in_net_worth: boolean;
  linked_liability_id: number | null;
  liability_name: string | null;
  note: string | null;
  current_value: CurrentValue | null;
  days_held: number;
  holding_cost_per_day_minor: number | null;
  net_cost_minor: number | null;
  effective_cost_per_day_minor: number | null;
  created_at: string;
  updated_at: string;
}

export interface AssetDetail extends Asset {
  valuations: AssetValuation[];
}

export interface Liability {
  id: number;
  name: string;
  liability_type: LiabilityType;
  account_id: number;
  account_name: string;
  currency: CurrencyCode;
  original_amount_minor: number;
  outstanding_minor: number;
  base_outstanding_minor: number | null;
  repaid_minor: number;
  repaid_percent: number | null;
  fx_freshness: FxFreshness;
  start_date: string | null;
  end_date: string | null;
  interest_rate_percent: string | null;
  lender: string | null;
  note: string | null;
  linked_asset_names: string[];
  created_at: string;
}
