import { describe, expect, it } from 'vitest';
import { defaultHistoryMonth, earliestHistoryMonth, historyMonthWindow, monthOf, shiftMonth } from './groupHistoryMonth';

/** CLIENT-GROUP-UI-1: the month maths of the group History's month filter. */
describe('defaultHistoryMonth', () => {
  it('is the month of yesterday', () => {
    expect(defaultHistoryMonth(new Date(2026, 10, 20))).toBe('2026-11');
  });
  it('is the previous month on the 1st of a month', () => {
    expect(defaultHistoryMonth(new Date(2026, 11, 1))).toBe('2026-11');
  });
  it('is December of the year before on 1 January', () => {
    expect(defaultHistoryMonth(new Date(2027, 0, 1))).toBe('2026-12');
  });
});

describe('shiftMonth / monthOf', () => {
  it('moves across a year boundary both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });
  it('reads the month of a day and of a date', () => {
    expect(monthOf('2026-02-28')).toBe('2026-02');
    expect(monthOf(new Date(2026, 4, 3))).toBe('2026-05');
  });
});

describe('earliestHistoryMonth', () => {
  it('is the month the group was created in, none when unreadable', () => {
    expect(earliestHistoryMonth('2026-09-10T08:00:00')).toBe('2026-09');
    expect(earliestHistoryMonth(undefined)).toBeNull();
    expect(earliestHistoryMonth('nope')).toBeNull();
  });
});

describe('historyMonthWindow', () => {
  it('a past month is the whole month: before = the first of the next month, days = its length', () => {
    const window = historyMonthWindow('2026-10', '2026-11-20')!;
    expect(window.before).toBe('2026-11-01');
    expect(window.days).toBe(31);
    expect(window.daysNewestFirst[0]).toBe('2026-10-31');
    expect(window.daysNewestFirst).toHaveLength(31);
    expect(window.daysNewestFirst[30]).toBe('2026-10-01');
  });
  it('knows a short month and a leap February', () => {
    expect(historyMonthWindow('2026-02', '2026-11-20')!.days).toBe(28);
    expect(historyMonthWindow('2028-02', '2028-11-20')!.days).toBe(29);
    expect(historyMonthWindow('2026-11', '2026-12-20')!.days).toBe(30);
  });
  it('the current month ends the day before today', () => {
    const window = historyMonthWindow('2026-11', '2026-11-20')!;
    expect(window.before).toBe('2026-11-20');
    expect(window.days).toBe(19);
    expect(window.daysNewestFirst[0]).toBe('2026-11-19');
    expect(window.daysNewestFirst[18]).toBe('2026-11-01');
  });
  it('has no window when no day of the month has ended: the current month on its 1st, a future month', () => {
    expect(historyMonthWindow('2026-12', '2026-12-01')).toBeNull();
    expect(historyMonthWindow('2027-01', '2026-12-15')).toBeNull();
  });
});
