import dayjs, { type Dayjs } from 'dayjs';

export const API_DATE_FORMAT = 'YYYY-MM-DD';
export const DISPLAY_DATE_FORMAT = 'DD MMM YYYY';

export function toApiDate(value: Dayjs | Date | string): string {
  return dayjs(value).format(API_DATE_FORMAT);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format(DISPLAY_DATE_FORMAT);
}

export function formatMonthKey(key: string): string {
  return dayjs(`${key}-01`).format('MMM YY');
}

export function monthLabel(year: number, month: number): string {
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM YYYY');
}

export function currentPeriod(): { year: number; month: number } {
  const now = dayjs();
  return { year: now.year(), month: now.month() + 1 };
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  return { from: start.format(API_DATE_FORMAT), to: start.endOf('month').format(API_DATE_FORMAT) };
}

export const YEAR_OPTIONS = Array.from({ length: 11 }, (_, index) => dayjs().year() - 5 + index);

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: dayjs().month(index).format('MMMM'),
}));
