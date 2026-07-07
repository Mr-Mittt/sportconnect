import { describe, expect, it } from 'vitest';
import { formatStartTime } from './startTime';

describe('formatStartTime', () => {
  // Local-time fixtures on purpose: the formatter renders in the viewer's
  // timezone, so UTC strings would make assertions machine-dependent.
  const now = new Date(2026, 6, 6, 12, 0); // Mon Jul 6 2026, noon
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 6, day, hour, minute).toISOString();

  it('formats same calendar day as "Today"', () => {
    expect(formatStartTime(at(6, 19, 0), now)).toBe('Today, 7:00 PM');
  });

  it('formats the next calendar day as "Tomorrow"', () => {
    expect(formatStartTime(at(7, 19, 0), now)).toBe('Tomorrow, 7:00 PM');
  });

  it('formats within a week as a weekday', () => {
    expect(formatStartTime(at(9, 18, 30), now)).toBe('Thu, 6:30 PM'); // +3 days
    expect(formatStartTime(at(12, 9, 0), now)).toBe('Sun, 9:00 AM'); // +6 days
  });

  it('formats a week or more out as a date', () => {
    expect(formatStartTime(at(13, 18, 30), now)).toBe('Jul 13, 6:30 PM'); // +7 days
    expect(formatStartTime(at(20, 10, 0), now)).toBe('Jul 20, 10:00 AM');
  });

  it('is calendar-day based, not 24h based', () => {
    const lateNow = new Date(2026, 6, 6, 23, 0);
    expect(formatStartTime(at(7, 1, 0), lateNow)).toBe('Tomorrow, 1:00 AM');
  });
});
