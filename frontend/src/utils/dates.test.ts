import { afterEach, describe, expect, it } from 'vitest';

import { formatDate, monthRange } from './dates';

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/**
 * The API sends business dates as plain YYYY-MM-DD (for an imported WeChat row:
 * the Asia/Shanghai calendar date). The UI must show that same day whatever
 * zone the computer is in, never shift it through UTC.
 */
describe.each(['Europe/London', 'America/Los_Angeles', 'Asia/Shanghai', 'Pacific/Kiritimati'])(
  'business dates in %s',
  (zone) => {
    it('display the calendar day unchanged', () => {
      process.env.TZ = zone;
      expect(formatDate('2026-09-12')).toBe('12 Sep 2026');
      expect(formatDate('2026-10-01')).toBe('01 Oct 2026');
      expect(monthRange(2026, 9)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });
  },
);
