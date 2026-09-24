import dayjs from 'dayjs';

import type { ActivityDay } from '@/types/dashboard';
import { API_DATE_FORMAT } from '@/utils/dates';

/**
 * Calendar layout for the activity heatmap. Pure placement only: amounts and
 * intensity levels arrive pre-aggregated from the backend, this just puts each
 * day into a Monday-first week column.
 */
export interface HeatmapCell {
  date: string;
  /** Row 0 = Monday … 6 = Sunday. */
  weekday: number;
  inRange: boolean;
  amountMinor: number;
  count: number;
  level: number;
}

export interface HeatmapGrid {
  weeks: HeatmapCell[][];
  monthLabels: { week: number; label: string }[];
}

export function buildHeatmapGrid(start: string, end: string, days: ActivityDay[]): HeatmapGrid {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = dayjs(start);
  const last = dayjs(end);
  // dayjs weeks start on Sunday (0); shift so Monday is row 0.
  const gridStart = first.subtract((first.day() + 6) % 7, 'day');

  const weeks: HeatmapCell[][] = [];
  const monthLabels: HeatmapGrid['monthLabels'] = [];
  let cursor = gridStart;
  while (!cursor.isAfter(last, 'day')) {
    const week: HeatmapCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const key = cursor.format(API_DATE_FORMAT);
      const inRange = !cursor.isBefore(first, 'day') && !cursor.isAfter(last, 'day');
      const day = inRange ? byDate.get(key) : undefined;
      if (inRange && cursor.date() === 1) {
        monthLabels.push({ week: weeks.length, label: cursor.format('MMM') });
      }
      week.push({
        date: key,
        weekday,
        inRange,
        amountMinor: day?.amount_minor ?? 0,
        count: day?.count ?? 0,
        level: day?.level ?? 0,
      });
      cursor = cursor.add(1, 'day');
    }
    weeks.push(week);
  }
  return { weeks, monthLabels };
}
