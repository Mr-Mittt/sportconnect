import { describe, expect, it } from 'vitest';
import { exceedsOpenSlots, genderSplitText, isByGender, openSlotsOf } from './sessionSlots';

describe('session slots', () => {
  it('open slots are the capacity minus the taken ones (initialSlot + the creator)', () => {
    expect(openSlotsOf({ capacity: 10, initialSlot: 0 })).toBe(9);
    expect(openSlotsOf({ capacity: 10, initialSlot: 2 })).toBe(7);
    expect(openSlotsOf({ capacity: 1, initialSlot: 3 })).toBe(0);
  });

  it('is by gender only when a count is above 0 (0 means "not specified")', () => {
    expect(isByGender(null, null)).toBe(false);
    expect(isByGender(0, 0)).toBe(false);
    expect(isByGender(2, null)).toBe(true);
    expect(isByGender(0, 1)).toBe(true);
  });

  it('male + female may equal the open slots but not exceed them', () => {
    expect(exceedsOpenSlots(6, 4, 2)).toBe(false);
    expect(exceedsOpenSlots(6, 4, 3)).toBe(true);
    expect(exceedsOpenSlots(0, 0, 0)).toBe(false);
  });

  it('writes the split as "4 male - 4 female", and nothing when none is reserved', () => {
    const labels = { male: 'male', female: 'female' };
    expect(genderSplitText(4, 4, labels)).toBe('4 male - 4 female');
    expect(genderSplitText(2, null, labels)).toBe('2 male');
    expect(genderSplitText(null, 3, labels)).toBe('3 female');
    expect(genderSplitText(0, 0, labels)).toBe('');
  });
});
