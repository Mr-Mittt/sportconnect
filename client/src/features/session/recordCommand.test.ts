import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import { commandNameOf, commandText, mentionPlayers, parseCommand, type CommandContext } from './recordCommand';

const schema = parseRecordSchema(badminton) as RecordSchema;

const twoSlots = parseRecordSchema({
  version: 1,
  record: {
    data: {
      type: 'COMPETITIVE',
      playersPerSide: { min: 1, max: 2 },
      score: {
        slot: [
          { required: true, title: { en: 'Goals' }, rule: '>=0' },
          { required: false, title: { en: 'Penalties' }, rule: '>=0&<=20' },
        ],
      },
    },
  },
}) as RecordSchema;

const noScores = parseRecordSchema({
  version: 1,
  record: { data: { type: 'COMPETITIVE', playersPerSide: { min: 1, max: 2 } } },
}) as RecordSchema;

const players = mentionPlayers([
  { id: 'u-bao', name: 'Bao' },
  { id: 'u-an', name: 'An' },
  { id: 'u-anh', name: 'Anh Tuấn' },
  { id: 'u-binh', name: 'Bình' },
  { id: 'u-chi', name: 'Chi' },
]);

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return { schema, players, records: [{ id: 7 }, { id: 12 }], ...overrides };
}

/** The tests write `@Name`; a command now carries a tag chip per player, so each `@token` becomes the chip of that player. */
function parse(text: string, ctx: CommandContext) {
  let out = text;
  for (const player of [...ctx.players].sort((a, b) => b.token.length - a.token.length)) {
    const escaped = player.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(`@${escaped}(?=\\s|$)`, 'gi'),
      commandText([{ kind: 'mention', userId: player.id, name: player.name }]),
    );
  }
  return parseCommand(out, ctx);
}

describe('commandNameOf', () => {
  it('recognizes only a first word that is exactly :add, :upd or :del', () => {
    expect(commandNameOf(':add @Bao')).toBe('add');
    expect(commandNameOf(':upd 7 x')).toBe('upd');
    expect(commandNameOf(':del 7')).toBe('del');
    expect(commandNameOf(':add')).toBe('add');
    expect(commandNameOf(':added')).toBeNull();
    expect(commandNameOf(':ADD x')).toBeNull();
    expect(commandNameOf(' :add x')).toBeNull();
    expect(commandNameOf('hello :add')).toBeNull();
    expect(commandNameOf(':other')).toBeNull();
    expect(commandNameOf('add')).toBeNull();
  });
});

