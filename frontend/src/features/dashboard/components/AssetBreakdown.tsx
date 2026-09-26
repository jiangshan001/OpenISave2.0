import { Card, Col, Divider, Row, Tag, Tooltip } from 'antd';

import type { AccountGroup } from '@/types';
import type { Dashboard } from '@/types/dashboard';
import { ACCOUNT_GROUP_LABELS } from '@/utils/labels';
import { formatMoney } from '@/utils/money';

const GROUPS: AccountGroup[] = [
  'cash',
  'savings',
  'investments',
  'physical_assets',
  'other_assets',
  'liabilities',
];

function Figure({
  label,
  amount,
  currency,
  className = '',
  hint,
}: {
  label: string;
  amount: number;
  currency: Dashboard['base_currency'];
  className?: string;
  hint?: string;
}) {
  return (
    <Col flex="1 1 180px">
      <Tooltip title={hint}>
        <div className="oi-stat-label">{label}</div>
      </Tooltip>
      <div className={`oi-money-lg ${className}`}>{formatMoney(amount, currency)}</div>
    </Col>
  );
}

/**
 * Net worth composition. Only stores of wealth count; personal possessions
 * are shown beside it as a reference figure the backend keeps out of every
 * total.
 */
export function AssetBreakdown({ data }: { data: Dashboard }) {
  const base = data.base_currency;
  return (
    <Card title="Net worth" variant="borderless" className="oi-section-gap">
      <Row gutter={[16, 16]}>
        <Figure
          label="Net Worth Assets"
          amount={data.net_worth_assets_minor}
          currency={base}
          hint="Accounts plus assets that store wealth (e.g. property)."
        />
        <Figure
          label="Liabilities"
          amount={-data.total_liabilities_minor}
          currency={base}
          className={data.total_liabilities_minor ? 'oi-negative' : ''}
        />
        <Figure label="Net Worth" amount={data.net_worth_minor} currency={base} className="oi-strong" />
        <Col flex="1 1 200px" className="oi-muted">
          <Tooltip title="Current value of things you use, such as electronics and vehicles. Tracked for reference; never part of net worth.">
            <div className="oi-stat-label">Personal Possessions</div>
          </Tooltip>
          <div className="oi-money-lg oi-muted">
            {formatMoney(data.personal_possessions_minor, base)}
          </div>
          <Tag bordered={false} style={{ marginTop: 4 }}>
            reference only · not in net worth
          </Tag>
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} plain orientation="left">
        <span className="oi-muted">Where your net worth sits</span>
      </Divider>
      <Row gutter={[16, 16]}>
        {GROUPS.map((group) => {
          const amount = data.groups[group] ?? 0;
          const isLiability = group === 'liabilities';
          return (
            <Col key={group} flex="1 1 160px">
              <div className="oi-stat-label">{ACCOUNT_GROUP_LABELS[group]}</div>
              <div className={`oi-money-lg ${isLiability && amount !== 0 ? 'oi-negative' : ''}`}>
                {formatMoney(isLiability ? -amount : amount, base)}
              </div>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}
