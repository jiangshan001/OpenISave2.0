import { Card, Col, Empty, Row } from 'antd';
import { useState } from 'react';

import { CashFlowChart } from '@/components/charts/CashFlowChart';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useMonthlyReport } from '@/hooks/useResources';
import { currentPeriod, monthLabel } from '@/utils/dates';
import { PeriodPicker } from '../budgets/components/PeriodPicker';
import { ReportSummary } from './components/ReportSummary';
import {
  AccountMovementTable,
  BudgetVarianceTable,
  CategoryTable,
  GoalProgressTable,
} from './components/ReportTables';

export function ReportsPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const { data, isLoading, error, refetch } = useMonthlyReport(period.year, period.month);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${monthLabel(
          period.year,
          period.month,
        )} · income and expenses use the exchange rate saved with each transaction`}
        actions={<PeriodPicker year={period.year} month={period.month} onChange={setPeriod} />}
      />

      <StateBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        skeletonRows={8}
      >
        {data ? (
          <>
            <ReportSummary report={data} />

            <Row gutter={[16, 16]} className="oi-section-gap">
              <Col xs={24} xl={14}>
                <Card title="Cash flow, last 12 months" variant="borderless">
                  <CashFlowChart
                    data={data.cash_flow_series}
                    currency={data.base_currency}
                    height={300}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <Card title="Expense mix" variant="borderless">
                  {data.expense_by_category.length > 0 ? (
                    <CategoryPieChart
                      data={data.expense_by_category}
                      currency={data.base_currency}
                      height={300}
                    />
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span className="oi-muted">No expenses this month</span>}
                    />
                  )}
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} className="oi-section-gap">
              <Col xs={24} xl={12}>
                <CategoryTable
                  title="Expenses by category"
                  rows={data.expense_by_category}
                  currency={data.base_currency}
                />
              </Col>
              <Col xs={24} xl={12}>
                <CategoryTable
                  title="Income by category"
                  rows={data.income_by_category}
                  currency={data.base_currency}
                />
              </Col>
            </Row>

            <div className="oi-section-gap">
              <AccountMovementTable rows={data.account_movement} />
            </div>

            <Row gutter={[16, 16]} className="oi-section-gap">
              <Col xs={24} xl={12}>
                <BudgetVarianceTable rows={data.budget.lines} currency={data.base_currency} />
              </Col>
              <Col xs={24} xl={12}>
                <GoalProgressTable rows={data.goals} />
              </Col>
            </Row>
          </>
        ) : null}
      </StateBoundary>
    </>
  );
}
