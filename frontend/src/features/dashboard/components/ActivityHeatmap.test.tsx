import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen, setupUser } from '@/test/utils';
import type { DailyActivity } from '@/types/dashboard';
import { ActivityHeatmapPanel } from './ActivityHeatmap';
import { buildHeatmapGrid } from './heatmapLayout';

function activity(): DailyActivity {
  return {
    base_currency: 'CNY',
    start: '2025-10-01',
    end: '2026-09-23',
    months: 12,
    series: {
      expense: {
        total_minor: 98_000,
        max_minor: 68_000,
        active_days: 2,
        days: [
          { date: '2026-09-01', amount_minor: 30_000, count: 2, level: 1 },
          { date: '2026-09-22', amount_minor: 68_000, count: 1, level: 4 },
        ],
      },
      income: {
        total_minor: 2_000_000,
        max_minor: 2_000_000,
        active_days: 1,
        days: [{ date: '2026-09-10', amount_minor: 2_000_000, count: 1, level: 1 }],
      },
    },
  };
}

function cell(date: string) {
  return document.querySelector(`[data-date="${date}"]`) as SVGRectElement;
}

describe('buildHeatmapGrid', () => {
  it('lays out every day of the window in Monday-first weeks', () => {
    const grid = buildHeatmapGrid('2025-10-01', '2026-09-23', []);
    const inRange = grid.weeks.flat().filter((day) => day.inRange);
    expect(inRange).toHaveLength(358); // 1 Oct 2025 … 23 Sep 2026 inclusive
    expect(grid.weeks[0][0].date).toBe('2025-09-29'); // the Monday before 1 Oct
    expect(grid.weeks[0][2]).toMatchObject({ date: '2025-10-01', inRange: true, weekday: 2 });
    expect(grid.monthLabels.map((label) => label.label)).toEqual([
      'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
    ]);
  });

  it('places backend totals on their dates without re-aggregating', () => {
    const grid = buildHeatmapGrid('2026-09-01', '2026-09-30', [
      { date: '2026-09-15', amount_minor: 1234, count: 3, level: 2 },
    ]);
    const day = grid.weeks.flat().find((entry) => entry.date === '2026-09-15');
    expect(day).toMatchObject({ amountMinor: 1234, count: 3, level: 2, inRange: true });
  });
});

describe('ActivityHeatmapPanel', () => {
  it('renders the expense heatmap by default with backend levels', () => {
    renderWithProviders(<ActivityHeatmapPanel data={activity()} />);
    expect(screen.getByText('Daily spending')).toBeInTheDocument();
    expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(358);
    expect(cell('2026-09-22').getAttribute('data-level')).toBe('4');
    expect(cell('2026-09-10').getAttribute('data-level')).toBe('0');
  });

  it('switches to income without changing the layout', async () => {
    const user = setupUser();
    renderWithProviders(<ActivityHeatmapPanel data={activity()} />);
    const before = screen.getAllByTestId('heatmap-cell').length;

    await user.click(screen.getByText('Income'));

    expect(screen.getByText('Daily income')).toBeInTheDocument();
    expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(before);
    expect(cell('2026-09-10').getAttribute('data-level')).toBe('1');
    expect(cell('2026-09-22').getAttribute('data-level')).toBe('0');
    expect(screen.getByText('¥20,000.00')).toBeInTheDocument();
  });

  it('shows the date and amount on hover', () => {
    renderWithProviders(<ActivityHeatmapPanel data={activity()} />);
    fireEvent.mouseEnter(cell('2026-09-01'));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('01 Sep 2026');
    expect(tooltip).toHaveTextContent('Expenses ¥300.00');
    expect(tooltip).toHaveTextContent('2 transactions');
  });
});
