import type { AccountGroup } from '@/types';
import type { ActivityKind } from '@/types/dashboard';
import type { ResolvedTheme } from './appearance';

/**
 * Data colours per theme. SVG presentation attributes do not resolve CSS
 * variables reliably, so charts read these values directly.
 *
 * Dark variants are lifted and slightly desaturated so red and green read
 * clearly on the blue-black canvas without turning neon, and every
 * structural line (grid, axis, cursor) is quieter than the data it frames.
 */
export interface ChartPalette {
  income: string;
  expense: string;
  net: string;
  grid: string;
  axis: string;
  cursor: string;
  /** Fill behind line-chart dots, i.e. the panel surface. */
  dotFill: string;
  categories: string[];
  groups: Record<AccountGroup, string>;
  /** Index = backend intensity level 0-4. Level 0 is an empty day. */
  heatmap: Record<ActivityKind, string[]>;
  heatmapHover: string;
}

export const LIGHT_CHARTS: ChartPalette = {
  income: '#3a9b72',
  expense: '#ce705a',
  net: '#493046',
  grid: '#f0e5de',
  axis: '#77666a',
  cursor: 'rgba(75, 45, 53, 0.04)',
  dotFill: '#fffcf9',
  categories: [
    '#a54469',
    '#3a9b72',
    '#e0a13a',
    '#d8674f',
    '#88709c',
    '#658c80',
    '#c483a2',
    '#8a9540',
    '#a296a1',
    '#b5835a',
  ],
  groups: {
    cash: '#a54469',
    savings: '#b97751',
    investments: '#3a9b72',
    physical_assets: '#d9a441',
    other_assets: '#a296a1',
    liabilities: '#c2412d',
  },
  heatmap: {
    expense: ['#f0e5de', '#f9ddd0', '#f2b59c', '#d78065', '#a54f45'],
    income: ['#f0e5de', '#cfe8db', '#98cfb3', '#4ea57f', '#22724f'],
  },
  heatmapHover: '#493046',
};

export const DARK_CHARTS: ChartPalette = {
  income: '#4fb386',
  expense: '#e8876f',
  net: '#d9dfe8',
  grid: '#20262f',
  axis: '#7d8696',
  cursor: 'rgba(255, 255, 255, 0.04)',
  dotFill: '#151922',
  categories: [
    '#6f95f2',
    '#4fb386',
    '#e2b25c',
    '#e5846f',
    '#9d93e6',
    '#58b4c9',
    '#d687b1',
    '#a9b161',
    '#98a3b6',
    '#c89c76',
  ],
  groups: {
    cash: '#6f95f2',
    savings: '#a9c0f7',
    investments: '#4fb386',
    physical_assets: '#e2b25c',
    other_assets: '#7f8a9c',
    liabilities: '#e8876f',
  },
  heatmap: {
    expense: ['#1a1f28', '#3a2827', '#613a33', '#96513f', '#d7765e'],
    income: ['#1a1f28', '#1c3229', '#245440', '#2e7f5a', '#52b78a'],
  },
  heatmapHover: '#f2f4f7',
};

export function chartPaletteFor(theme: ResolvedTheme): ChartPalette {
  return theme === 'dark' ? DARK_CHARTS : LIGHT_CHARTS;
}

export function categoryColor(palette: ChartPalette, index: number): string {
  return palette.categories[index % palette.categories.length];
}
