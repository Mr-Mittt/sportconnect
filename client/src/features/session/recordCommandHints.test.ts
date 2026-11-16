import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import { buildCommandHints, matchingHints } from './recordCommandHints';

const schema = parseRecordSchema(badminton) as RecordSchema;
const labels = { player: 'player', score: 'score', id: 'id' };
const hints = buildCommandHints(schema, labels);

describe('buildCommandHints', () => {
  it('builds the three templates from the schema', () => {
    expect(hints.map((hint) => hint.template)).toEqual([
      ':add @player1 [@player2] [score] vs [score] @player1 [@player2]',
      ':upd <id> @player1 [@player2] [score] vs [score] @player1 [@player2]',
      ':del <id>',
    ]);
  });

  it('leaves the score out for a sport with no scores', () => {
    const none = parseRecordSchema({
      version: 1,
      record: { data: { type: 'COMPETITIVE', playersPerSide: { min: 2, max: 2 } } },
    }) as RecordSchema;
    expect(buildCommandHints(none, labels)[0].template).toBe(':add @player1 @player2 vs @player1 @player2');
  });
});

describe('matchingHints', () => {
  it('shows nothing unless the text starts with a colon', () => {
    expect(matchingHints('', hints)).toEqual([]);
    expect(matchingHints('hello', hints)).toEqual([]);
    expect(matchingHints('a :add', hints)).toEqual([]);
  });

  it('lists every command for ":" and narrows as the command is typed', () => {
    expect(matchingHints(':', hints).map((h) => h.command)).toEqual(['add', 'upd', 'del']);
    expect(matchingHints(':a', hints).map((h) => h.command)).toEqual(['add']);
    expect(matchingHints(':u', hints).map((h) => h.command)).toEqual(['upd']);
    expect(matchingHints(':add @Bao', hints).map((h) => h.command)).toEqual(['add']);
    expect(matchingHints(':x', hints)).toEqual([]);
  });
});
