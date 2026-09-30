import type { CurrencyCode } from './index';

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';
export type RecurringMode = 'review' | 'automatic';
export type RecurringStatus = 'active' | 'paused' | 'archived';
export type RecurringType = 'income' | 'expense' | 'transfer';

export interface RecurringRule {
  id: number;
  name: string;
  transaction_type: RecurringType;
  account_id: number;
  destination_account_id: number | null;
  category_id: number | null;
  amount_minor: number;
  currency: CurrencyCode;
  dest_amount_minor: number | null;
  description: string;
  note: string | null;
  frequency: RecurringFrequency;
  interval: number;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  next_run_date: string | null;
  mode: RecurringMode;
  status: RecurringStatus;
  last_generated_at: string | null;
  due_count: number;
  generated_count: number;
  created_at: string;
  updated_at: string;
}

export interface RecurringPayload {
  name: string;
  transaction_type: RecurringType;
  account_id: number;
  destination_account_id?: number | null;
  category_id?: number | null;
  amount_minor: number;
  dest_amount_minor?: number | null;
  description?: string;
  note?: string | null;
  frequency: RecurringFrequency;
  interval: number;
  start_date: string;
  end_date?: string | null;
  day_of_month?: number | null;
  mode: RecurringMode;
}

export interface UpcomingItem {
  rule_id: number;
  name: string;
  transaction_type: RecurringType;
  amount_minor: number;
  currency: CurrencyCode;
  account_id: number;
  destination_account_id: number | null;
  category_id: number | null;
  occurrence_date: string;
  days_until: number;
  is_due: boolean;
  mode: RecurringMode;
}

export interface OccurrenceResult {
  rule_id: number;
  occurrence_date: string;
  status: 'generated' | 'skipped';
  transaction_id: number | null;
}

export interface ProcessDueResult {
  generated: OccurrenceResult[];
  failed: { rule_id: number; occurrence_date: string; message: string }[];
}
