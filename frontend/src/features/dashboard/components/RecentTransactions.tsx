import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DollarOutlined,
  EditOutlined,
  ShoppingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Card } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { MoneyText } from '@/components/common/MoneyText';
import type { TransactionType } from '@/types';
import type { Dashboard } from '@/types/dashboard';
import { formatDate } from '@/utils/dates';
import { TRANSACTION_TYPE_LABELS } from '@/utils/labels';

const TYPE_GLYPH: Record<TransactionType, { icon: ReactNode; tone: string }> = {
  income: { icon: <ArrowDownOutlined />, tone: 'oi-stat-icon--positive' },
  expense: { icon: <ArrowUpOutlined />, tone: '' },
  transfer: { icon: <SwapOutlined />, tone: 'oi-stat-icon--primary' },
  adjustment: { icon: <EditOutlined />, tone: '' },
  asset_purchase: { icon: <ShoppingOutlined />, tone: '' },
  asset_sale: { icon: <DollarOutlined />, tone: '' },
};

export function RecentTransactions({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  const rows = data.recent_transactions;
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
      {rows.length === 0 ? (
        <EmptyState title="Nothing recorded yet" text="New income, expenses and transfers show up here." />
      ) : (
        <div className="oi-row-list">
          {rows.map((row) => {
            const glyph = TYPE_GLYPH[row.type];
            return (
              <div key={row.id} className="oi-row">
                <span className={`oi-row-icon ${glyph.tone}`} aria-hidden>
                  {glyph.icon}
                </span>
                <div className="oi-row-main">
                  <div className="oi-row-title">
                    {row.description || TRANSACTION_TYPE_LABELS[row.type]}
                  </div>
                  <div className="oi-row-meta">
                    {formatDate(row.transaction_date)} · {TRANSACTION_TYPE_LABELS[row.type]}
                  </div>
                </div>
                <MoneyText
                  amountMinor={row.type === 'income' ? row.amount_minor : -row.amount_minor}
                  currency={row.currency}
                  baseAmountMinor={row.base_amount_minor}
                  baseCurrency={data.base_currency}
                  tone={row.type === 'income' ? 'positive' : 'neutral'}
                  signed={row.type !== 'transfer'}
                  strong
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
