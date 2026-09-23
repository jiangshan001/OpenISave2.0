import { Tooltip } from 'antd';

import type { CurrencyCode } from '@/types';
import { formatMoney } from '@/utils/money';

interface MoneyTextProps {
  amountMinor: number | null | undefined;
  currency: CurrencyCode;
  /** Consolidated value shown as a secondary line, e.g. "≈ ¥19,107.00". */
  baseAmountMinor?: number | null;
  baseCurrency?: CurrencyCode;
  signed?: boolean;
  strong?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'auto' | 'neutral' | 'positive' | 'negative';
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'oi-money-sm',
  md: 'oi-money-md',
  lg: 'oi-money-lg',
  xl: 'oi-money-xl',
};

function toneClass(tone: MoneyTextProps['tone'], amountMinor: number | null | undefined): string {
  if (tone === 'positive') return 'oi-positive';
  if (tone === 'negative') return 'oi-negative';
  if (tone === 'auto' && typeof amountMinor === 'number') {
    if (amountMinor > 0) return 'oi-positive';
    if (amountMinor < 0) return 'oi-negative';
  }
  return '';
}

export function MoneyText({
  amountMinor,
  currency,
  baseAmountMinor,
  baseCurrency = 'CNY',
  signed = false,
  strong = false,
  size = 'md',
  tone = 'neutral',
}: MoneyTextProps) {
  const showBase =
    baseAmountMinor !== undefined && baseAmountMinor !== null && currency !== baseCurrency;

  return (
    <span className="oi-money">
      <span
        className={[SIZE_CLASS[size], toneClass(tone, amountMinor), strong ? 'oi-strong' : '']
          .filter(Boolean)
          .join(' ')}
      >
        {formatMoney(amountMinor, currency, { signed })}
      </span>
      {showBase ? (
        <Tooltip title={`Consolidated value in ${baseCurrency}`}>
          <span className="oi-money-base">≈ {formatMoney(baseAmountMinor, baseCurrency)}</span>
        </Tooltip>
      ) : null}
      {baseAmountMinor === null && currency !== baseCurrency ? (
        <Tooltip title="No exchange rate available for this currency">
          <span className="oi-money-base oi-warning">no {baseCurrency} rate</span>
        </Tooltip>
      ) : null}
    </span>
  );
}
