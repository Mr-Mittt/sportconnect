import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-06T12:00:00Z');
  const iso = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString();
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  it('formats sub-minute as "just now"', () => {
    expect(formatRelativeTime(iso(30_000), now)).toBe('just now');
  });

  it('formats minutes, hours, and days in short units', () => {
    expect(formatRelativeTime(iso(5 * MINUTE), now)).toBe('5m ago');
    expect(formatRelativeTime(iso(2 * HOUR), now)).toBe('2h ago');
    expect(formatRelativeTime(iso(26 * HOUR), now)).toBe('1d ago');
  });
});
