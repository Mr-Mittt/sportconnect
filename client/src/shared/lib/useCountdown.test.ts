import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, secondsUntil, useCountdown } from './useCountdown';

describe('formatCountdown', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [60, '1:00'],
    [125, '2:05'],
    [900, '15:00'],
    [-3, '0:00'],
  ])('%i s reads %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});

describe('secondsUntil', () => {
  it('rounds up and never goes negative', () => {
    expect(secondsUntil(10_001, 0)).toBe(11);
    expect(secondsUntil(1_000, 5_000)).toBe(0);
  });
});

describe('useCountdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is 0 until started, shows the full length at once, counts down to zero and stops', () => {
    const { result } = renderHook(() => useCountdown());
    expect(result.current.secondsLeft).toBe(0);

    act(() => result.current.start(3));
    expect(result.current.secondsLeft).toBe(3);
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.secondsLeft).toBe(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.secondsLeft).toBe(0);
  });

  it('start again restarts it from the new length; stop clears it', () => {
    const { result } = renderHook(() => useCountdown());
    act(() => result.current.start(10));
    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.secondsLeft).toBe(6);

    act(() => result.current.start(60));
    expect(result.current.secondsLeft).toBe(60);

    act(() => result.current.stop());
    expect(result.current.secondsLeft).toBe(0);
  });
});
