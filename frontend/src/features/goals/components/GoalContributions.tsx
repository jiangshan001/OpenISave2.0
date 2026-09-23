import { Table, Tag, Tooltip } from 'antd';

import type { CurrencyCode, GoalContribution } from '@/types';
import { formatMoney, formatPercent } from '@/utils/money';

interface GoalContributionsProps {
  contributions: GoalContribution[];
  goalCurrency: CurrencyCode;
  total: number | null;
}

export function GoalContributions({
  contributions,
  goalCurrency,
  total,
}: GoalContributionsProps) {
  return (
    <Table<GoalContribution>
      rowKey="account_id"
      size="small"
      pagination={false}
      dataSource={contributions}
      locale={{ emptyText: <span className="oi-muted">No accounts linked</span> }}
      columns={[
        {
          title: 'Account',
          render: (_, row) => (
            <span>
              {row.account_name}{' '}
              {row.shared_with_goals > 1 ? (
                <Tooltip title={`Also used by ${row.shared_with_goals - 1} other goal(s). This is a label, not extra money.`}>
                  <Tag color="blue" bordered={false}>
                    shared
                  </Tag>
                </Tooltip>
              ) : null}
              {!row.is_eligible ? (
                <Tooltip title="This account is archived or excluded from net worth.">
                  <Tag color="orange" bordered={false}>
                    check
                  </Tag>
                </Tooltip>
              ) : null}
            </span>
          ),
        },
        {
          title: 'Native balance',
          align: 'right',
          width: 150,
          render: (_, row) => formatMoney(row.balance_minor, row.currency),
        },
        {
          title: `Counts as (${goalCurrency})`,
          align: 'right',
          width: 160,
          render: (_, row) =>
            row.converted_minor === null ? (
              <Tooltip title="No exchange rate available, so this account is left out of the total.">
                <span className="oi-warning">no rate</span>
              </Tooltip>
            ) : (
              formatMoney(row.converted_minor, goalCurrency)
            ),
        },
        {
          title: 'Share',
          align: 'right',
          width: 90,
          render: (_, row) =>
            total && total > 0 && row.converted_minor !== null
              ? formatPercent((row.converted_minor / total) * 100)
              : '—',
        },
      ]}
    />
  );
}
