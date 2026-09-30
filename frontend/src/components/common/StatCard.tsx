import { QuestionCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

import type { CurrencyCode } from '@/types';
import { formatMoney } from '@/utils/money';

export type StatTone = 'neutral' | 'positive' | 'negative' | 'primary';

interface StatCardProps {
  label: string;
  amountMinor?: number | null;
  currency?: CurrencyCode;
  value?: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'auto';
  footer?: ReactNode;
  /** Optional small glyph before the label; the tone colours only the glyph. */
  icon?: ReactNode;
  iconTone?: StatTone;
}

function resolveTone(tone: StatCardProps['tone'], amountMinor?: number | null): string {
  if (tone === 'positive') return 'oi-positive';
  if (tone === 'negative') return 'oi-negative';
  if (tone === 'auto' && typeof amountMinor === 'number') {
    if (amountMinor > 0) return 'oi-positive';
    if (amountMinor < 0) return 'oi-negative';
  }
  return '';
}

/**
 * Several headline figures on one surface, split by hairlines rather than
 * boxed separately. Collapses to two columns, then one.
 */
export function StatStrip({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <div className="oi-strip" style={{ '--oi-strip-cols': columns } as CSSProperties}>
      {children}
    </div>
  );
}

/** One figure inside a StatStrip. */
export function StatCard({
  label,
  amountMinor,
  currency = 'CNY',
  value,
  hint,
  tone = 'neutral',
  footer,
  icon,
  iconTone = 'neutral',
}: StatCardProps) {
  const body = value ?? formatMoney(amountMinor ?? 0, currency, { signed: tone === 'auto' });

  return (
    <div className="oi-strip-item">
      <div className="oi-stat-label">
        {icon ? (
          <span className={`oi-stat-glyph oi-stat-glyph--${iconTone}`} aria-hidden>
            {icon}
          </span>
        ) : null}
        {label}
        {hint ? (
          <Tooltip title={hint}>
            <span className="oi-stat-hint" aria-label="More information" tabIndex={0}>
              <QuestionCircleOutlined />
            </span>
          </Tooltip>
        ) : null}
      </div>
      <div className={`oi-stat-value ${resolveTone(tone, amountMinor)}`}>{body}</div>
      {footer ? <div className="oi-stat-footer">{footer}</div> : null}
    </div>
  );
}
