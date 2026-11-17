import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { formatCountdownSpan } from './countdown';
import type { SessionParticipant } from '@/shared/types/session';
import { canLeaveBeforeStart, LEAVE_CUTOFF_MINUTES } from './leaveCutoff';
import { getParticipationAction } from './sessionParticipation';

const NOW = new Date('2026-11-17T10:00:00Z');
const after = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatCountdownSpan (CLIENT-GL-51)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows days and hh:mm:ss when a day or more is left', () => {
    expect(formatCountdownSpan(after(2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND), NOW)).toBe('2 days, 03:04:05');
  });

  it('uses the singular for exactly one day', () => {
    expect(formatCountdownSpan(after(DAY + 1 * SECOND), NOW)).toBe('1 day, 00:00:01');
  });

  it('drops the days part when there are none left', () => {
    expect(formatCountdownSpan(after(23 * HOUR + 59 * MINUTE + 59 * SECOND), NOW)).toBe('23:59:59');
    expect(formatCountdownSpan(after(5 * SECOND), NOW)).toBe('00:00:05');
  });

  it('rolls over to days at exactly 24 hours', () => {
    expect(formatCountdownSpan(after(DAY), NOW)).toBe('1 day, 00:00:00');
  });

  it('is null once the start is reached or passed', () => {
    expect(formatCountdownSpan(after(0), NOW)).toBeNull();
    expect(formatCountdownSpan(after(-SECOND), NOW)).toBeNull();
    expect(formatCountdownSpan(after(500), NOW)).toBeNull(); // under a second left
  });

  it('reads in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    expect(formatCountdownSpan(after(2 * DAY + 3 * HOUR), NOW)).toBe('2 ngày, 03:00:00');
    expect(formatCountdownSpan(after(HOUR), NOW)).toBe('01:00:00');
  });
});

describe('the leave cutoff (SESSION-65)', () => {
  it('is 15 minutes', () => {
    expect(LEAVE_CUTOFF_MINUTES).toBe(15);
  });

  it('allows leaving up to exactly 15 minutes before the start, not a second later', () => {
    expect(canLeaveBeforeStart(after(15 * MINUTE), NOW)).toBe(true);
    expect(canLeaveBeforeStart(after(15 * MINUTE - SECOND), NOW)).toBe(false);
    expect(canLeaveBeforeStart(after(2 * DAY), NOW)).toBe(true);
    expect(canLeaveBeforeStart(after(-HOUR), NOW)).toBe(false);
  });

  const caller = (status: SessionParticipant['status']) => ({ status } as SessionParticipant);
  const joined = { status: 'SCHEDULED' as const, callerParticipation: caller('JOINED') };

  it('hides the Leave action for a joined participant past the cutoff, in any status', () => {
    expect(getParticipationAction({ ...joined, scheduledStart: after(10 * MINUTE) }, NOW)).toBeNull();
    expect(getParticipationAction({ ...joined, status: 'ONGOING', scheduledStart: after(-HOUR) }, NOW)).toBeNull();
    expect(getParticipationAction({ ...joined, scheduledStart: after(HOUR) }, NOW)?.kind).toBe('LEAVE');
  });

  it('leaves cancelling a request and declining an invitation available past the cutoff', () => {
    const late = after(5 * MINUTE);
    expect(
      getParticipationAction({ status: 'SCHEDULED', callerParticipation: caller('REQUESTED'), scheduledStart: late }, NOW)?.kind,
    ).toBe('CANCEL');
    expect(
      getParticipationAction({ status: 'SCHEDULED', callerParticipation: caller('INVITED'), scheduledStart: late }, NOW)?.kind,
    ).toBe('ACCEPT');
  });

  it('has no cutoff when the start is not known', () => {
    expect(getParticipationAction(joined, NOW)?.kind).toBe('LEAVE');
  });
});
