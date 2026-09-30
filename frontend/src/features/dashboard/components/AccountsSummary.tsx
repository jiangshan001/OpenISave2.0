import { Button, Card, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';

import { MoneyText } from '@/components/common/MoneyText';
import type { Dashboard, DashboardAccount } from '@/types/dashboard';
import { ACCOUNT_TYPE_LABELS } from '@/utils/labels';

export function AccountsSummary({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  const rows = data.accounts.filter((account) => account.include_in_net_worth);

  return (
    <Card
      title="Accounts"
      variant="borderless"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/accounts')}>
          Manage
        </Button>
      }
      className="oi-card-fill"
      styles={{ body: { padding: '0 10px 10px' } }}
    >
      <Table<DashboardAccount>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        onRow={(row) => ({
          onClick: () => navigate(`/accounts/${row.id}`),
          className: 'oi-clickable',
        })}
        columns={[
          {
            title: 'Account',
            dataIndex: 'name',
            render: (value: string, row) => (
              <div>
                <div className="oi-strong">{value}</div>
                <div className="oi-muted" style={{ fontSize: 12 }}>
                  {row.institution ?? ACCOUNT_TYPE_LABELS[row.account_type]}
                </div>
              </div>
            ),
          },
          {
            title: 'Currency',
            dataIndex: 'currency',
            width: 90,
            render: (value: string) => <Tag bordered={false}>{value}</Tag>,
          },
          {
            title: 'Balance',
            align: 'right',
            width: 180,
            render: (_, row) => (
              <MoneyText
                amountMinor={row.balance_minor}
                currency={row.currency}
                baseAmountMinor={row.base_balance_minor}
                baseCurrency={data.base_currency}
                tone={row.group === 'liabilities' ? 'negative' : 'neutral'}
              />
            ),
          },
        ]}
        locale={{ emptyText: <span className="oi-muted">No accounts yet</span> }}
      />
    </Card>
  );
}
