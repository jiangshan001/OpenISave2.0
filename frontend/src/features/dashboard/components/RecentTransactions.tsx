import { Button, Card, List, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';

import { MoneyText } from '@/components/common/MoneyText';
import type { Dashboard } from '@/types/dashboard';
import { formatDate } from '@/utils/dates';
import { TRANSACTION_TYPE_COLORS, TRANSACTION_TYPE_LABELS } from '@/utils/labels';

export function RecentTransactions({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  return (
    <Card
      title="Recent transactions"
      variant="borderless"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/transactions')}>
          View all
        </Button>
      }
    >
      <List
        dataSource={data.recent_transactions}
        locale={{ emptyText: <span className="oi-muted">Nothing recorded yet</span> }}
        renderItem={(row) => (
          <List.Item>
            <List.Item.Meta
              title={
                <span>
                  {row.description || TRANSACTION_TYPE_LABELS[row.type]}{' '}
                  <Tag color={TRANSACTION_TYPE_COLORS[row.type]} bordered={false}>
                    {TRANSACTION_TYPE_LABELS[row.type]}
                  </Tag>
                </span>
              }
              description={<span className="oi-muted">{formatDate(row.transaction_date)}</span>}
            />
            <MoneyText
              amountMinor={row.type === 'income' ? row.amount_minor : -row.amount_minor}
              currency={row.currency}
              baseAmountMinor={row.base_amount_minor}
              baseCurrency={data.base_currency}
              tone={row.type === 'transfer' ? 'neutral' : 'auto'}
              signed={row.type !== 'transfer'}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
