import { describe, expect, it } from 'vitest';
import { firstMissingInFormOrder, missingFieldId, missingFieldSection } from './sessionFormFocus';
import type { MissingField } from './sessionReadiness';

describe('firstMissingInFormOrder (CLIENT-SESSION-50)', () => {
  it('returns undefined when nothing is missing', () => {
    expect(firstMissingInFormOrder([])).toBeUndefined();
  });

  it('picks the only missing field', () => {
    expect(firstMissingInFormOrder(['location'])).toBe('location');
    expect(firstMissingInFormOrder(['fee'])).toBe('fee');
    expect(firstMissingInFormOrder(['duration'])).toBe('duration');
  });

  it('picks the topmost on the form, whatever order the list has', () => {
    // `missingForScheduling` lists location, fee, duration; the form shows duration first.
    expect(firstMissingInFormOrder(['location', 'fee', 'duration'])).toBe('duration');
    expect(firstMissingInFormOrder(['fee', 'location'])).toBe('location');
    expect(firstMissingInFormOrder(['fee', 'duration'])).toBe('duration');
    expect(firstMissingInFormOrder(['location', 'duration'])).toBe('duration');
  });

  it('is independent of the input order (every permutation)', () => {
    const all: MissingField[] = ['duration', 'location', 'fee'];
    const permutations: MissingField[][] = [
      [all[0], all[1], all[2]],
      [all[0], all[2], all[1]],
      [all[1], all[0], all[2]],
      [all[1], all[2], all[0]],
      [all[2], all[0], all[1]],
      [all[2], all[1], all[0]],
    ];
    for (const permutation of permutations) {
      expect(firstMissingInFormOrder(permutation)).toBe('duration');
    }
  });
});

describe('missingFieldId', () => {
  it('names the element that takes the focus for each field', () => {
    expect(missingFieldId('duration', 'create-session')).toBe('create-session-duration');
    expect(missingFieldId('location', 'create-session')).toBe('create-session-location');
    expect(missingFieldId('fee', 'create-session')).toBe('create-session-fee-free');
  });

  it('uses the given prefix', () => {
    expect(missingFieldId('fee', 'detail-cost')).toBe('detail-cost-fee-free');
  });
});

describe('missingFieldSection', () => {
  it('names the section that holds each missing field', () => {
    expect(missingFieldSection('duration')).toBe('when');
    expect(missingFieldSection('location')).toBe('where');
    expect(missingFieldSection('fee')).toBe('cost');
  });
});
