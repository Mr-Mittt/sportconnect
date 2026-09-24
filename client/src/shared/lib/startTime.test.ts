import { describe, expect, it } from 'vitest';
import { formatSessionHeaderDateTime, formatSessionTimeRange, formatStartTime } from './startTime';

describe('formatStartTime', () => {
  // Local-time fixtures on purpose: the formatter renders in the viewer's
  // timezone, so UTC strings would make assertions machine-dependent.
  const now = new Date(2026, 6, 6, 12, 0); // Mon Jul 6 2026, noon
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 6, day, hour, minute).toISOString();

  it('formats same calendar day as "Today"', () => {
    expect(formatStartTime(at(6, 19, 0), now)).toBe('Today, 19:00');
  });

  it('formats the next calendar day as "Tomorrow"', () => {
    expect(formatStartTime(at(7, 19, 0), now)).toBe('Tomorrow, 19:00');
  });

  it('formats within a week as a weekday', () => {
    expect(formatStartTime(at(9, 18, 30), now)).toBe('Thu, 18:30'); // +3 days
    expect(formatStartTime(at(12, 9, 0), now)).toBe('Sun, 09:00'); // +6 days
  });

  it('formats a week or more out as a date', () => {
    expect(formatStartTime(at(13, 18, 30), now)).toBe('Jul 13, 18:30'); // +7 days
    expect(formatStartTime(at(20, 10, 0), now)).toBe('Jul 20, 10:00');
  });

  it('is calendar-day based, not 24h based', () => {
    const lateNow = new Date(2026, 6, 6, 23, 0);
    expect(formatStartTime(at(7, 1, 0), lateNow)).toBe('Tomorrow, 01:00');
  });
});

describe('formatSessionHeaderDateTime', () => {
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 6, day, hour, minute).toISOString();

  it('always includes weekday + date + time, regardless of proximity', () => {
    // Same day as formatStartTime's "Today" case (Mon Jul 6) — no relative shorthand here.
    expect(formatSessionHeaderDateTime(at(6, 19, 0))).toBe('Mon, Jul 6 · 19:00');
    expect(formatSessionHeaderDateTime(at(20, 10, 0))).toBe('Mon, Jul 20 · 10:00');
  });
});

describe('24-hour clock (CLIENT-SESSION-30)', () => {
  const now = new Date(2026, 6, 6, 12, 0);
  const on = (day: number, hour: number, minute: number) => new Date(2026, 6, day, hour, minute).toISOString();

  it('never renders AM/PM, and zero-pads the hour', () => {
    expect(formatStartTime(on(6, 0, 5), now)).toBe('Today, 00:05');
    expect(formatStartTime(on(6, 12, 0), now)).toBe('Today, 12:00');
    expect(formatSessionHeaderDateTime(on(6, 9, 5))).toBe('Mon, Jul 6 · 09:05');
  });
});

describe('formatSessionTimeRange', () => {
  const now = new Date(2026, 6, 6, 12, 0);
  const on = (day: number, hour: number, minute: number) => new Date(2026, 6, day, hour, minute).toISOString();

  it('shows only the end clock time when it is the same day as the start', () => {
    expect(formatSessionTimeRange(on(6, 15, 0), on(6, 17, 30), now)).toBe('Today, 15:00 – 17:30');
    expect(formatSessionTimeRange(on(7, 9, 0), on(7, 10, 0), now)).toBe('Tomorrow, 09:00 – 10:00');
  });

  it('adds the end date when the end falls on a different day', () => {
    expect(formatSessionTimeRange(on(6, 22, 0), on(7, 1, 0), now)).toBe('Today, 22:00 – Jul 7, 01:00');
  });

  it('shows the start only when there is no end time', () => {
    expect(formatSessionTimeRange(on(6, 15, 0), null, now)).toBe('Today, 15:00');
  });
});

describe('formatSessionHeaderDateTime with an end', () => {
  const on = (day: number, hour: number, minute: number) => new Date(2026, 6, day, hour, minute).toISOString();

  it('shows the end clock time on the same day', () => {
    expect(formatSessionHeaderDateTime(on(6, 18, 0), on(6, 20, 0))).toBe('Mon, Jul 6 · 18:00 – 20:00');
  });

  it('shows the end weekday/date too when it crosses midnight', () => {
    expect(formatSessionHeaderDateTime(on(6, 22, 0), on(7, 1, 0))).toBe('Mon, Jul 6 · 22:00 – Tue, Jul 7 · 01:00');
  });

  it('treats a null end like an omitted one', () => {
    expect(formatSessionHeaderDateTime(on(6, 18, 0), null)).toBe('Mon, Jul 6 · 18:00');
  });
});
