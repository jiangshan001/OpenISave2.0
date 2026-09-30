import { describe, expect, it } from 'vitest';

import { describeSchedule, dueLabel } from './recurringFormat';

const base = { start_date: '2026-01-28', day_of_month: null };

describe('describeSchedule', () => {
  it('describes monthly rules with ordinal day and month end', () => {
    expect(describeSchedule({ ...base, frequency: 'monthly', interval: 1, day_of_month: 28 })).toBe(
      'Monthly · on the 28th',
    );
    expect(describeSchedule({ ...base, frequency: 'monthly', interval: 1, day_of_month: 1 })).toBe(
      'Monthly · on the 1st',
    );
    expect(describeSchedule({ ...base, frequency: 'monthly', interval: 1, day_of_month: 11 })).toBe(
      'Monthly · on the 11th',
    );
    expect(describeSchedule({ ...base, frequency: 'monthly', interval: 2, day_of_month: 31 })).toBe(
      'Every 2 months · last day',
    );
  });

  it('describes weekly and yearly intervals', () => {
    expect(describeSchedule({ ...base, frequency: 'weekly', interval: 2 })).toBe('Every 2 weeks');
    expect(describeSchedule({ ...base, frequency: 'yearly', interval: 1 })).toBe('Yearly');
  });
});

describe('dueLabel', () => {
  it('phrases due dates relative to today', () => {
    expect(dueLabel(-3)).toBe('Overdue by 3 days');
    expect(dueLabel(-1)).toBe('Overdue by 1 day');
    expect(dueLabel(0)).toBe('Due today');
    expect(dueLabel(1)).toBe('Due tomorrow');
    expect(dueLabel(4)).toBe('Due in 4 days');
  });
});
