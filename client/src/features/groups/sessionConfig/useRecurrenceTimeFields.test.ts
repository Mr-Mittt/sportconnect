import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { durationFromStartAndEnd, endFromStartAndDuration, useRecurrenceTimeFields } from './useRecurrenceTimeFields';

describe('endFromStartAndDuration', () => {
  it('adds the duration to the start', () => {
    expect(endFromStartAndDuration('18:00', '90')).toBe('19:30');
  });
  it('wraps past midnight to the next day\'s clock', () => {
    expect(endFromStartAndDuration('23:30', '90')).toBe('01:00');
  });
  it('is empty without a usable start or duration', () => {
    expect(endFromStartAndDuration('', '90')).toBe('');
    expect(endFromStartAndDuration('18:00', '')).toBe('');
    expect(endFromStartAndDuration('18:00', '0')).toBe('');
    expect(endFromStartAndDuration('18:00', 'abc')).toBe('');
  });
});

describe('durationFromStartAndEnd', () => {
  it('is the distance from the start to the end', () => {
    expect(durationFromStartAndEnd('18:00', '19:30')).toBe('90');
  });
  it('reads an end earlier than the start as the next day', () => {
    expect(durationFromStartAndEnd('23:00', '01:00')).toBe('120');
  });
  it('is empty for the same time, or when one side is missing', () => {
    expect(durationFromStartAndEnd('18:00', '18:00')).toBe('');
    expect(durationFromStartAndEnd('', '18:00')).toBe('');
    expect(durationFromStartAndEnd('18:00', '')).toBe('');
  });
});

describe('useRecurrenceTimeFields', () => {
  it('derives the end from the initial start and duration', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '90' }));
    expect(result.current.end).toBe('19:30');
  });

  it('editing the duration derives the end', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '' }));
    act(() => result.current.setDuration('60'));
    expect(result.current.end).toBe('19:00');
  });

  it('editing the end derives the duration, over midnight too', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '23:00', duration: '' }));
    act(() => result.current.setEnd('00:30'));
    expect(result.current.duration).toBe('90');
    expect(result.current.isEndInvalid).toBe(false);
  });

  it('moving the start keeps the duration and moves the end', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '60' }));
    act(() => result.current.setStart('20:00'));
    expect(result.current.duration).toBe('60');
    expect(result.current.end).toBe('21:00');
  });

  it('moving the start while the end is the start (no duration) keeps the end and derives the duration from it', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '' }));
    act(() => result.current.setEnd('18:00'));
    expect(result.current.duration).toBe('');
    act(() => result.current.setStart('17:00'));
    expect(result.current.end).toBe('18:00');
    expect(result.current.duration).toBe('60');
    expect(result.current.isEndInvalid).toBe(false);
  });

  it('an end equal to the start is invalid and leaves no duration', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '' }));
    act(() => result.current.setEnd('18:00'));
    expect(result.current.isEndInvalid).toBe(true);
    expect(result.current.duration).toBe('');
  });

  it('a duration of a whole day or more is invalid', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '' }));
    act(() => result.current.setDuration('1440'));
    expect(result.current.isEndInvalid).toBe(true);
    act(() => result.current.setDuration('1439'));
    expect(result.current.isEndInvalid).toBe(false);
  });

  it('clearing the duration clears the end', () => {
    const { result } = renderHook(() => useRecurrenceTimeFields({ start: '18:00', duration: '90' }));
    act(() => result.current.setDuration(''));
    expect(result.current.end).toBe('');
  });
});
