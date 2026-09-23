import { Card, Progress, Table, Tag } from 'antd';

import type { CurrencyCode } from '@/types';
import type {
  AccountMovement,
  CategoryBreakdown,
  DashboardBudgetLine,
  DashboardGoal,
} from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

export function CategoryTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: CategoryBreakdown[];
  currency: CurrencyCode;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount_minor, 0);
  return (
    <Card title={title} variant="borderless" styles={{ body: { padding: 0 } }}>
      <Table<CategoryBreakdown>
        rowKey={(row) => String(row.category_id ?? 'none')}
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <span className="oi-muted">Nothing recorded</span> }}
        columns={[
          {
            title: 'Category',
            render: (_, row) =>
              row.parent_name ? `${row.parent_name} · ${row.category_name}` : row.category_name,
          },
          {
            title: 'Amount',
            align: 'right',
            width: 130,
            render: (_, row) => formatMoney(row.amount_minor, currency),
          },
          {
            title: 'Share',
            align: 'right',
            width: 90,
            render: (_, row) =>
              total > 0 ? formatPercent((row.amount_minor / total) * 100) : '—',
          },
        ]}
      />
    </Card>
  );
}

export function AccountMovementTable({ rows }: { rows: AccountMovement[] }) {
  return (
    <Card
      title="Account movement"
      variant="borderless"
      extra={<span className="oi-muted">Shown in each account's own currency</span>}
      styles={{ body: { padding: 0 } }}
    >
      <Table<AccountMovement>
        rowKey="account_id"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <span className="oi-muted">No account activity</span> }}
        columns={[
          { title: 'Account', dataIndex: 'account_name' },
          {
            title: 'Currency',
            dataIndex: 'currency',
            width: 90,
            render: (value: string) => <Tag bordered={false}>{value}</Tag>,
          },
          {
            title: 'Opening',
            align: 'right',
            width: 130,
            render: (_, row) => formatMoney(row.opening_balance_minor, row.currency),
          },
          {
            title: 'In',
            align: 'right',
            width: 120,
            render: (_, row) => (
              <span className="oi-positive">{formatMoney(row.deposits_minor, row.currency)}</span>
            ),
          },
          {
            title: 'Out',
            align: 'right',
            width: 120,
            render: (_, row) => (
              <span className="oi-negative">{formatMoney(row.withdrawals_minor, row.currency)}</span>
            ),
          },
          {
            title: 'Closing',
            align: 'right',
            width: 140,
            render: (_, row) => (
              <span className="oi-strong">
                {formatMoney(row.closing_balance_minor, row.currency)}
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

export function BudgetVarianceTable({
  rows,
  currency,
}: {
  rows: DashboardBudgetLine[];
  currency: CurrencyCode;
}) {
  return (
    <Card title="Budget vs actual" variant="borderless" styles={{ body: { padding: 0 } }}>
      <Table<DashboardBudgetLine>
        rowKey="category_id"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <span className="oi-muted">No budget set for this month</span> }}
        columns={[
          { title: 'Category', dataIndex: 'category_name' },
          {
            title: 'Budget',
            align: 'right',
            width: 120,
            render: (_, row) => formatMoney(row.budget_minor, currency),
          },
          {
            title: 'Actual',
            align: 'right',
            width: 120,
            render: (_, row) => formatMoney(row.actual_minor, currency),
          },
          {
            title: 'Variance',
            align: 'right',
            width: 130,
            render: (_, row) => (
              <span className={row.remaining_minor < 0 ? 'oi-negative' : 'oi-positive'}>
                {formatMoney(row.remaining_minor, currency)}
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

export function GoalProgressTable({ rows }: { rows: DashboardGoal[] }) {
  return (
    <Card title="Goal progress" variant="borderless" styles={{ body: { padding: 0 } }}>
      <Table<DashboardGoal>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <span className="oi-muted">No savings goals</span> }}
        columns={[
          { title: 'Goal', dataIndex: 'name' },
          {
            title: 'Current',
            align: 'right',
            width: 130,
            render: (_, row) => formatMoney(row.current_amount_minor, row.currency),
          },
          {
            title: 'Target',
            align: 'right',
            width: 130,
            render: (_, row) =>
              row.target_amount_minor
                ? formatMoney(row.target_amount_minor, row.currency)
                : <span className="oi-muted">No target</span>,
          },
          {
            title: 'Progress',
            width: 180,
            render: (_, row) =>
              row.target_amount_minor ? (
                <Progress
                  percent={Math.min(row.progress_percent ?? 0, 100)}
                  size="small"
                  format={() => formatPercent(row.progress_percent)}
                />
              ) : (
                <span className="oi-muted">Accumulating</span>
              ),
          },
        ]}
      />
    </Card>
  );
}
