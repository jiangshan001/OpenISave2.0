import type { CurrencyCode } from '@/types';

/**
 * Currency metadata mirroring the backend's `app/core/money.py`.
 * The API also serves this at /currencies; this copy exists so formatting is
 * synchronous. Both must stay in step.
 */
export const CURRENCY_META: Record<CurrencyCode, { symbol: string; digits: number; name: string }> =
  {
    CNY: { symbol: '¥', digits: 2, name: 'Chinese Yuan' },
    GBP: { symbol: '£', digits: 2, name: 'British Pound' },
    USD: { symbol: '$', digits: 2, name: 'US Dollar' },
    EUR: { symbol: '€', digits: 2, name: 'Euro' },
    JPY: { symbol: '¥', digits: 0, name: 'Japanese Yen' },
    CAD: { symbol: 'C$', digits: 2, name: 'Canadian Dollar' },
    AUD: { symbol: 'A$', digits: 2, name: 'Australian Dollar' },
  };

export const BASE_CURRENCY: CurrencyCode = 'CNY';

export const CURRENCY_CODES = Object.keys(CURRENCY_META) as CurrencyCode[];

function digitsOf(currency: CurrencyCode): number {
  return CURRENCY_META[currency]?.digits ?? 2;
}

export function symbolOf(currency: CurrencyCode): string {
  return CURRENCY_META[currency]?.symbol ?? currency;
}

/**
 * Convert a user-entered major amount into integer minor units.
 * Rounds half away from zero, matching the backend's ROUND_HALF_UP.
 */
export function toMinor(amount: number | string, currency: CurrencyCode): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** digitsOf(currency);
  const scaled = value * scale;
  // Work around binary rounding on values such as 2.675 * 100 = 267.49999...
  const corrected = Number(scaled.toFixed(6));
  return corrected < 0 ? -Math.round(-corrected) : Math.round(corrected);
}

/** Convert integer minor units back to a major-unit number for display/inputs. */
export function toMajor(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** digitsOf(currency);
}

export function formatMoney(
  amountMinor: number | null | undefined,
  currency: CurrencyCode,
  options: { showSymbol?: boolean; signed?: boolean } = {},
): string {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const { showSymbol = true, signed = false } = options;
  const digits = digitsOf(currency);
  const value = toMajor(amountMinor, currency);
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const symbol = showSymbol ? symbolOf(currency) : '';
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  return `${sign}${symbol}${formatted}`;
}

/** Compact form for chart axes and tight cards, e.g. ¥98.9k. */
export function formatCompact(amountMinor: number, currency: CurrencyCode): string {
  const value = toMajor(amountMinor, currency);
  const symbol = symbolOf(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}%`;
}
