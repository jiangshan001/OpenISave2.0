import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { AccountDetailPage } from '@/features/accounts/AccountDetailPage';
import { AccountsPage } from '@/features/accounts/AccountsPage';
import { AssetDetailPage } from '@/features/assets/AssetDetailPage';
import { AssetsPage } from '@/features/assets/AssetsPage';
import { BudgetPage } from '@/features/budgets/BudgetPage';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'accounts/:accountId', element: <AccountDetailPage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'assets/:assetId', element: <AssetDetailPage /> },
      { path: 'goals', element: <GoalsPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
