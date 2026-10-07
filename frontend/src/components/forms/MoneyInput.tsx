import { InputNumber } from 'antd';

import type { CurrencyCode } from '@/types';
import { CURRENCY_META, symbolOf } from '@/utils/money';

interface MoneyInputOptions {
  currency: CurrencyCode;
  placeholder?: string;
  disabled?: boolean;
  allowNegative?: boolean;
  autoFocus?: boolean;
  id?: string;
  'aria-label'?: string;
}

type MoneyInputProps = MoneyInputOptions & (
  | { stringMode: true; value?: string | null; onChange?: (value: string | null) => void }
  | { stringMode?: false; value?: number | null; onChange?: (value: number | null) => void }
);

/**
 * Accepts a human amount such as 123.45 and keeps it in major units.
 * Forms convert to minor units on submit. Opt into stringMode for exact decimal
 * text; existing numeric consumers retain their current input behaviour.
 */
export function MoneyInput(props: MoneyInputProps) {
  const {
    value,
    currency,
    placeholder = '0.00',
    disabled,
    allowNegative = false,
    autoFocus,
    id,
    'aria-label': ariaLabel,
  } = props;
  const digits = CURRENCY_META[currency]?.digits ?? 2;
  return (
    <InputNumber
      id={id}
      aria-label={ariaLabel}
      value={value ?? undefined}
      onChange={(next) => {
        if (props.stringMode) props.onChange?.(next == null ? null : String(next));
        else props.onChange?.(next == null ? null : Number(next));
      }}
      prefix={symbolOf(currency)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      min={allowNegative ? undefined : 0}
      precision={digits}
      step={digits === 0 ? 1 : 0.01}
      className="oi-full"
      stringMode={props.stringMode ?? false}
    />
  );
}
