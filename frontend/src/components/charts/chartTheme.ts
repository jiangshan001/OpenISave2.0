/**
 * Chart behaviour shared by the Recharts components. Colours are
 * theme-dependent and come from `useChartPalette()` (src/theme).
 */

/** Chart entrance animations are skipped when the OS asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
