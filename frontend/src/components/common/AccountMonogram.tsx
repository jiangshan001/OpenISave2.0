import type { AccountTheme } from '@/theme/accountTheme';

interface AccountMonogramProps {
  theme: AccountTheme;
  size?: 'md' | 'sm';
}

/**
 * The account's typographic identity well. Decorative: the institution and
 * account name are always written next to it, so it is hidden from screen
 * readers and never the only cue.
 */
export function AccountMonogram({ theme, size = 'md' }: AccountMonogramProps) {
  return (
    <span
      className={`oi-acct-mark${size === 'sm' ? ' oi-acct-mark--sm' : ''}`}
      data-acct={theme.id}
      data-len={Math.min(theme.monogram.length, 4)}
      aria-hidden="true"
    >
      {theme.monogram}
    </span>
  );
}
