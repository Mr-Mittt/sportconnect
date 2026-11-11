import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  durationFromStartAndEnd,
  endFromStartAndDuration,
  isEndNotAfterStart,
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
