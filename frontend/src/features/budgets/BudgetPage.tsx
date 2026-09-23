import { EditOutlined } from '@ant-design/icons';
import { Button, Card, Col, Progress, Row, Space, Table, Tag } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useBudget, useCategories } from '@/hooks/useResources';
import type { BudgetLine } from '@/types';
import { currentPeriod, monthLabel } from '@/utils/dates';
import { formatMoney, formatPercent } from '@/utils/money';
import { BudgetEditor } from './components/BudgetEditor';
import { PeriodPicker } from './components/PeriodPicker';

export function BudgetPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [editorOpen, setEditorOpen] = useState(false);

  const { data, isLoading, error, refetch } = useBudget(period.year, period.month);
  const { data: categories } = useCategories('expense');

  const currency = data?.currency ?? 'CNY';
  const overallPercent =
    data && data.total_budget_minor > 0
      ? (data.total_actual_minor / data.total_budget_minor) * 100
      : null;

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle={`${monthLabel(period.year, period.month)} · actuals come straight from your ledger`}
        actions={
          <Space>
            <PeriodPicker year={period.year} month={period.month} onChange={setPeriod} />
            <Button
              type="primary"
              icon={<EditOutlined />}
              disabled={!data}
              onClick={() => setEditorOpen(true)}
            >
              Edit budget
            </Button>
          </Space>
        }
      />

      <StateBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={data !== undefined && data.lines.length === 0}
        emptyTitle={`No budget set for ${monthLabel(period.year, period.month)}`}
        emptyDescription="Set a monthly limit for the categories you want to keep an eye on."
        emptyAction={
          <Button type="primary" onClick={() => setEditorOpen(true)}>
            Create a budget
          </Button>
        }
      >
        {data ? (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <StatCard label="Budgeted" amountMinor={data.total_budget_minor} currency={currency} />
              </Col>
              <Col xs={24} sm={8}>
                <StatCard
                  label="Spent"
                  amountMinor={data.total_actual_minor}
                  currency={currency}
                  footer={
                    overallPercent === null
                      ? undefined
                      : `${formatPercent(overallPercent)} of budget used`
                  }
                />
              </Col>
              <Col xs={24} sm={8}>
                <StatCard
                  label="Remaining"
                  amountMinor={data.total_remaining_minor}
                  currency={currency}
                  tone={data.total_remaining_minor < 0 ? 'negative' : 'positive'}
                />
              </Col>
            </Row>

            <Card title="By category" variant="borderless" className="oi-section-gap">
              <Table<BudgetLine>
                rowKey="category_id"
                pagination={false}
                dataSource={data.lines}
                columns={[
                  {
                    title: 'Category',
                    render: (_, row) => (
                      <Space direction="vertical" size={0}>
                        <span className="oi-strong">{row.category_name}</span>
                        {row.parent_name ? (
                          <span className="oi-muted" style={{ fontSize: 12 }}>
                            in {row.parent_name}
                          </span>
                        ) : null}
                      </Space>
                    ),
                  },
                  {
                    title: 'Budget',
                    align: 'right',
                    width: 130,
                    render: (_, row) => formatMoney(row.budget_minor, currency),
                  },
                  {
                    title: 'Actual',
                    align: 'right',
                    width: 130,
                    render: (_, row) => formatMoney(row.actual_minor, currency),
                  },
                  {
                    title: 'Remaining',
                    align: 'right',
                    width: 130,
                    render: (_, row) => (
                      <span className={row.remaining_minor < 0 ? 'oi-negative' : ''}>
                        {formatMoney(row.remaining_minor, currency)}
                      </span>
                    ),
                  },
                  {
                    title: 'Used',
                    width: 220,
                    render: (_, row) => {
                      const percent = row.used_percent ?? 0;
                      return (
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Progress
                            percent={Math.min(percent, 100)}
                            size="small"
                            status={percent > 100 ? 'exception' : 'normal'}
                            showInfo={false}
                          />
                          <span className={percent > 100 ? 'oi-negative' : 'oi-muted'}>
                            {formatPercent(row.used_percent)}
                            {percent > 100 ? <Tag color="red">Over</Tag> : null}
                          </span>
                        </Space>
                      );
                    },
                  },
                ]}
              />
            </Card>

          </>
        ) : null}
      </StateBoundary>

      {data ? (
        <BudgetEditor
          open={editorOpen}
          period={data}
          categories={categories ?? []}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </>
  );
}
