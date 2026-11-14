import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import {
  emptyRecordData,
  playersOf,
  readTeams,
  validateRecord,
  winnerFirst,
  withPlayers,
  withScore,
  type RecordProblem,
} from './recordData';
import type { RecordData } from './resultTypes';

const schema = parseRecordSchema(badminton) as RecordSchema;

/** Football-like: two slots (main required, penalty optional). */
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

function record(
  a: string[],
  b: string[],
  sa: Array<number | null>,
  sb: Array<number | null>,
): RecordData {
  return {
    teams: [
      { players: a, scores: sa },
      { players: b, scores: sb },
    ],
  };
}

function codes(problems: RecordProblem[]): string[] {
  return problems
    .map((p) => `${p.code}:${p.team}${p.slot === undefined ? '' : `:${p.slot}`}`)
    .sort();
}

describe('emptyRecordData / readTeams', () => {
  it('makes two empty teams with one null score per slot', () => {
    expect(emptyRecordData(twoSlots)).toEqual({
      teams: [
        { players: [], scores: [null, null] },
        { players: [], scores: [null, null] },
      ],
    });
  });

  it('pads scores to the slot count and reads a missing scores field as no scores', () => {
    const read = readTeams(
      { teams: [{ players: ['a'] }, { players: ['b'], scores: [3] }] },
      twoSlots,
    );
    expect(read?.teams[0].scores).toEqual([null, null]);
    expect(read?.teams[1].scores).toEqual([3, null]);
  });

  it.each([
    ['not two teams', { teams: [{ players: ['a'], scores: [] }] }],
    ['no teams', {}],
    [
      'a player that is not a string',
      {
        teams: [
          { players: [1], scores: [] },
          { players: ['b'], scores: [] },
        ],
      },
    ],
    [
      'a fractional score',
      {
        teams: [
          { players: ['a'], scores: [1.5] },
          { players: ['b'], scores: [1] },
        ],
      },
    ],
  ])('is unreadable for %s', (_label, data) => {
    expect(readTeams(data as RecordData, schema)).toBeNull();
    expect(codes(validateRecord(schema, data as RecordData))).toEqual(['UNREADABLE:0']);
  });
});

describe('validateRecord (badminton: 1 to 2 players a side, one required Point > 0)', () => {
  it('accepts a complete record, with or without scores', () => {
    expect(validateRecord(schema, record(['a'], ['b'], [21], [18]))).toEqual([]);
    expect(validateRecord(schema, record(['a', 'c'], ['b'], [null], [null]))).toEqual([]);
  });

  it('flags a team below the minimum players', () => {
    expect(codes(validateRecord(schema, record(['a'], [], [null], [null])))).toEqual([
      'PLAYERS_MIN:1',
    ]);
    expect(codes(validateRecord(schema, record([], [], [null], [null])))).toEqual([
      'PLAYERS_MIN:0',
      'PLAYERS_MIN:1',
    ]);
  });

  it('flags a team above the maximum players (a stored record)', () => {
    expect(codes(validateRecord(schema, record(['a', 'b', 'c'], ['d'], [null], [null])))).toEqual([
      'PLAYERS_MAX:0',
    ]);
  });

  it('flags a player on both teams on both teams', () => {
    expect(codes(validateRecord(schema, record(['a'], ['a'], [null], [null])))).toEqual([
      'PLAYER_BOTH_TEAMS:0',
      'PLAYER_BOTH_TEAMS:1',
    ]);
  });

  it('flags a score on one team only: the other team misses it', () => {
    expect(codes(validateRecord(schema, record(['a'], ['b'], [21], [null])))).toEqual([
      'SCORE_MISSING:1:0',
    ]);
    expect(codes(validateRecord(schema, record(['a'], ['b'], [null], [18])))).toEqual([
      'SCORE_MISSING:0:0',
    ]);
  });

  it('flags a score failing the rule (0 is not above zero) and still accepts the user input otherwise', () => {
    expect(codes(validateRecord(schema, record(['a'], ['b'], [0], [18])))).toEqual([
      'SCORE_RULE:0:0',
    ]);
    // the winner (first team) scoring less is the user's call: no problem
    expect(validateRecord(schema, record(['a'], ['b'], [5], [21]))).toEqual([]);
  });

  it('reports one score problem per cell, not two', () => {
    expect(codes(validateRecord(schema, record(['a'], ['b'], [0], [null])))).toEqual([
      'SCORE_MISSING:1:0',
      'SCORE_RULE:0:0',
    ]);
  });
});

