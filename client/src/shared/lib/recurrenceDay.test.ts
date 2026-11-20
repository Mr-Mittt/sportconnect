import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { clockEndTime, clockTime, monthDayOrdinal, recurrenceDayLabel, weekdayName } from './recurrenceDay';

/** CLIENT-GROUP-SESSION-4: how a recurrence configuration's day and time read. */
describe('recurrenceDay', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('names the weekday of dayKey 1 to 7 with Monday = 1, capitalised', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(weekdayName)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  it('names the weekday in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    expect(weekdayName(1)).toBe('Thứ Hai');
    expect(weekdayName(7)).toBe('Chủ Nhật');
  });

  it('gives the English ordinal of a day of the month', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(monthDayOrdinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '30th',
      '31st',
    ]);
  });

  it('gives a bare number in Vietnamese, which has no ordinal for a date', async () => {
    await i18n.changeLanguage('vi');
    expect(monthDayOrdinal(1)).toBe('1');
    expect(monthDayOrdinal(15)).toBe('15');
  });

  it('labels a day group: the weekday for a weekly configuration, the day of the month for a monthly one', async () => {
    expect(recurrenceDayLabel('WEEKLY', 2)).toBe('Tuesday');
    expect(recurrenceDayLabel('MONTHLY', 15)).toBe('15th');
    await i18n.changeLanguage('vi');
    expect(recurrenceDayLabel('WEEKLY', 2)).toBe('Thứ Ba');
    expect(recurrenceDayLabel('MONTHLY', 15)).toBe('Ngày 15');
  });

  it('shows the wall-clock time as given (HH:mm), never converted', () => {
    expect(clockTime('18:30:00')).toBe('18:30');
    expect(clockTime('07:05:00')).toBe('07:05');
  });

  it('adds the duration to the start; past midnight it wraps to the next day clock; without a duration there is no end', () => {
    expect(clockEndTime('18:00:00', 90)).toBe('19:30');
    expect(clockEndTime('18:30:00', 30)).toBe('19:00');
    expect(clockEndTime('23:30:00', 60)).toBe('00:30');
    expect(clockEndTime('00:00:00', 1440)).toBe('00:00');
    expect(clockEndTime('18:00:00', null)).toBeNull();
  });
});
