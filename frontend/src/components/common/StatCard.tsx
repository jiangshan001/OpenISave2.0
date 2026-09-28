import { QuestionCircleOutlined } from '@ant-design/icons';
import { Card, Tooltip } from 'antd';
import type { ReactNode } from 'react';

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
  accent?: boolean;
  /** Optional glyph shown top-right in a tinted square. */
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

export function StatCard({
  label,
  amountMinor,
  currency = 'CNY',
  value,
  hint,
  tone = 'neutral',
  footer,
  accent = false,
  icon,
  iconTone = 'neutral',
}: StatCardProps) {
  const body =
    value ?? formatMoney(amountMinor ?? 0, currency, { signed: tone === 'auto' });

  return (
    <Card className={`oi-stat-card${accent ? ' oi-stat-card--accent' : ''}`} variant="borderless">
      <div className="oi-stat-head">
        <div className="oi-stat-label">
          {label}
          {hint ? (
            <Tooltip title={hint}>
              <span className="oi-stat-hint" aria-label="More information">
                <QuestionCircleOutlined />
              </span>
            </Tooltip>
          ) : null}
        </div>
        {icon ? <span className={`oi-stat-icon oi-stat-icon--${iconTone}`}>{icon}</span> : null}
      </div>
      <div className={`oi-stat-value ${accent ? '' : resolveTone(tone, amountMinor)}`}>{body}</div>
      {footer ? <div className="oi-stat-footer">{footer}</div> : null}
    </Card>
  );
}
