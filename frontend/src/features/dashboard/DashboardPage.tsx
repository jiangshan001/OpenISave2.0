import { PlusOutlined } from '@ant-design/icons';
import { WalletOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CashFlowChart } from '@/components/charts/CashFlowChart';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAccounts } from '@/hooks/useLedger';
import { useUpcoming } from '@/hooks/useRecurring';
import { useDashboard } from '@/hooks/useResources';
import { monthLabel } from '@/utils/dates';
import { TransactionFormModal } from '../transactions/components/TransactionFormModal';
import { AccountsSummary } from './components/AccountsSummary';
import { ActivityHeatmapCard } from './components/ActivityHeatmap';
import { AssetBreakdown } from './components/AssetBreakdown';
import { BudgetUsageCard } from './components/BudgetUsageCard';
import { CategorySplitCard } from './components/CategorySplitCard';
import { GoalsSummaryCard } from './components/GoalsSummaryCard';
import { RecentTransactions } from './components/RecentTransactions';
import { SummaryCards } from './components/SummaryCards';
import { UpcomingCard } from './components/UpcomingCard';

export function DashboardPage() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, error, refetch } = useDashboard();
  const { data: accounts } = useAccounts();
  const { data: upcoming } = useUpcoming(14);
  const hasUpcoming = (upcoming ?? []).length > 0;

  const hasAccounts = (accounts ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={
          data ? `${monthLabel(data.period.year, data.period.month)} · reported in CNY` : undefined
        }
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!hasAccounts}
            onClick={() => setFormOpen(true)}
          >
            Add transaction
          </Button>
        }
      />

      <StateBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        skeletonRows={8}
      >
        {data ? (
          <>
            {!hasAccounts ? (
              <Card variant="borderless" style={{ marginBottom: 20 }}>
                <EmptyState
                  icon={<WalletOutlined />}
                  title="Welcome to OpenISave"
                  text="Start by adding the bank accounts you use. Everything else builds on them."
                  action={
                    <Button type="primary" onClick={() => navigate('/accounts')}>
                      Add your first account
                    </Button>
                  }
                />
              </Card>
            ) : null}

            {data.unconverted_accounts.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 20 }}
                message={
                  data.unconverted_accounts.length === 1
                    ? 'One account is missing an exchange rate'
                    : 'Some accounts are missing an exchange rate'
                }
                description={`${data.unconverted_accounts.join(
                  ', ',
                )} could not be converted to CNY, so ${
                  data.unconverted_accounts.length === 1 ? 'it is' : 'they are'
                } excluded from the totals above. Refresh exchange rates or enter a manual rate in Settings.`}
                action={
                  <Button size="small" onClick={() => navigate('/settings')}>
                    Fix rates
                  </Button>
                }
              />
            ) : null}

            <div className="oi-reveal">
              <SummaryCards data={data} />
            </div>
            <div className="oi-reveal">
              <AssetBreakdown data={data} />
            </div>
            <div className="oi-reveal">
              <ActivityHeatmapCard />
            </div>

            <Row gutter={[20, 20]} className="oi-section-gap oi-reveal">
              <Col xs={24} xl={14}>
                <Card title="Income vs expenses" variant="borderless" className="oi-card-fill">
                  <CashFlowChart
                    data={data.cash_flow_series}
                    currency={data.base_currency}
                    height={300}
                    grow
                  />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <BudgetUsageCard data={data} />
              </Col>
            </Row>

            <Row gutter={[20, 20]} className="oi-section-gap oi-reveal">
              <Col xs={24} lg={12}>
                <CategorySplitCard
                  title="Expenses by category"
                  rows={data.expense_by_category}
                  currency={data.base_currency}
                  emptyText="No expenses recorded this month"
                />
              </Col>
              <Col xs={24} lg={12}>
                <CategorySplitCard
                  title="Income by category"
                  rows={data.income_by_category}
                  currency={data.base_currency}
                  emptyText="No income recorded this month"
                />
              </Col>
            </Row>

            <Row gutter={[20, 20]} className="oi-section-gap oi-reveal">
              <Col xs={24} xl={14}>
                <AccountsSummary data={data} />
              </Col>
              <Col xs={24} xl={10}>
                <GoalsSummaryCard data={data} />
              </Col>
            </Row>

            <Row gutter={[20, 20]} className="oi-section-gap oi-reveal">
              <Col xs={24} xl={hasUpcoming ? 14 : 24}>
                <RecentTransactions data={data} />
              </Col>
              {hasUpcoming ? (
                <Col xs={24} xl={10}>
                  <UpcomingCard />
                </Col>
              ) : null}
            </Row>
          </>
        ) : null}
      </StateBoundary>

      <TransactionFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
