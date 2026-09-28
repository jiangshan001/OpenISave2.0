import type { AccountGroup } from '@/types';

/**
 * Chart colours. SVG presentation attributes do not resolve CSS variables
 * reliably, so the calibrated values from styles/tokens.css are mirrored here.
 */
export const CHART = {
  income: '#3a9b72',
  expense: '#e07a5f',
  net: '#161c2c',
  grid: '#eef0f3',
  axis: '#98a0ad',
  cursor: 'rgba(22, 28, 44, 0.04)',
} as const;

/** Net worth composition: one hue per group, liabilities in the negative tone. */
export const GROUP_COLORS: Record<AccountGroup, string> = {
  cash: '#2f5bd3',
  savings: '#6b8fe8',
  investments: '#3a9b72',
  physical_assets: '#d9a441',
  other_assets: '#a8b1c0',
  liabilities: '#c2412d',
};

/** Chart entrance animations are skipped when the OS asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
