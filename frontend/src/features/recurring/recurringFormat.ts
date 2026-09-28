import type { RecurringFrequency, RecurringMode, RecurringRule, RecurringStatus } from '@/types/recurring';

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

const UNIT: Record<RecurringFrequency, [string, string]> = {
  weekly: ['Weekly', 'weeks'],
  monthly: ['Monthly', 'months'],
  yearly: ['Yearly', 'years'],
};

/** Human description of a schedule. The dates themselves come from the API. */
export function describeSchedule(
  rule: Pick<RecurringRule, 'frequency' | 'interval' | 'day_of_month' | 'start_date'>,
): string {
  const [single, plural] = UNIT[rule.frequency];
  const base = rule.interval === 1 ? single : `Every ${rule.interval} ${plural}`;
  if (rule.frequency === 'monthly' && rule.day_of_month) {
    return rule.day_of_month === 31
      ? `${base} · last day`
      : `${base} · on the ${ordinal(rule.day_of_month)}`;
  }
  return base;
}

export function dueLabel(daysUntil: number): string {
  if (daysUntil < 0) return `Overdue by ${-daysUntil} day${daysUntil === -1 ? '' : 's'}`;
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Due tomorrow';
  return `Due in ${daysUntil} days`;
}

export const MODE_LABELS: Record<RecurringMode, string> = {
  review: 'Review first',
  automatic: 'Automatic',
};

export const STATUS_CHIP: Record<RecurringStatus, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'oi-chip--positive' },
  paused: { label: 'Paused', tone: 'oi-chip--warning' },
  archived: { label: 'Archived', tone: '' },
};

export const DAY_OF_MONTH_OPTIONS = [
  ...Array.from({ length: 30 }, (_, index) => ({ value: index + 1, label: ordinal(index + 1) })),
  { value: 31, label: 'Last day of the month' },
];
