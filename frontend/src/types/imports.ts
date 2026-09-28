import type { CurrencyCode } from './index';

export type ImportRowStatus = 'ready' | 'needs_review' | 'duplicate' | 'ignored' | 'skipped';
export type RuleMatchField = 'merchant' | 'product' | 'note' | 'any_text' | 'source_type';
export type RuleMatchType = 'exact' | 'contains';

export interface ImportSummary {
  detected: number;
  new: number;
  duplicates: number;
  ready: number;
  auto_classified: number;
  needs_review: number;
  ignored: number;
  /** Rows ignored permanently in an earlier import. */
  permanently_ignored: number;
  /** Rows that will be ignored permanently when this import is confirmed. */
  to_ignore: number;
  skipped: number;
  invalid: number;
}

export interface ImportLabel {
  label: string;
  account_id: number | null;
  remembered: boolean;
  row_count: number;
}

export interface ImportRow {
  row_id: number;
  row_number: number;
  external_id: string;
  /** Exact time with the statement's offset, e.g. 2026-09-12T01:30:00+08:00. */
  occurred_at: string;
  /** The statement's own calendar date (source_timezone); used as-is by the ledger. */
  transaction_date: string;
  source_timezone: string;
  source_type: string;
  direction: 'income' | 'expense' | 'neutral';
  counterparty: string;
  product: string;
  note: string;
  remark: string;
  payment_method: string;
  amount_minor: number;
  currency: CurrencyCode;
  source_label: string;
  dest_label: string;
  status: ImportRowStatus;
  kind: 'income' | 'expense' | 'transfer' | null;
  account_id: number | null;
  counter_account_id: number | null;
  category_id: number | null;
  method: 'rule' | 'manual' | 'none';
  rule_id: number | null;
  rule_name: string | null;
  reason: string | null;
  issues: string[];
  ignore_state: 'permanent' | 'pending' | null;
}

export interface ImportPreview {
  token: string;
  source: string;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  header_row: number;
  summary: ImportSummary;
  labels: ImportLabel[];
  rows: ImportRow[];
  errors: { row_number: number; message: string }[];
}

export interface RememberRule {
  match_field: RuleMatchField;
  match_type: RuleMatchType;
  pattern?: string | null;
}

export interface RowOverride {
  row_id: number;
  category_id?: number | null;
  counter_account_id?: number | null;
  /** Leave it out of this import only; it comes back next time. */
  skip?: boolean;
  /** Never import it: remembered by source + WeChat transaction number. */
  ignore?: boolean;
  remember?: RememberRule | null;
}

export interface ImportDecisions {
  mappings: Record<string, number | null>;
  overrides: RowOverride[];
}

export interface ImportBatch {
  id: number;
  source: string;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  detected_count: number;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  ignored_count: number;
  created_at: string;
}

export interface IgnoredItem {
  id: number;
  source: string;
  external_id: string;
  import_batch_id: number | null;
  occurred_at: string | null;
  source_date: string | null;
  amount_minor: number | null;
  currency: CurrencyCode | null;
  raw_type: string | null;
  raw_direction: string | null;
  raw_merchant: string | null;
  raw_product: string | null;
  created_at: string;
}

export interface ImportResult extends ImportBatch {
  transaction_ids: number[];
}

export interface CategorisationRule {
  id: number;
  name: string;
  origin: 'user' | 'system';
  source: string | null;
  match_field: RuleMatchField;
  match_type: RuleMatchType;
  pattern: string;
  secondary_field: RuleMatchField | null;
  secondary_pattern: string | null;
  direction: 'income' | 'expense' | null;
  category_id: number;
  priority: number;
  is_enabled: boolean;
  explanation: string;
}

export interface RulePayload {
  name?: string | null;
  match_field: RuleMatchField;
  match_type: RuleMatchType;
  pattern: string;
  secondary_field?: RuleMatchField | null;
  secondary_pattern?: string | null;
  category_id: number;
  is_enabled?: boolean;
}
