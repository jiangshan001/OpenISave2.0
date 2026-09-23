import { InputNumber } from 'antd';

import type { CurrencyCode } from '@/types';
import { CURRENCY_META, symbolOf } from '@/utils/money';

interface MoneyInputProps {
  /** Major-unit value; the form converts to minor units on submit. */
  value?: number | null;
  onChange?: (value: number | null) => void;
  currency: CurrencyCode;
  placeholder?: string;
  disabled?: boolean;
  allowNegative?: boolean;
  autoFocus?: boolean;
}

/**
 * Accepts a human amount such as 123.45 and keeps it in major units.
 * Conversion to integer minor units happens once, in `toMinor`, at submit time.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  placeholder = '0.00',
  disabled,
  allowNegative = false,
  autoFocus,
}: MoneyInputProps) {
  const digits = CURRENCY_META[currency]?.digits ?? 2;
  return (
    <InputNumber
      value={value ?? undefined}
      onChange={(next) => onChange?.(next === undefined ? null : (next as number | null))}
      prefix={symbolOf(currency)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      min={allowNegative ? undefined : 0}
      precision={digits}
      step={digits === 0 ? 1 : 0.01}
      style={{ width: '100%' }}
      stringMode={false}
    />
  );
}