describe('validateRecord with two score slots (main required, penalty optional)', () => {
  it('needs every required slot once a team has any score', () => {
    const data = record(['a'], ['b'], [null, 3], [null, 2]);
    expect(codes(validateRecord(twoSlots, data))).toEqual([
      'SCORE_MISSING:0:0',
      'SCORE_MISSING:1:0',
    ]);
  });

  it('accepts the optional slot empty on both teams', () => {
    expect(validateRecord(twoSlots, record(['a'], ['b'], [2, null], [1, null]))).toEqual([]);
  });

  it('keeps the pair rule for the optional slot: filled on one team only is missing on the other', () => {
    expect(codes(validateRecord(twoSlots, record(['a'], ['b'], [2, 4], [1, null])))).toEqual([
      'SCORE_MISSING:1:1',
    ]);
  });

  it('checks each slot against its own rule', () => {
    expect(codes(validateRecord(twoSlots, record(['a'], ['b'], [2, 21], [1, 3])))).toEqual([
      'SCORE_RULE:0:1',
    ]);
  });
});

describe('a sport without scores', () => {
  const noScores = parseRecordSchema({
    version: 1,
    record: { data: { type: 'COMPETITIVE', playersPerSide: { min: 1, max: 1 } } },
  }) as RecordSchema;
  it('validates the players only', () => {
    expect(validateRecord(noScores, record(['a'], ['b'], [], []))).toEqual([]);
    expect(codes(validateRecord(noScores, record(['a'], [], [], [])))).toEqual(['PLAYERS_MIN:1']);
  });
});

describe('editing helpers and playersOf', () => {
  it('sets a team players or a score without touching the rest', () => {
    let data = emptyRecordData(schema);
    data = withPlayers(data, schema, 0, ['a', 'b']);
    data = withPlayers(data, schema, 1, ['c']);
    data = withScore(data, schema, 1, 0, 18);
    expect(data).toEqual(record(['a', 'b'], ['c'], [null], [18]));
    expect(withScore(data, schema, 1, 0, null)).toEqual(record(['a', 'b'], ['c'], [null], [null]));
  });

  it('lists every distinct player of both teams, tolerating a broken record', () => {
    expect(playersOf(record(['a', 'b'], ['b', 'c'], [], []))).toEqual(['a', 'b', 'c']);
    expect(playersOf({})).toEqual([]);
  });
});

describe('winnerFirst', () => {
  const data = (first: number | null, second: number | null): RecordData => ({
    teams: [
      { players: ['a'], scores: [first] },
      { players: ['b'], scores: [second] },
    ],
  });

  it('swaps the teams, players and scores together when the second team scored higher', () => {
    expect(winnerFirst(schema, data(15, 21))).toEqual({
      teams: [
        { players: ['b'], scores: [21] },
        { players: ['a'], scores: [15] },
      ],
    });
  });

  it('keeps the record when the first team scored higher, on a tie, or when a score is missing', () => {
    const win = data(21, 15);
    expect(winnerFirst(schema, win)).toBe(win);
    const tie = data(20, 20);
    expect(winnerFirst(schema, tie)).toBe(tie);
    const missing = data(null, 21);
    expect(winnerFirst(schema, missing)).toBe(missing);
    const none = data(null, null);
    expect(winnerFirst(schema, none)).toBe(none);
  });

  it('compares the first score slot only', () => {
    const two = parseRecordSchema({
      ...(badminton as object),
      record: {
        ...(badminton as { record: { data: { score: { slot: unknown[] } } } }).record,
        data: {
          ...(badminton as { record: { data: object } }).record.data,
          score: {
            slot: [
              { required: true, title: { en: 'Goals', vi: 'Ban' }, rule: '' },
              { required: false, title: { en: 'Penalties', vi: 'Luan' }, rule: '' },
            ],
          },
        },
      },
    }) as RecordSchema;
    const record: RecordData = {
      teams: [
        { players: ['a'], scores: [2, 1] },
        { players: ['b'], scores: [2, 9] },
      ],
    };
    expect(winnerFirst(two, record)).toBe(record);
  });

  it('leaves an unreadable record alone', () => {
    const odd: RecordData = { teams: 'x' };
    expect(winnerFirst(schema, odd)).toBe(odd);
  });
});
