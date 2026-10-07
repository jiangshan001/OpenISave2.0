import type { CurrencyCode } from '@/types';
import { CURRENCY_META } from '@/utils/money';

/** Exact input conversion: concatenate decimal digits, never multiply a float. */
export function budgetInputMinor(value: string | null, currency: CurrencyCode): number | null {
  if (!value || !/^\d+(\.\d*)?$/.test(value)) return null;
  const digits = CURRENCY_META[currency].digits;
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > digits) return null;
  const minor = Number(whole + fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function budgetInputValue(minor: number, currency: CurrencyCode): string {
  const digits = CURRENCY_META[currency].digits;
  const text = String(minor).padStart(digits + 1, '0');
  return digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text;
}
