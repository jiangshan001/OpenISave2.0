import { ArrowDownOutlined, ArrowUpOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Space } from 'antd';

import { MoneyText } from '@/components/common/MoneyText';
import { useOccurrenceAction } from '@/hooks/useRecurring';
import type { UpcomingItem } from '@/types/recurring';
import { formatDate } from '@/utils/dates';
import { dueLabel } from '../recurringFormat';

const GLYPH = {
  income: { icon: <ArrowDownOutlined />, tone: 'oi-stat-icon--positive' },
  expense: { icon: <ArrowUpOutlined />, tone: '' },
  transfer: { icon: <SwapOutlined />, tone: 'oi-stat-icon--primary' },
};

interface UpcomingListProps {
  items: UpcomingItem[];
  /** Show Create / Skip on due review-first items. */
  actions?: boolean;
  compact?: boolean;
}

export function UpcomingList({ items, actions = true, compact = false }: UpcomingListProps) {
  const occurrence = useOccurrenceAction();
  const busyKey = occurrence.isPending
    ? `${occurrence.variables?.ruleId}-${occurrence.variables?.date}`
    : null;

  return (
    <div className="oi-row-list">
      {items.map((item) => {
        const key = `${item.rule_id}-${item.occurrence_date}`;
        const glyph = GLYPH[item.transaction_type];
        const showActions = actions && item.is_due;
        return (
          <div key={key} className="oi-row">
            {compact ? null : (
              <span className={`oi-row-icon ${glyph.tone}`} aria-hidden>
                {glyph.icon}
              </span>
            )}
            <div className="oi-row-main">
              <div className="oi-row-title">{item.name}</div>
              <div className="oi-row-meta">
                <span className={item.is_due ? 'oi-warning' : undefined}>
                  {dueLabel(item.days_until)}
                </span>
                {' · '}
                {formatDate(item.occurrence_date)}
                {item.mode === 'automatic' ? ' · automatic' : ''}
              </div>
            </div>
            <MoneyText
              amountMinor={item.transaction_type === 'expense' ? -item.amount_minor : item.amount_minor}
              currency={item.currency}
              tone={item.transaction_type === 'income' ? 'positive' : 'neutral'}
              signed={item.transaction_type !== 'transfer'}
              strong
            />
            {showActions ? (
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  loading={busyKey === key && occurrence.variables?.action === 'generate'}
                  onClick={() =>
                    occurrence.mutate({
                      ruleId: item.rule_id,
                      date: item.occurrence_date,
                      action: 'generate',
                    })
                  }
                >
                  Create
                </Button>
                {compact ? null : (
                  <Button
                    size="small"
                    loading={busyKey === key && occurrence.variables?.action === 'skip'}
                    onClick={() =>
                      occurrence.mutate({
                        ruleId: item.rule_id,
                        date: item.occurrence_date,
                        action: 'skip',
                      })
                    }
                  >
                    Skip
                  </Button>
                )}
              </Space>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
