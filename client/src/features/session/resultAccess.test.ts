import { describe, expect, it } from 'vitest';
import { getResultAccess, recordWindowEnd } from './resultAccess';
import type { Session, SessionParticipant } from './types';

const END = '2026-08-01T21:00:00Z';
const joined = { status: 'JOINED' } as SessionParticipant;

function session(overrides: Partial<Pick<Session, 'status' | 'scheduledEndAt' | 'callerParticipation'>> = {}) {
  return { status: 'ONGOING' as const, scheduledEndAt: END, callerParticipation: joined, ...overrides };
}

const at = (iso: string) => new Date(iso);

describe('getResultAccess', () => {
  it('is hidden without a result schema', () => {
    expect(getResultAccess(session(), false, at('2026-08-01T22:00:00Z'))).toEqual({ visible: false });
  });

  it.each(['PREPARING', 'SCHEDULED', 'CANCELLED'] as const)('is hidden for a %s session', (status) => {
    expect(getResultAccess(session({ status }), true, at('2026-08-01T22:00:00Z'))).toEqual({ visible: false });
  });

  it.each(['ONGOING', 'COMPLETED'] as const)('is visible and editable for a JOINED caller of a %s session', (status) => {
    expect(getResultAccess(session({ status }), true, at('2026-08-01T22:00:00Z'))).toEqual({
      visible: true,
      canEdit: true,
      windowClosed: false,
    });
  });

  it('is read-only for a caller who has not joined (a group member, an invitee, no row)', () => {
    for (const callerParticipation of [null, { status: 'INVITED' } as SessionParticipant, { status: 'REQUESTED' } as SessionParticipant]) {
      expect(getResultAccess(session({ callerParticipation }), true, at('2026-08-01T22:00:00Z'))).toEqual({
        visible: true,
        canEdit: false,
        windowClosed: false,
      });
    }
  });

  it('closes 24 hours after the end: still open at +23h, closed at +25h', () => {
    expect(getResultAccess(session(), true, at('2026-08-02T20:00:00Z'))).toMatchObject({ canEdit: true, windowClosed: false });
    expect(getResultAccess(session(), true, at('2026-08-02T22:00:00Z'))).toMatchObject({ canEdit: false, windowClosed: true });
  });

  it('never closes on the client when the session has no end time', () => {
    expect(getResultAccess(session({ scheduledEndAt: null }), true, at('2030-01-01T00:00:00Z'))).toMatchObject({
      canEdit: true,
      windowClosed: false,
    });
  });
});

describe('recordWindowEnd', () => {
  it('is the end plus 24 hours', () => {
    expect(recordWindowEnd({ scheduledEndAt: END })?.toISOString()).toBe('2026-08-02T21:00:00.000Z');
  });
  it('is null for no or an unreadable end', () => {
    expect(recordWindowEnd({ scheduledEndAt: null })).toBeNull();
    expect(recordWindowEnd({ scheduledEndAt: 'not a date' })).toBeNull();
  });
});
