import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { formatFullDateTime, formatTimestamp } from './timestamp';

const NOW = new Date(2026, 10, 17, 12, 0); // Nov 17 2026
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('formatTimestamp (CLIENT-GL-51)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('is relative up to and including 7 days', () => {
    expect(formatTimestamp(ago(2 * 3_600_000), NOW)).toBe('2h ago');
    expect(formatTimestamp(ago(7 * DAY), NOW)).toBe('7d ago');
  });

  it('is the date without the year once past 7 days in the current year', () => {
    expect(formatTimestamp(ago(8 * DAY), NOW)).toBe('Nov 9');
    expect(formatTimestamp(new Date(2026, 0, 2).toISOString(), NOW)).toBe('Jan 2');
  });

  it('keeps the year for an earlier year, even when it is only days ago', () => {
    expect(formatTimestamp(new Date(2025, 11, 31).toISOString(), new Date(2026, 0, 10))).toBe('Dec 31, 2025');
    expect(formatTimestamp(new Date(2025, 2, 5).toISOString(), NOW)).toBe('Mar 5, 2025');
  });

  it('reads day first in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    expect(formatTimestamp(ago(8 * DAY), NOW)).toBe('9 thg 11');
    expect(formatTimestamp(new Date(2025, 2, 5).toISOString(), NOW)).toBe('5 thg 3, 2025');
  });

  it('formats a full date and time for the hover', () => {
    expect(formatFullDateTime(new Date(2026, 10, 9, 21, 30).toISOString())).toMatch(/Nov 9, 2026.*9:30/);
  });
});
