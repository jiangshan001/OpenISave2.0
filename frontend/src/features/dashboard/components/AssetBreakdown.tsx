import { Card, Col, Row } from 'antd';

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

export function AssetBreakdown({ data }: { data: Dashboard }) {
  return (
    <Card title="Where your money sits" variant="borderless" className="oi-section-gap">
      <Row gutter={[16, 16]}>
        {GROUPS.map((group) => {
          const amount = data.groups[group] ?? 0;
          const isLiability = group === 'liabilities';
          return (
            <Col key={group} flex="1 1 160px">
              <div className="oi-stat-label">{ACCOUNT_GROUP_LABELS[group]}</div>
              <div className={`oi-money-lg ${isLiability && amount !== 0 ? 'oi-negative' : ''}`}>
                {formatMoney(isLiability ? -amount : amount, data.base_currency)}
              </div>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}
