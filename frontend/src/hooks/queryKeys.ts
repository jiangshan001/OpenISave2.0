import type { TransactionFilters } from '@/api/transactions';

export const queryKeys = {
  accounts: (includeArchived: boolean) => ['accounts', includeArchived] as const,
  account: (id: number) => ['accounts', id] as const,
  accountTransactions: (id: number) => ['accounts', id, 'transactions'] as const,
  accountPurposes: ['accounts', 'purposes'] as const,
  transactions: (filters: TransactionFilters) => ['transactions', filters] as const,
  categories: (kind?: string, includeInactive = false) =>
    ["categories", kind ?? "all", includeInactive] as const,
  assets: (status?: string) => ["assets", status ?? "all"] as const,
  asset: (id: number) => ["assets", "detail", id] as const,
  assetCategories: ["assets", "categories"] as const,
  liabilities: ["liabilities"] as const,
  goals: ['goals'] as const,
  budget: (year: number, month: number) => ['budget', year, month] as const,
  dashboard: ['dashboard'] as const,
  dashboardActivity: (months: number) => ['dashboard', 'activity', months] as const,
  report: (year: number, month: number) => ['report', year, month] as const,
  fxRates: ['fx', 'rates'] as const,
  settings: ['settings'] as const,
};

/** Financial views that must be refetched after any ledger mutation. */
export const LEDGER_DEPENDENT_KEYS = [
  "accounts",
  "transactions",
  "dashboard",
  "report",
  "budget",
  "goals",
  "assets",
  "liabilities",
];
