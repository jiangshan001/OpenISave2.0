import { Card, Tag, Tooltip } from 'antd';

import { GROUP_COLORS } from '@/components/charts/chartTheme';
import type { AccountGroup } from '@/types';
import type { Dashboard } from '@/types/dashboard';
import { ACCOUNT_GROUP_LABELS } from '@/utils/labels';
import { formatMoney, formatPercent } from '@/utils/money';

const ASSET_GROUPS: AccountGroup[] = [
  'cash',
  'savings',
  'investments',
  'physical_assets',
  'other_assets',
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
    <div className="oi-figure">
      <Tooltip title={hint}>
        <div className="oi-stat-label">{label}</div>
      </Tooltip>
      <div className={`oi-money-lg ${className}`}>{formatMoney(amount, currency)}</div>
    </div>
  );
}

/**
 * Net worth composition. Only stores of wealth count; personal possessions
 * are shown beside it as a reference figure the backend keeps out of every
 * total. Group amounts come from the backend; the bar only visualises them.
 */
export function AssetBreakdown({ data }: { data: Dashboard }) {
  const base = data.base_currency;
  const segments = ASSET_GROUPS.map((group) => ({
    group,
    amount: Math.max(data.groups[group] ?? 0, 0),
  }));
  const barTotal = segments.reduce((sum, segment) => sum + segment.amount, 0);
  const liabilities = data.groups.liabilities ?? 0;

  return (
    <Card title="Net worth composition" variant="borderless" className="oi-section-gap">
      <div className="oi-figures">
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
        <Figure label="Net Worth" amount={data.net_worth_minor} currency={base} />
        <div className="oi-figure oi-figure--reference">
          <Tooltip title="Current value of things you use, such as electronics and vehicles. Tracked for reference; never part of net worth.">
            <div className="oi-stat-label">Personal Possessions</div>
          </Tooltip>
          <div className="oi-money-lg oi-muted">
            {formatMoney(data.personal_possessions_minor, base)}
          </div>
          <Tag bordered={false} className="oi-reference-tag">
            reference only · not in net worth
          </Tag>
        </div>
      </div>

      <div className="oi-alloc">
        <div className="oi-alloc-title">Where your net worth sits</div>
        <div className="oi-alloc-bar" role="img" aria-label="Share of net worth assets by group">
          {barTotal > 0
            ? segments
                .filter((segment) => segment.amount > 0)
                .map((segment) => (
                  <Tooltip
                    key={segment.group}
                    title={`${ACCOUNT_GROUP_LABELS[segment.group]} ${formatMoney(segment.amount, base)}`}
                  >
                    <span
                      className="oi-alloc-segment"
                      style={{
                        flexGrow: segment.amount,
                        background: GROUP_COLORS[segment.group],
                      }}
                    />
                  </Tooltip>
                ))
            : null}
        </div>
        <div className="oi-alloc-legend">
          {segments.map(({ group, amount }) => (
            <div key={group} className="oi-alloc-item">
              <span className="oi-swatch" style={{ background: GROUP_COLORS[group] }} />
              <span className="oi-alloc-label">{ACCOUNT_GROUP_LABELS[group]}</span>
              <span className="oi-alloc-value">{formatMoney(amount, base)}</span>
              <span className="oi-alloc-share">
                {barTotal > 0 ? formatPercent((amount / barTotal) * 100) : '-'}
              </span>
            </div>
          ))}
          <div className="oi-alloc-item">
            <span className="oi-swatch" style={{ background: GROUP_COLORS.liabilities }} />
            <span className="oi-alloc-label">{ACCOUNT_GROUP_LABELS.liabilities}</span>
            <span className={`oi-alloc-value ${liabilities ? 'oi-negative' : ''}`}>
              {formatMoney(-liabilities, base)}
            </span>
            <span className="oi-alloc-share" />
          </div>
        </div>
      </div>
    </Card>
  );
}
