import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import { showableRecords } from './showableRecords';
import type { SessionRecord } from './resultTypes';

const schema = parseRecordSchema(badminton) as RecordSchema;

function record(id: number, first: number, second: number): SessionRecord {
  return {
    id,
    data: {
      teams: [
        { players: ['a'], scores: [first] },
        { players: ['b'], scores: [second] },
      ],
    },
    createdBy: 'a',
    createdAt: '2026-08-01T10:00:00Z',
    updatedBy: null,
    updatedAt: '2026-08-01T10:00:00Z',
  };
}

describe('showableRecords', () => {
  it('puts the winner first in a record stored the other way round, with its players and scores', () => {
    const [shown] = showableRecords(schema, [record(1, 15, 21)]);
    expect(shown.data).toEqual({
      teams: [
        { players: ['b'], scores: [21] },
        { players: ['a'], scores: [15] },
      ],
    });
  });

  it('leaves a record that already has the winner first as it is (same object)', () => {
    const original = record(1, 21, 15);
    expect(showableRecords(schema, [original])[0]).toBe(original);
  });

  it('still skips a record that fails the schema', () => {
    expect(showableRecords(schema, [record(1, 0, 0)])).toEqual([]);
  });
});
