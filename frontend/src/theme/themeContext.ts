import { createContext, useContext } from 'react';

import type { AppearancePreference, ResolvedTheme } from './appearance';
import { chartPaletteFor, type ChartPalette } from './chartPalette';

export interface AppearanceState {
  /** What the user chose: follow Windows, or a fixed theme. */
  preference: AppearancePreference;
  /** What is on screen right now. */
  resolved: ResolvedTheme;
  setPreference: (preference: AppearancePreference) => void;
}

/**
 * Outside a provider (isolated component tests) the app behaves as light
 * with a no-op setter, which is exactly how it rendered before 2.3.
 */
export const AppearanceContext = createContext<AppearanceState>({
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
});

export function useAppearance(): AppearanceState {
  return useContext(AppearanceContext);
}

export function useChartPalette(): ChartPalette {
  return chartPaletteFor(useAppearance().resolved);
}
