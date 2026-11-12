import { describe, expect, it } from 'vitest';
import { makeSession } from './components/sessionListFixtures';
import { missingForScheduling, missingForSession } from './sessionReadiness';

describe('missingForScheduling (mirrors the server rule, SESSION-46)', () => {
  const complete = { hasLocation: true, feeType: 'FREE' as const, hasFeeAmount: false, hasDuration: true };

  it('is empty when location, fee and duration are all there', () => {
    expect(missingForScheduling(complete)).toEqual([]);
  });

  it('lists each gap, in a fixed order: location, fee, duration', () => {
    expect(
      missingForScheduling({ hasLocation: false, feeType: undefined, hasFeeAmount: false, hasDuration: false }),
    ).toEqual(['location', 'fee', 'duration']);
  });

  it.each([
    [{ ...complete, hasLocation: false }, ['location']],
    [{ ...complete, feeType: null }, ['fee']],
    [{ ...complete, feeType: undefined }, ['fee']],
    [{ ...complete, hasDuration: false }, ['duration']],
  ])('names only the missing piece (%j)', (input, expected) => {
    expect(missingForScheduling(input)).toEqual(expected);
  });

  it('a FIXED fee without its amount counts as the fee missing; with it, it does not', () => {
    expect(missingForScheduling({ ...complete, feeType: 'FIXED', hasFeeAmount: false })).toEqual(['fee']);
    expect(missingForScheduling({ ...complete, feeType: 'FIXED', hasFeeAmount: true })).toEqual([]);
  });

  it('a FREE or SPLIT fee never needs an amount', () => {
    expect(missingForScheduling({ ...complete, feeType: 'SPLIT', hasFeeAmount: false })).toEqual([]);
  });
});

describe('missingForSession', () => {
  it('reads the stored session: a null location, fee or end is missing', () => {
    expect(missingForSession(makeSession({ id: 1, location: null, feeType: null, scheduledEndAt: null }))).toEqual([
      'location',
      'fee',
      'duration',
    ]);
  });

  it('a stored FIXED fee without an amount is a missing fee', () => {
    expect(
      missingForSession(
        makeSession({ id: 1, feeType: 'FIXED', feeAmountVnd: null, scheduledEndAt: '2026-08-05T20:00:00' }),
      ),
    ).toEqual(['fee']);
  });

  it('is empty for a complete session', () => {
    expect(missingForSession(makeSession({ id: 1, scheduledEndAt: '2026-08-05T20:00:00' }))).toEqual([]);
  });
});
