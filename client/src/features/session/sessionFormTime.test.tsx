import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  durationFromStartAndEnd,
  endFromStartAndDuration,
  isEndNotAfterStart,
  isStartInPast,
  START_GRACE_MINUTES,
  useSessionTimeFields,
} from './sessionFormTime';

describe('endFromStartAndDuration', () => {
  it('adds the duration to the start', () => {
    expect(endFromStartAndDuration('2026-08-01T19:00', '90')).toBe('2026-08-01T20:30');
  });

  it('crosses midnight into the next day', () => {
    expect(endFromStartAndDuration('2026-08-01T23:30', '90')).toBe('2026-08-02T01:00');
  });

  it.each([
    ['', '90'],
    ['2026-08-01T19:00', ''],
    ['2026-08-01T19:00', '0'],
    ['2026-08-01T19:00', 'abc'],
    ['not-a-date', '30'],
  ])('is empty for an unusable input (%j, %j)', (start, duration) => {
    expect(endFromStartAndDuration(start, duration)).toBe('');
  });
});

describe('durationFromStartAndEnd / isEndNotAfterStart', () => {
  it('is the whole minutes between them', () => {
    expect(durationFromStartAndEnd('2026-08-01T19:00', '2026-08-01T21:15')).toBe(135);
    expect(durationFromStartAndEnd('2026-08-01T23:30', '2026-08-02T01:00')).toBe(90);
  });

  it('is null when the end is not after the start, or either is missing', () => {
    expect(durationFromStartAndEnd('2026-08-01T19:00', '2026-08-01T19:00')).toBeNull();
    expect(durationFromStartAndEnd('2026-08-01T19:00', '2026-08-01T18:00')).toBeNull();
    expect(durationFromStartAndEnd('', '2026-08-01T18:00')).toBeNull();
  });

  it('flags an end that is not after the start, but not a missing one', () => {
    expect(isEndNotAfterStart('2026-08-01T19:00', '2026-08-01T19:00')).toBe(true);
    expect(isEndNotAfterStart('2026-08-01T19:00', '2026-08-01T19:01')).toBe(false);
    expect(isEndNotAfterStart('2026-08-01T19:00', '')).toBe(false);
  });
});

describe('useSessionTimeFields', () => {
  const start = () => renderHook(() => useSessionTimeFields({ start: '2026-08-01T19:00', duration: '' }));

  it('derives the initial end from the initial start and duration', () => {
    const { result } = renderHook(() => useSessionTimeFields({ start: '2026-08-01T19:00', duration: '60' }));
    expect(result.current.end).toBe('2026-08-01T20:00');
  });

  it('editing the duration derives the end', () => {
    const { result } = start();
    act(() => result.current.setDuration('45'));
    expect(result.current.end).toBe('2026-08-01T19:45');
    act(() => result.current.setDuration(''));
    expect(result.current.end).toBe('');
  });

  it('editing the end derives the duration', () => {
    const { result } = start();
    act(() => result.current.setEnd('2026-08-01T21:00'));
    expect(result.current.duration).toBe('120');
  });

  it('moving the start keeps the duration and moves the end', () => {
    const { result } = renderHook(() => useSessionTimeFields({ start: '2026-08-01T19:00', duration: '90' }));
    act(() => result.current.setStart('2026-08-01T20:00'));
    expect(result.current.duration).toBe('90');
    expect(result.current.end).toBe('2026-08-01T21:30');
  });

  it('after an end was picked, moving the start keeps the duration it implied and moves the end', () => {
    const { result } = start();
    act(() => result.current.setEnd('2026-08-01T21:00'));
    act(() => result.current.setStart('2026-08-01T20:00'));
    expect(result.current.duration).toBe('120');
    expect(result.current.end).toBe('2026-08-01T22:00');
  });

  it('moving the start can repair an invalid end: the duration is derived from the end that stayed', () => {
    const { result } = start();
    act(() => result.current.setEnd('2026-08-01T18:00'));
    expect(result.current.isEndInvalid).toBe(true);
    act(() => result.current.setStart('2026-08-01T17:00'));
    expect(result.current.isEndInvalid).toBe(false);
    expect(result.current.end).toBe('2026-08-01T18:00');
    expect(result.current.duration).toBe('60');
  });

  it('an end that is not after the start is invalid and clears the duration', () => {
    const { result } = renderHook(() => useSessionTimeFields({ start: '2026-08-01T19:00', duration: '60' }));
    act(() => result.current.setEnd('2026-08-01T18:00'));
    expect(result.current.isEndInvalid).toBe(true);
    expect(result.current.duration).toBe('');
  });
});

describe('isStartInPast: the grace and the hook flag (CLIENT-GL-38)', () => {
  const now = new Date('2026-08-01T10:00:00');

  it('is false for the future, for now, and inside the grace', () => {
    expect(START_GRACE_MINUTES).toBe(5);
    expect(isStartInPast('2026-08-01T10:30', now)).toBe(false);
    expect(isStartInPast('2026-08-01T10:00', now)).toBe(false);
    expect(isStartInPast('2026-08-01T09:55', now)).toBe(false);
  });

  it('is true once the start is more than the grace before now', () => {
    expect(isStartInPast('2026-08-01T09:54', now)).toBe(true);
    expect(isStartInPast('2026-07-31T23:00', now)).toBe(true);
  });

  it('is false for an empty or unreadable start', () => {
    expect(isStartInPast('', now)).toBe(false);
    expect(isStartInPast('nonsense', now)).toBe(false);
  });

  it('the hook flags a changed past start but not the unchanged past start the form opened with', () => {
    const { result } = renderHook(() => useSessionTimeFields({ start: '2020-01-01T10:00', duration: '60' }));
    expect(result.current.isStartInPast).toBe(false);
    act(() => result.current.setStart('2020-01-02T10:00'));
    expect(result.current.isStartInPast).toBe(true);
    act(() => result.current.setStart('2999-01-01T10:00'));
    expect(result.current.isStartInPast).toBe(false);
  });

  it('a new form (nothing yet) flags a past start as soon as it is picked', () => {
    const { result } = renderHook(() => useSessionTimeFields({ start: '', duration: '' }));
    act(() => result.current.setStart('2020-01-01T10:00'));
    expect(result.current.isStartInPast).toBe(true);
  });
});
