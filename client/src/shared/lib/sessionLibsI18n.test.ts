import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { formatDiscoverDateLabel, formatDiscoverDateOptionLabel } from '@/features/session/discoverDateLabel';
import { formatSessionDayLabel } from '@/features/session/groupSessionsByDate';
import { formatFeeDisplay, getFeeTypeLabel } from './feeType';
import { formatParticipantCount } from './sessionCapacity';
import { getParticipationAction } from './sessionParticipation';
import { formatSessionHeaderDateTime, formatSessionTimeRange, formatStartTime } from './startTime';

/** CLIENT-I18N-10: the Sessions plain-function libs read the i18next singleton, so each one must
 * follow a language switch — and English must stay byte-identical to the pre-i18n strings. */
describe('session libs — Vietnamese', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  const now = new Date(2026, 6, 6, 12, 0); // Mon Jul 6 2026, noon
  const at = (day: number, hour: number, minute: number) => new Date(2026, 6, day, hour, minute).toISOString();

  it('translates fee labels, including the pending state', async () => {
    await i18n.changeLanguage('vi');
    expect(getFeeTypeLabel('FREE')).toBe('Miễn phí');
    expect(getFeeTypeLabel('SPLIT')).toBe('Chia đều chi phí');
    expect(formatFeeDisplay(null, null)).toBe('Chưa có mức phí');
    expect(formatFeeDisplay('FIXED', 150000)).toBe('150 000 ₫'); // currency formatting is locale-neutral
  });

  it('keeps the English fee labels', () => {
    expect(getFeeTypeLabel('FIXED')).toBe('Fixed amount');
    expect(formatFeeDisplay(null, null)).toBe('Fee pending');
  });

  it('translates participant counts (capped and uncapped)', async () => {
    await i18n.changeLanguage('vi');
    expect(formatParticipantCount(3, 9999)).toBe('3 người tham gia');
    expect(formatParticipantCount(1, 10)).toBe('1/10 người tham gia');
  });

  it('pluralizes participant counts in English', () => {
    expect(formatParticipantCount(1, 9999)).toBe('1 participant');
    expect(formatParticipantCount(3, 10)).toBe('3/10 participants');
  });

  it('translates the participation action label but keeps its kind', async () => {
    await i18n.changeLanguage('vi');
    expect(getParticipationAction({ status: 'SCHEDULED', callerParticipation: null })).toEqual({
      kind: 'JOIN',
      label: 'Tham gia',
    });
  });

  it('formats start times with Vietnamese relative words and day-first dates', async () => {
    await i18n.changeLanguage('vi');
    expect(formatStartTime(at(6, 19, 0), now)).toBe('Hôm nay, 19:00');
    expect(formatStartTime(at(7, 19, 0), now)).toBe('Ngày mai, 19:00');
    expect(formatStartTime(at(9, 18, 30), now)).toBe('Thứ 5, 18:30');
    expect(formatStartTime(at(20, 10, 0), now)).toBe('20 thg 7, 10:00');
    expect(formatSessionTimeRange(at(6, 22, 0), at(7, 1, 0), now)).toBe('Hôm nay, 22:00 – 7 thg 7, 01:00');
    expect(formatSessionHeaderDateTime(at(16, 18, 0), at(16, 20, 0))).toBe('Thứ 5, 16 thg 7 · 18:00 – 20:00');
  });

  it('labels Discover dates in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    expect(formatDiscoverDateLabel('2026-08-01', '2026-08-01')).toBe('Hôm nay');
    expect(formatDiscoverDateLabel('2026-08-02', '2026-08-01')).toBe('Ngày mai');
    expect(formatDiscoverDateLabel('2026-08-05', '2026-08-01')).toBe('Thứ 4, 5 thg 8');
    expect(formatDiscoverDateOptionLabel('2026-08-02', '2026-08-01')).toBe('Ngày mai (2 thg 8)');
  });

  it('labels session day headers in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    expect(formatSessionDayLabel('2026-09-20', '2026-09-20')).toBe('Hôm nay');
    expect(formatSessionDayLabel('2026-09-21', '2026-09-20')).toBe('21 thg 9, 2026');
  });
});
