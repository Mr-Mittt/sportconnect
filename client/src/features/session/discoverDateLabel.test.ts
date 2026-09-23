import { describe, expect, it } from 'vitest';
import {
  discoverQuickDates,
  formatDiscoverDateLabel,
  formatDiscoverDateOptionLabel,
  MAX_DISCOVER_DATES,
} from './discoverDateLabel';

describe('formatDiscoverDateLabel', () => {
  it('labels the given today as "Today"', () => {
    expect(formatDiscoverDateLabel('2026-08-01', '2026-08-01')).toBe('Today');
  });

  it('labels the day after today as "Tomorrow"', () => {
    expect(formatDiscoverDateLabel('2026-08-02', '2026-08-01')).toBe('Tomorrow');
  });

  it('labels any other date as dd/MM', () => {
    expect(formatDiscoverDateLabel('2026-08-05', '2026-08-01')).toBe('05/08');
  });

  it('labels a past date as dd/MM too (no special-casing)', () => {
    expect(formatDiscoverDateLabel('2026-07-30', '2026-08-01')).toBe('30/07');
  });
});

describe('formatDiscoverDateOptionLabel', () => {
  it('labels today as bare "Today", same as formatDiscoverDateLabel', () => {
    expect(formatDiscoverDateOptionLabel('2026-08-01', '2026-08-01')).toBe('Today');
  });

  it('labels tomorrow as "Tomorrow (dd/MM)", carrying its own date', () => {
    expect(formatDiscoverDateOptionLabel('2026-08-02', '2026-08-01')).toBe('Tomorrow (02/08)');
  });

  it('labels any other date as dd/MM, same as formatDiscoverDateLabel', () => {
    expect(formatDiscoverDateOptionLabel('2026-08-05', '2026-08-01')).toBe('05/08');
  });
});

describe('discoverQuickDates', () => {
  it('returns 7 consecutive days starting today', () => {
    const dates = discoverQuickDates(new Date('2026-08-01T12:00:00'));
    expect(dates).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });
});

describe('MAX_DISCOVER_DATES', () => {
  it('is 8, matching /discover/counts\' own cap', () => {
    expect(MAX_DISCOVER_DATES).toBe(8);
  });
});
