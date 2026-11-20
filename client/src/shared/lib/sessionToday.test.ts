import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSessionToday, zoneForSession } from './sessionToday';

const NOW = new Date('2026-11-19T20:00:00Z'); // 03:00 on the 20th in Ho Chi Minh (UTC+7), 12:00 on the 19th in Los Angeles (UTC-8)

function at(scheduledStart: string, timezone?: string | null, scheduledEndAt?: string | null) {
  return { scheduledStart, scheduledEndAt, location: timezone === undefined ? null : { timezone } };
}

afterEach(() => vi.restoreAllMocks());

describe('isSessionToday', () => {
  it('reads both the start and now on the location zone: 22:00 Ho Chi Minh on the 20th is today there', () => {
    // 15:00Z on the 20th = 22:00 on the 20th in Ho Chi Minh; now is 03:00 on the 20th there.
    expect(isSessionToday(at('2026-11-20T15:00:00Z', 'Asia/Ho_Chi_Minh'), NOW)).toBe(true);
  });

  it('is not today when the venue date differs, even though the UTC date is the same', () => {
    // 2026-11-19T20:00Z is the 20th at the venue (03:00), and a start at 2026-11-19T10:00Z is the 19th there.
    expect(isSessionToday(at('2026-11-19T10:00:00Z', 'Asia/Ho_Chi_Minh'), NOW)).toBe(false);
  });

  it('depends on the zone of the session: the same instant is today in one zone and tomorrow in another', () => {
    const start = '2026-11-20T10:00:00Z'; // 17:00 on the 20th in Ho Chi Minh, 02:00 on the 20th in Los Angeles
    expect(isSessionToday(at(start, 'Asia/Ho_Chi_Minh'), NOW)).toBe(true); // now there is the 20th at 03:00
    expect(isSessionToday(at(start, 'America/Los_Angeles'), NOW)).toBe(false); // now there is the 19th at 12:00
  });

  describe('a session that spans days (today is between its start day and its end day)', () => {
    const HCMC = 'Asia/Ho_Chi_Minh'; // NOW is 03:00 on the 20th there

    it('started yesterday and ends today: it is today\'s', () => {
      expect(isSessionToday(at('2026-11-19T10:00:00Z', HCMC, '2026-11-19T21:00:00Z'), NOW)).toBe(true); // 17:00 on the 19th to 04:00 on the 20th
    });

    it('started yesterday and ends tomorrow: it is today\'s', () => {
      expect(isSessionToday(at('2026-11-19T10:00:00Z', HCMC, '2026-11-21T10:00:00Z'), NOW)).toBe(true); // the 19th to the 21st
    });

    it('started today and ends tomorrow: it is today\'s', () => {
      expect(isSessionToday(at('2026-11-19T20:30:00Z', HCMC, '2026-11-20T20:00:00Z'), NOW)).toBe(true); // 03:30 on the 20th to 03:00 on the 21st
    });

    it('started and ended yesterday: it is not', () => {
      expect(isSessionToday(at('2026-11-19T05:00:00Z', HCMC, '2026-11-19T07:00:00Z'), NOW)).toBe(false);
    });

    it('starts tomorrow: it is not', () => {
      expect(isSessionToday(at('2026-11-21T01:00:00Z', HCMC, '2026-11-21T03:00:00Z'), NOW)).toBe(false);
    });

    it('has no end time: only its start day counts', () => {
      expect(isSessionToday(at('2026-11-19T10:00:00Z', HCMC, null), NOW)).toBe(false);
      expect(isSessionToday(at('2026-11-20T01:00:00Z', HCMC, null), NOW)).toBe(true);
    });

    it('an end before the start (bad data) counts as its start day', () => {
      expect(isSessionToday(at('2026-11-19T10:00:00Z', HCMC, '2026-11-18T10:00:00Z'), NOW)).toBe(false);
    });
  });

  it("falls back to the viewer's zone when the location has no zone, or none at all", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Asia/Ho_Chi_Minh' } as Intl.ResolvedDateTimeFormatOptions);
    expect(zoneForSession(at('2026-11-20T15:00:00Z', null))).toBe('Asia/Ho_Chi_Minh');
    expect(zoneForSession(at('2026-11-20T15:00:00Z'))).toBe('Asia/Ho_Chi_Minh');
    expect(isSessionToday(at('2026-11-20T15:00:00Z', null), NOW)).toBe(true);
  });

  it("falls back to the viewer's zone for a zone name it does not know, never throwing", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'UTC' } as Intl.ResolvedDateTimeFormatOptions);
    expect(zoneForSession(at('2026-11-19T10:00:00Z', 'Not/AZone'))).toBe('UTC');
    expect(() => isSessionToday(at('2026-11-19T10:00:00Z', 'Not/AZone'), NOW)).not.toThrow();
  });
});
