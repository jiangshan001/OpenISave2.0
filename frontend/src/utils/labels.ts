import type { AccountGroup, AccountType, TransactionType } from '@/types';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank Account',
  cash: 'Cash',
  ewallet: 'E-Wallet',
  savings: 'Savings',
  credit_card: 'Credit Card',
  loan: 'Loan',
  investment: 'Investment',
  provident_fund: 'Provident Fund',
  property: 'Property',
  other_asset: 'Other Asset',
  other_liability: 'Other Liability',
};

export const LIABILITY_TYPES: AccountType[] = ['credit_card', 'loan', 'other_liability'];

export function isLiabilityType(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type);
}

export const ACCOUNT_GROUP_LABELS: Record<AccountGroup, string> = {
  cash: 'Cash & Bank',
  savings: 'Savings',
  investments: 'Investments',
  other_assets: 'Other Assets',
  physical_assets: 'Physical Assets (counted)',
  liabilities: 'Liabilities',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
  asset_purchase: 'Asset Purchase',
  asset_sale: 'Asset Sale',
};

export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  income: 'green',
  expense: 'red',
  transfer: 'blue',
  adjustment: 'default',
  asset_purchase: 'purple',
  asset_sale: 'cyan',
};

export const FX_FRESHNESS_LABELS: Record<string, string> = {
  fresh: 'Fresh',
  stale: 'Stale — using cached rate',
  missing: 'No rate available',
  identity: 'Base currency',
};

/** Chart palette; index-stable so a category keeps its colour across renders. */
export const CHART_COLORS = [
  '#2f6feb',
  '#22a06b',
  '#e8912d',
  '#c9457c',
  '#7a5af5',
  '#12a5b8',
  '#d4543a',
  '#5f7d95',
  '#8a9a1f',
  '#b2569b',
];

export function colorForIndex(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
