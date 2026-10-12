import type { ResolvedTheme } from './appearance';

/**
 * Interface colours per theme, for the places that need them in JavaScript
 * (Ant Design tokens). `styles/tokens.css` defines the same values as CSS
 * variables; change both together.
 *
 * Light: warm ivory surfaces and a sunset-cloud rose accent. Dark: blue-black canvas with
 * raised slate surfaces, never pure black, and the accent lifted slightly so
 * it keeps its presence without glowing.
 */
export interface UiPalette {
  bg: string;
  surface: string;
  raised: string;
  sunken: string;
  sidebar: string;
  border: string;
  borderSoft: string;
  borderStrong: string;
  text: string;
  text2: string;
  muted: string;
  subtle: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  accentText: string;
  primarySoft: string;
  positive: string;
  negative: string;
  warning: string;
  ring: string;
  mask: string;
  shadowPop: string;
}

export const LIGHT_PALETTE: UiPalette = {
  bg: '#faf6f2',
  surface: '#fffcf9',
  raised: '#fff7ef',
  sunken: '#f3eae5',
  sidebar: '#fff9f3',
  border: '#e9dcd4',
  borderSoft: '#f0e5de',
  borderStrong: '#d8c2b9',
  text: '#332a2d',
  text2: '#51464b',
  muted: '#6f5f64',
  subtle: '#77666a',
  primary: '#a54469',
  primaryHover: '#923955',
  primaryActive: '#7d2d56',
  accentText: '#913b5e',
  primarySoft: '#f8e8ed',
  positive: '#177a50',
  negative: '#c2412d',
  warning: '#9a6410',
  ring: 'rgba(165, 68, 105, 0.16)',
  mask: 'rgba(51, 34, 42, 0.36)',
  shadowPop: '0 16px 36px -12px rgba(75, 45, 53, 0.18), 0 2px 6px rgba(75, 45, 53, 0.05)',
};

export const DARK_PALETTE: UiPalette = {
  bg: '#0e1117',
  surface: '#151922',
  raised: '#1a1f29',
  sunken: '#11151c',
  sidebar: '#11151c',
  border: '#272d37',
  borderSoft: '#202630',
  borderStrong: '#353c48',
  text: '#f2f4f7',
  text2: '#c4cbd6',
  muted: '#98a1b0',
  subtle: '#737c8c',
  primary: '#416bd9',
  primaryHover: '#4e78e3',
  primaryActive: '#3a60c6',
  accentText: '#86a6f5',
  primarySoft: 'rgba(110, 146, 240, 0.14)',
  positive: '#5bbf93',
  negative: '#ec8a78',
  warning: '#d8a651',
  ring: 'rgba(110, 146, 240, 0.26)',
  mask: 'rgba(3, 5, 9, 0.6)',
  shadowPop: '0 18px 40px -12px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.35)',
};

export function paletteFor(theme: ResolvedTheme): UiPalette {
  return theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}
