import { describe, expect, it } from 'vitest';
import { makeLocation, makeRecurrence } from './fixtures';
import { emptyRecurrenceValues, missingForRecurrence, toRecurrencePayload, valuesFromRecurrence } from './recurrenceForm';

const location = makeLocation();

describe('emptyRecurrenceValues', () => {
  it('opens on the first day at 18:00, free, for everyone, with mood 5 and nothing else', () => {
    expect(emptyRecurrenceValues()).toEqual({
      dayKey: 1,
      start: '18:00',
      duration: '',
      locationNote: '',
      audience: 'ALL_MEMBERS',
      audienceMembers: [],
      feeType: 'FREE',
      feeAmountVnd: '',
      feeNote: '',
      gameMood: 5,
    });
  });
});

describe('valuesFromRecurrence', () => {
  it('fills the form from a saved configuration (Edit)', () => {
    const recurrence = makeRecurrence({
      dayKey: 4,
      startTime: '07:30:00',
      durationMinutes: 75,
      locationNote: 'Court 3',
      audience: 'SPECIFIC',
      audienceMembers: [{ id: 'u1', name: 'Linh', avatarUrl: null }],
      feeType: 'FIXED',
      feeAmountVnd: 50000,
      feeNote: 'Cash',
      gameMood: 8,
    });
    expect(valuesFromRecurrence(recurrence)).toEqual({
      dayKey: 4,
      start: '07:30',
      duration: '75',
      locationNote: 'Court 3',
      audience: 'SPECIFIC',
      audienceMembers: [{ id: 'u1', name: 'Linh', avatarUrl: null }],
      feeType: 'FIXED',
      feeAmountVnd: '50000',
      feeNote: 'Cash',
      gameMood: 8,
    });
  });

  it('shows empty strings for what a draft lacks', () => {
    const values = valuesFromRecurrence(makeRecurrence({ durationMinutes: null, locationNote: null, feeAmountVnd: null, feeNote: null }));
    expect(values.duration).toBe('');
    expect(values.locationNote).toBe('');
    expect(values.feeAmountVnd).toBe('');
    expect(values.feeNote).toBe('');
  });
});

describe('missingForRecurrence', () => {
  const complete = { location, duration: '90', feeType: 'FREE' as const, feeAmountVnd: '' };

  it('nothing is missing from a complete one', () => {
    expect(missingForRecurrence(complete)).toEqual([]);
  });
  it('a location, a duration and a fixed fee\'s amount, in the server\'s order', () => {
    expect(missingForRecurrence({ location: null, duration: '', feeType: 'FIXED', feeAmountVnd: '' })).toEqual([
      'locationId',
      'durationMinutes',
      'feeAmountVnd',
    ]);
  });
  it('an amount is only needed for a fixed fee', () => {
    expect(missingForRecurrence({ ...complete, feeType: 'SPLIT', feeAmountVnd: '' })).toEqual([]);
    expect(missingForRecurrence({ ...complete, feeType: undefined })).toEqual([]);
    expect(missingForRecurrence({ ...complete, feeType: 'FIXED', feeAmountVnd: '30000' })).toEqual([]);
  });
});

describe('toRecurrencePayload', () => {
  it('sends a complete configuration whole', () => {
    const values = {
      ...emptyRecurrenceValues(),
      dayKey: 3,
      start: '19:00',
      duration: '120',
      locationNote: ' Court 2 ',
      feeType: 'FIXED' as const,
      feeAmountVnd: '40000',
      feeNote: ' cash ',
      gameMood: 7,
    };
    expect(toRecurrencePayload(values, location, { level: 'A' })).toEqual({
      dayKey: 3,
      startTime: '19:00',
      durationMinutes: 120,
      locationId: location.id,
      locationNote: 'Court 2',
      audience: 'ALL_MEMBERS',
      audienceUserIds: undefined,
      feeType: 'FIXED',
      feeAmountVnd: 40000,
      feeNote: 'cash',
      gameMood: 7,
      attributes: { level: 'A' },
    });
  });

  it('leaves out what is empty (a draft): no location, no duration, no note, no attributes', () => {
    const payload = toRecurrencePayload(emptyRecurrenceValues(), null, undefined);
    expect(payload.locationId).toBeUndefined();
    expect(payload.durationMinutes).toBeUndefined();
    expect(payload.locationNote).toBeUndefined();
    expect(payload.feeNote).toBeUndefined();
    expect(payload.attributes).toBeUndefined();
    expect(payload.feeType).toBe('FREE');
  });

  it('a specific audience sends its member ids, an everyone audience none even with members left in the form', () => {
    const members = [
      { id: 'u1', name: 'Linh', avatarUrl: null },
      { id: 'u2', name: 'Minh', avatarUrl: null },
    ];
    const specific = toRecurrencePayload({ ...emptyRecurrenceValues(), audience: 'SPECIFIC', audienceMembers: members }, location, undefined);
    expect(specific.audienceUserIds).toEqual(['u1', 'u2']);
    const everyone = toRecurrencePayload({ ...emptyRecurrenceValues(), audience: 'ALL_MEMBERS', audienceMembers: members }, location, undefined);
    expect(everyone.audienceUserIds).toBeUndefined();
  });

  it('an amount only goes with a fixed fee', () => {
    const payload = toRecurrencePayload({ ...emptyRecurrenceValues(), feeType: 'SPLIT', feeAmountVnd: '40000' }, location, undefined);
    expect(payload.feeAmountVnd).toBeUndefined();
  });
});
