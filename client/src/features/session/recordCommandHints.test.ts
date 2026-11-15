import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import { mentionPlayers } from './recordCommand';
import {
  activeMention,
  buildCommandHints,
  insertMention,
  matchingHints,
  mentionOptions,
} from './recordCommandHints';

const schema = parseRecordSchema(badminton) as RecordSchema;
const labels = { player: 'player', score: 'score', id: 'id' };
const hints = buildCommandHints(schema, labels);
const players = mentionPlayers([
  { id: 'u-bao', name: 'Bao' },
  { id: 'u-an', name: 'An' },
  { id: 'u-anh', name: 'Anh Tuấn' },
]);

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

describe('@ mentions', () => {
  it('finds the @ word at the caret only inside a command candidate', () => {
    expect(activeMention(':add @Ba', 8)).toEqual({ start: 5, query: 'Ba' });
    expect(activeMention(':add @', 6)).toEqual({ start: 5, query: '' });
    expect(activeMention(':add @Anh T', 11)).toEqual({ start: 5, query: 'Anh T' });
    expect(activeMention('hello @Ba', 9)).toBeNull();
    expect(activeMention(':add mail@Ba', 12)).toBeNull();
    expect(activeMention(':add Bao', 8)).toBeNull();
  });

  it('offers the players whose name contains the query, minus the ones already named', () => {
    const text = ':add @Bao @An ';
    const typing = ':add @Bao @An @A';
    const mention = activeMention(typing, typing.length)!;
    expect(mentionOptions(typing, mention, players).map((p) => p.id)).toEqual(['u-anh']);
    expect(text).toContain('@An');
    const open = ':add @';
    expect(mentionOptions(open, activeMention(open, open.length)!, players).map((p) => p.id)).toEqual([
      'u-bao',
      'u-an',
      'u-anh',
    ]);
  });

  it('inserts the picked player and moves the caret after it', () => {
    const text = ':add @An vs';
    const mention = activeMention(text, 8)!;
    expect(insertMention(text, 8, mention, players[2])).toEqual({
      text: ':add @Anh Tuấn vs',
      caret: 15,
    });
  });
});
