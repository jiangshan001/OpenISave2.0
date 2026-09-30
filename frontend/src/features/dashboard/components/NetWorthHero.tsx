import { Tooltip } from 'antd';
import type { ReactNode } from 'react';

import { DARK_CHARTS } from '@/theme/chartPalette';
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

/** The hero is a dark surface in both themes, so it always uses the dark data colours. */
const GROUP_COLORS = DARK_CHARTS.groups;

function Figure({
  label,
  hint,
  children,
  note,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="oi-hero-figure">
      <Tooltip title={hint}>
        <div className="oi-hero-label">{label}</div>
      </Tooltip>
      <div className="oi-hero-figure-value">{children}</div>
      {note}
    </div>
  );
}

/**
 * The Overview's anchor: net worth, what it is made of, and personal
 * possessions kept beside it as a reference the backend never counts. Every
 * amount comes from the backend; the bar only visualises the group totals.
 */
export function NetWorthHero({ data }: { data: Dashboard }) {
  const base = data.base_currency;
  const segments = ASSET_GROUPS.map((group) => ({
    group,
    amount: Math.max(data.groups[group] ?? 0, 0),
  }));
  const barTotal = segments.reduce((sum, segment) => sum + segment.amount, 0);
  const liabilities = data.groups.liabilities ?? 0;

  return (
    <section className="oi-hero" aria-label="Net worth">
      <div className="oi-hero-main">
        <div className="oi-hero-label">Net worth</div>
        <div className="oi-hero-value">{formatMoney(data.net_worth_minor, base)}</div>
        <div className="oi-hero-figures">
          <Figure
            label="Net worth assets"
            hint="Accounts plus assets that store wealth (e.g. property)."
          >
            {formatMoney(data.net_worth_assets_minor, base)}
          </Figure>
          <Figure label="Liabilities">
            <span className={data.total_liabilities_minor ? 'oi-hero-negative' : undefined}>
              {formatMoney(-data.total_liabilities_minor, base)}
            </span>
          </Figure>
          <Figure
            label="Personal possessions"
            hint="Current value of things you use, such as electronics and vehicles. Tracked for reference; never part of net worth."
            note={<div className="oi-hero-note">reference only · not in net worth</div>}
          >
            <span className="oi-hero-dim">{formatMoney(data.personal_possessions_minor, base)}</span>
          </Figure>
        </div>
      </div>

      <div className="oi-hero-alloc">
        <div className="oi-hero-label">Where your net worth sits</div>
        <div className="oi-hero-bar" role="img" aria-label="Share of net worth assets by group">
          {barTotal > 0
            ? segments
                .filter((segment) => segment.amount > 0)
                .map((segment) => (
                  <Tooltip
                    key={segment.group}
                    title={`${ACCOUNT_GROUP_LABELS[segment.group]} ${formatMoney(segment.amount, base)}`}
                  >
                    <span
                      className="oi-hero-segment"
                      style={{ flexGrow: segment.amount, background: GROUP_COLORS[segment.group] }}
                    />
                  </Tooltip>
                ))
            : null}
        </div>
        <div className="oi-hero-legend">
          {segments.map(({ group, amount }) => (
            <div key={group} className="oi-hero-legend-item">
              <span className="oi-swatch" style={{ background: GROUP_COLORS[group] }} />
              <span className="oi-hero-legend-label">{ACCOUNT_GROUP_LABELS[group]}</span>
              <span className="oi-hero-legend-value">{formatMoney(amount, base)}</span>
              <span className="oi-hero-legend-share">
                {barTotal > 0 ? formatPercent((amount / barTotal) * 100) : '-'}
              </span>
            </div>
          ))}
          <div className="oi-hero-legend-item">
            <span className="oi-swatch" style={{ background: GROUP_COLORS.liabilities }} />
            <span className="oi-hero-legend-label">{ACCOUNT_GROUP_LABELS.liabilities}</span>
            <span className={`oi-hero-legend-value${liabilities ? ' oi-hero-negative' : ''}`}>
              {formatMoney(-liabilities, base)}
            </span>
            <span className="oi-hero-legend-share" />
          </div>
        </div>
      </div>
    </section>
  );
}
