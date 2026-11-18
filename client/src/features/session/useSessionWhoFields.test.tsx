import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSessionWhoFields } from './useSessionWhoFields';

const initial = { taken: '', open: '', maleSlots: null, femaleSlots: null, gameMood: 5, autoApprove: false, isPublic: true };

describe('useSessionWhoFields', () => {
  it('capacity is taken + open, a blank taken slot meaning the creator alone', () => {
    const { result } = renderHook(() => useSessionWhoFields(initial));
    act(() => result.current.setOpen('5'));
    expect(result.current.effectiveTaken).toBe(1);
    expect(result.current.capacity).toBe(6);
    expect(result.current.initialSlot).toBe(0);
    act(() => result.current.setTaken('3'));
    expect(result.current.capacity).toBe(8);
    expect(result.current.initialSlot).toBe(2);
  });

  it('starts as Anyone for a session with no split, and By gender when it has one', () => {
    const { result: anyone } = renderHook(() => useSessionWhoFields(initial));
    expect(anyone.current.whoCanJoin).toBe('ANYONE');
    const { result: split } = renderHook(() => useSessionWhoFields({ ...initial, maleSlots: 2, femaleSlots: 1 }));
    expect(split.current.whoCanJoin).toBe('BY_GENDER');
    expect(split.current.maleChecked).toBe(true);
    expect(split.current.male).toBe('2');
    expect(split.current.femaleChecked).toBe(true);
    expect(split.current.female).toBe('1');
  });

  it('counts a gender only while By gender is chosen and its box is ticked', () => {
    const { result } = renderHook(() => useSessionWhoFields(initial));
    act(() => result.current.setWhoCanJoin('BY_GENDER'));
    act(() => result.current.setMale('4'));
    expect(result.current.maleSlots).toBe(0);
    act(() => result.current.setMaleChecked(true));
    expect(result.current.maleSlots).toBe(4);
  });

  it('un-ticking a gender clears its number', () => {
    const { result } = renderHook(() => useSessionWhoFields({ ...initial, maleSlots: 3 }));
    act(() => result.current.setMaleChecked(false));
    expect(result.current.male).toBe('');
    expect(result.current.maleSlots).toBe(0);
  });

  it('switching to Anyone clears both genders', () => {
    const { result } = renderHook(() => useSessionWhoFields({ ...initial, open: '9', maleSlots: 3, femaleSlots: 2 }));
    act(() => result.current.setWhoCanJoin('ANYONE'));
    expect(result.current.maleSlots).toBe(0);
    expect(result.current.femaleSlots).toBe(0);
    expect(result.current.maleChecked).toBe(false);
    expect(result.current.femaleChecked).toBe(false);
  });

  it('flags male + female over the open slots', () => {
    const { result } = renderHook(() => useSessionWhoFields({ ...initial, open: '5', maleSlots: 4, femaleSlots: 2 }));
    expect(result.current.genderOverOpen).toBe(true);
    act(() => result.current.setOpen('6'));
    expect(result.current.genderOverOpen).toBe(false);
  });

  it('builds the update payload, sending 0 for a cleared gender', () => {
    const { result } = renderHook(() =>
      useSessionWhoFields({ taken: '1', open: '9', maleSlots: 3, femaleSlots: null, gameMood: 7, autoApprove: true, isPublic: true }),
    );
    act(() => result.current.setFemaleChecked(false));
    expect(result.current.toUpdatePayload()).toEqual({
      capacity: 10,
      initialSlot: 0,
      maleSlots: 3,
      femaleSlots: 0,
      gameMood: 7,
      autoApprove: true,
    });
  });

  // CLIENT-SESSION-52
  it('starts with the visibility it is given, and the update payload carries isPublic only once it changed', () => {
    const { result } = renderHook(() => useSessionWhoFields({ ...initial, isPublic: true }));
    expect(result.current.isPublic).toBe(true);
    expect(result.current.toUpdatePayload()).not.toHaveProperty('isPublic');

    act(() => result.current.setIsPublic(false));
    expect(result.current.isPublic).toBe(false);
    expect(result.current.toUpdatePayload()).toMatchObject({ isPublic: false });

    // Back to where it started: nothing to send again.
    act(() => result.current.setIsPublic(true));
    expect(result.current.toUpdatePayload()).not.toHaveProperty('isPublic');
  });

  it('a private session switched to public sends isPublic: true', () => {
    const { result } = renderHook(() => useSessionWhoFields({ ...initial, isPublic: false }));
    expect(result.current.toUpdatePayload()).not.toHaveProperty('isPublic');

    act(() => result.current.setIsPublic(true));
    expect(result.current.toUpdatePayload()).toMatchObject({ isPublic: true });
  });
});