describe('mentionPlayers', () => {
  it('uses the full name as it is, with no (1), (2) when several participants share it (a chip carries the id)', () => {
    const list = mentionPlayers([
      { id: 'a', name: 'Nam' },
      { id: 'b', name: 'Lan' },
      { id: 'c', name: 'nam' },
    ]);
    expect(list.map((p) => p.token)).toEqual(['Nam', 'Lan', 'nam']);
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('parseCommand :add', () => {
  it('builds a record with scores, players matched by full name', () => {
    const result = parse(':add @Bao @An 23 vs 19 @Bình @Chi', context());
    expect(result).toEqual({
      ok: true,
      operation: {
        kind: 'add',
        playerIds: ['u-bao', 'u-an', 'u-binh', 'u-chi'],
        data: {
          teams: [
            { players: ['u-bao', 'u-an'], scores: [23] },
            { players: ['u-binh', 'u-chi'], scores: [19] },
          ],
        },
      },
    });
  });

  it('matches names with spaces and diacritics, ignoring case', () => {
    const result = parse(':add @anh tuấn 21 vs 15 @bình', context());
    expect(result.ok).toBe(true);
  });

  it('does not take @An for the start of @Anh Tuấn', () => {
    const result = parse(':add @An 21 vs 15 @Anh Tuấn', context());
    expect(result).toMatchObject({
      ok: true,
      operation: { data: { teams: [{ players: ['u-an'] }, { players: ['u-anh'] }] } },
    });
  });

  it('puts the winner first: a team typed on the wrong side swaps with its score', () => {
    const result = parse(':add @Bao 15 vs 21 @An', context());
    expect(result).toMatchObject({
      ok: true,
      operation: {
        data: {
          teams: [
            { players: ['u-an'], scores: [21] },
            { players: ['u-bao'], scores: [15] },
          ],
        },
      },
    });
  });

  it('reads comma-separated scores per slot, optional slots may be left out', () => {
    const both = parse(':add @Bao 3,2 vs 1,0 @An', context({ schema: twoSlots }));
    expect(both).toMatchObject({
      ok: true,
      operation: { data: { teams: [{ scores: [3, 2] }, { scores: [1, 0] }] } },
    });
    const first = parse(':add @Bao 3 vs 1 @An', context({ schema: twoSlots }));
    expect(first).toMatchObject({
      ok: true,
      operation: { data: { teams: [{ scores: [3, null] }, { scores: [1, null] }] } },
    });
  });

  it('accepts a sport with no scores, and rejects a score for it', () => {
    expect(parse(':add @Bao vs @An', context({ schema: noScores })).ok).toBe(true);
    const result = parse(':add @Bao 3 vs @An', context({ schema: noScores }));
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'SCORE_FORMAT', team: 1 }] });
  });

  it('reports the dialog problems with the team number', () => {
    // scores are optional as a whole, but a score has to be complete
    expect(parse(':add @Bao vs @An', context()).ok).toBe(true);
    expect(parse(':add @Bao 21 vs @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'SCORE_MISSING', team: 2, slot: 0 }],
    });
    expect(parse(':add @Bao 0 vs 5 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'SCORE_RULE', team: 1, slot: 0 }],
    });
    expect(parse(':add @Bao 21 vs 15 @Bao', context())).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([{ code: 'PLAYER_BOTH_TEAMS', team: 1 }]),
    });
    expect(parse(':add 21 vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'PLAYERS_MIN', team: 1 }],
    });
    expect(parse(':add @Bao @An @Chi 21 vs 15 @Bình', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'PLAYERS_MAX', team: 1 }],
    });
  });

  it('reports parse errors: missing or repeated vs, unknown and repeated players, misplaced text', () => {
    expect(parse(':add @Bao 21', context())).toMatchObject({ ok: false, issues: [{ code: 'VS_MISSING' }] });
    expect(parse(':add', context())).toMatchObject({ ok: false, issues: [{ code: 'VS_MISSING' }] });
    expect(parse(':add @Bao vs @An vs @Chi', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'VS_MULTIPLE' }],
    });
    expect(parse(':add @Zed 21 vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'PLAYER_UNKNOWN', team: 1, text: 'Zed' }],
    });
    expect(parse(':add @Bao @Bao 21 vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'PLAYER_REPEATED', team: 1, text: 'Bao' }],
    });
    expect(parse(':add @Bao hello 21 vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'TEXT_UNEXPECTED', team: 1, text: 'hello' }],
    });
    // scores sit between the players and `vs` on the left, between `vs` and the players on the right
    expect(parse(':add 21 @Bao vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'TEXT_UNEXPECTED', team: 1, text: '@Bao' }],
    });
    expect(parse(':add @Bao 21 vs @An 15', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'TEXT_UNEXPECTED', team: 2, text: '15' }],
    });
  });

  it('names a person by the chip id: two people with one name, and "Bao" next to "Bao 15", never mix up', () => {
    const shared = mentionPlayers([
      { id: 'a', name: 'Nam' },
      { id: 'b', name: 'Nam' },
      { id: 'c', name: 'Lan' },
      { id: 'd', name: 'Bao 15' },
      { id: 'e', name: 'Bao' },
    ]);
    const chips = commandText([
      { kind: 'text', text: ':add ' },
      { kind: 'mention', userId: 'b', name: 'Nam' },
      { kind: 'text', text: ' 21 vs 15 ' },
      { kind: 'mention', userId: 'c', name: 'Lan' },
    ]);
    expect(parseCommand(chips, context({ players: shared }))).toMatchObject({
      ok: true,
      operation: { playerIds: ['b', 'c'] },
    });
    // The chip "Bao" followed by the text 15 is Bao with a score of 15, never the player "Bao 15".
    const score = commandText([
      { kind: 'text', text: ':add ' },
      { kind: 'mention', userId: 'e', name: 'Bao' },
      { kind: 'text', text: ' 15 vs 6 ' },
      { kind: 'mention', userId: 'c', name: 'Lan' },
    ]);
    expect(parseCommand(score, context({ players: shared }))).toMatchObject({
      ok: true,
      operation: { playerIds: ['e', 'c'], data: { teams: [{ players: ['e'], scores: [15] }, { players: ['c'], scores: [6] }] } },
    });
  });

  it('refuses an @name that was typed or pasted without being picked, and a chip of someone who cannot be named', () => {
    expect(parseCommand(':add @Bao 21 vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [
        { code: 'PLAYER_UNKNOWN', team: 1, text: 'Bao' },
        { code: 'PLAYER_UNKNOWN', team: 2, text: 'An' },
      ],
    });
    const stranger = commandText([
      { kind: 'text', text: ':add ' },
      { kind: 'mention', userId: 'u-nobody', name: 'Zed (the) one' },
      { kind: 'text', text: ' 21 vs 15 ' },
      { kind: 'mention', userId: 'u-an', name: 'An' },
    ]);
    expect(parseCommand(stranger, context())).toMatchObject({
      ok: false,
      issues: [{ code: 'PLAYER_UNKNOWN', team: 1, text: 'Zed (the) one' }],
    });
  });
});

describe('parseCommand :upd and :del', () => {
  it('builds an update for an existing record id', () => {
    expect(parse(':upd 12 @Bao 21 vs 15 @An', context())).toMatchObject({
      ok: true,
      operation: { kind: 'upd', id: 12, playerIds: ['u-bao', 'u-an'] },
    });
  });

  it('builds a delete', () => {
    expect(parse(':del 7', context())).toEqual({ ok: true, operation: { kind: 'del', id: 7 } });
  });

  it('refuses a missing, malformed or unknown id', () => {
    expect(parse(':del', context())).toMatchObject({ ok: false, issues: [{ code: 'ID_MISSING' }] });
    expect(parse(':upd', context())).toMatchObject({ ok: false, issues: [{ code: 'ID_MISSING' }] });
    expect(parse(':del #7', context())).toMatchObject({ ok: false, issues: [{ code: 'ID_INVALID', text: '#7' }] });
    expect(parse(':del x', context())).toMatchObject({ ok: false, issues: [{ code: 'ID_INVALID' }] });
    expect(parse(':del 99', context())).toMatchObject({ ok: false, issues: [{ code: 'ID_NOT_FOUND', text: '99' }] });
    expect(parse(':upd 99 @Bao 21 vs 15 @An', context())).toMatchObject({
      ok: false,
      issues: [{ code: 'ID_NOT_FOUND' }],
    });
  });

  it('refuses extra text after :del and a bad record after :upd', () => {
    expect(parse(':del 7 now', context())).toMatchObject({ ok: false, issues: [{ code: 'EXTRA_TEXT', text: 'now' }] });
    expect(parse(':upd 7 @Bao 21 vs @An', context())).toMatchObject({ ok: false });
  });
});
