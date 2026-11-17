import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import { buildScoreboard, formatScoreboardCell, sortScoreboard, type ScoreboardRow } from './scoreboard';
import type { PlayerNames } from './resultDisplay';
import type { SessionRecord } from './resultTypes';

function schemaWith(scoreboard: Record<string, unknown> | undefined, slots = 1): RecordSchema {
  const base = JSON.parse(JSON.stringify(badminton));
  base.record.scoreboard = scoreboard;
  base.record.data.score.slot = Array.from({ length: slots }, (_, index) => ({
    required: index === 0,
    title: { en: `S${index + 1}` },
    rule: '>=0',
  }));
  return parseRecordSchema(base) as RecordSchema;
}

const names: PlayerNames = new Map(
  ['alice', 'bob', 'carol', 'dan'].map((id) => [id, { name: id[0].toUpperCase() + id.slice(1), avatarUrl: null }]),
);

let nextId = 1;
function game(
  first: string[],
  second: string[],
  scores: Array<[number | null, number | null]> = [[21, 18]],
): SessionRecord {
  return {
    id: nextId++,
    data: {
      teams: [
        { players: first, scores: scores.map((pair) => pair[0]) },
        { players: second, scores: scores.map((pair) => pair[1]) },
      ],
    },
    createdBy: 'alice',
    createdAt: '',
    updatedBy: null,
    updatedAt: '',
  };
}

const build = (schema: RecordSchema, records: SessionRecord[], joinedIds = ['alice', 'bob', 'carol', 'dan']) =>
  buildScoreboard({ schema, records, joinedIds, names, formerPlayerLabel: 'Former player' });
const rowOf = (rows: ScoreboardRow[], id: string) => rows.find((row) => row.userId === id) as ScoreboardRow;

describe('buildScoreboard (CLIENT-GL-49)', () => {
  const schema = schemaWith(undefined);

  it('counts games, wins, losses, win rate and win difference; the first team of a record won', () => {
    const rows = build(schema, [game(['alice'], ['bob']), game(['alice'], ['carol']), game(['bob'], ['carol'])]);
    expect(rowOf(rows, 'alice')).toMatchObject({ games: 2, wins: 2, losses: 0, winRate: 1, winDiff: 2 });
    expect(rowOf(rows, 'bob')).toMatchObject({ games: 2, wins: 1, losses: 1, winRate: 0.5, winDiff: 0 });
    expect(rowOf(rows, 'carol')).toMatchObject({ games: 2, wins: 0, losses: 2, winRate: 0, winDiff: -2 });
  });

  it('counts every player of a doubles team, and a player once per record', () => {
    const rows = build(schema, [game(['alice', 'bob'], ['carol', 'dan'])]);
    for (const id of ['alice', 'bob']) expect(rowOf(rows, id)).toMatchObject({ games: 1, wins: 1, losses: 0 });
    for (const id of ['carol', 'dan']) expect(rowOf(rows, id)).toMatchObject({ games: 1, wins: 0, losses: 1 });
    const dup = build(schema, [game(['alice', 'alice'], ['bob'])]);
    expect(rowOf(dup, 'alice').games).toBe(1);
  });

  it('adds score for, against and the difference from the filled scores', () => {
    const rows = build(schema, [game(['alice'], ['bob'], [[21, 18]]), game(['bob'], ['alice'], [[21, 15]])]);
    expect(rowOf(rows, 'alice')).toMatchObject({ scoreFor: 36, scoreAgainst: 39, scoreDiff: -3 });
    expect(rowOf(rows, 'bob')).toMatchObject({ scoreFor: 39, scoreAgainst: 36, scoreDiff: 3 });
  });

  it('counts a game logged without scores as a game, a win and a loss, and no score', () => {
    const rows = build(schema, [game(['alice'], ['bob'], [[null, null]])]);
    expect(rowOf(rows, 'alice')).toMatchObject({
      games: 1,
      wins: 1,
      scoreFor: null,
      scoreAgainst: null,
      scoreDiff: null,
    });
    expect(rowOf(rows, 'bob')).toMatchObject({ games: 1, losses: 1, scoreDiff: null });
  });

  it('mixes scored and unscored games: only the scored one adds to the score columns', () => {
    const rows = build(schema, [game(['alice'], ['bob'], [[null, null]]), game(['alice'], ['bob'], [[21, 10]])]);
    expect(rowOf(rows, 'alice')).toMatchObject({ games: 2, scoreFor: 21, scoreAgainst: 10, scoreDiff: 11 });
  });

  it('sums every score slot by default, or only the slot the sport names', () => {
    const records = [
      game(['alice'], ['bob'], [
        [21, 10],
        [5, 9],
      ]),
    ];
    expect(rowOf(build(schemaWith(undefined, 2), records), 'alice')).toMatchObject({
      scoreFor: 26,
      scoreAgainst: 19,
      scoreDiff: 7,
    });
    expect(rowOf(build(schemaWith({ scoreSlot: 1 }, 2), records), 'alice')).toMatchObject({
      scoreFor: 5,
      scoreAgainst: 9,
      scoreDiff: -4,
    });
    expect(rowOf(build(schemaWith({ scoreSlot: 0 }, 2), records), 'alice')).toMatchObject({
      scoreFor: 21,
      scoreAgainst: 10,
    });
  });

  it('gives a joined player who has not played no data at all', () => {
    const rows = build(schema, [game(['alice'], ['bob'])]);
    expect(rowOf(rows, 'dan')).toMatchObject({
      games: null,
      wins: null,
      losses: null,
      winRate: null,
      winDiff: null,
      scoreFor: null,
      scoreAgainst: null,
      scoreDiff: null,
    });
  });

  it('keeps a player who left (named in a record, not joined) as a former player with their games', () => {
    const rows = build(schema, [game(['alice'], ['ghost'])], ['alice']);
    expect(rowOf(rows, 'ghost')).toMatchObject({ name: 'Former player', games: 1, losses: 1 });
    expect(rows).toHaveLength(2);
  });

  it('has a row for each joined player even with no record at all', () => {
    expect(build(schema, [])).toHaveLength(4);
  });
});

describe('sortScoreboard (CLIENT-GL-49)', () => {
  const row = (name: string, partial: Partial<ScoreboardRow>): ScoreboardRow => ({
    userId: name,
    name,
    games: 1,
    wins: 0,
    losses: 0,
    winRate: 0,
    winDiff: 0,
    scoreFor: null,
    scoreAgainst: null,
    scoreDiff: null,
    ...partial,
  });
  const names_ = (rows: ScoreboardRow[]) => rows.map((r) => r.name);

  it('orders by the keys in turn, in their directions', () => {
    const rows = [row('B', { wins: 1, winDiff: 1 }), row('A', { wins: 1, winDiff: 3 }), row('C', { wins: 2, winDiff: 0 })];
    expect(names_(sortScoreboard(rows, [{ by: 'wins', dir: 'DESC' }, { by: 'winDiff', dir: 'DESC' }]))).toEqual(['C', 'A', 'B']);
    expect(names_(sortScoreboard(rows, [{ by: 'wins', dir: 'ASC' }, { by: 'winDiff', dir: 'ASC' }]))).toEqual(['B', 'A', 'C']);
  });

  it('sorts a missing value after a present one in either direction', () => {
    const rows = [row('A', { scoreDiff: null }), row('B', { scoreDiff: -5 }), row('C', { scoreDiff: 4 })];
    expect(names_(sortScoreboard(rows, [{ by: 'scoreDiff', dir: 'DESC' }]))).toEqual(['C', 'B', 'A']);
    expect(names_(sortScoreboard(rows, [{ by: 'scoreDiff', dir: 'ASC' }]))).toEqual(['B', 'C', 'A']);
  });

  it('sorts by name, and breaks a full tie by players with games first, then name', () => {
    const rows = [row('Zed', {}), row('Amy', {}), row('Idle', { games: null, wins: null })];
    expect(names_(sortScoreboard(rows, [{ by: 'name', dir: 'ASC' }]))).toEqual(['Amy', 'Idle', 'Zed']);
    expect(names_(sortScoreboard(rows, [{ by: 'wins', dir: 'DESC' }]))).toEqual(['Amy', 'Zed', 'Idle']);
  });

  it('uses the default order (wins, win difference, fewer games, name) when the sport sets none', () => {
    const rows = build(
      schemaWith(undefined),
      [game(['bob'], ['alice']), game(['carol'], ['alice']), game(['carol'], ['dan'])],
      ['alice', 'bob', 'carol', 'dan'],
    );
    expect(names_(rows)).toEqual(['Carol', 'Bob', 'Dan', 'Alice']);
  });
});

describe('formatScoreboardCell', () => {
  const row = {
    userId: 'a',
    name: 'A',
    games: 3,
    wins: 2,
    losses: 1,
    winRate: 2 / 3,
    winDiff: 1,
    scoreFor: 40,
    scoreAgainst: 45,
    scoreDiff: -5,
  } as ScoreboardRow;

  it('draws counts plain, the win rate as a percentage and differences signed', () => {
    expect(formatScoreboardCell(row, 'games')).toBe('3');
    expect(formatScoreboardCell(row, 'winRate')).toBe('67%');
    expect(formatScoreboardCell(row, 'winDiff')).toBe('+1');
    expect(formatScoreboardCell(row, 'scoreDiff')).toBe('-5');
    expect(formatScoreboardCell(row, 'scoreFor')).toBe('40');
    expect(formatScoreboardCell({ ...row, winDiff: 0 }, 'winDiff')).toBe('0');
  });

  it('draws "-" when there is no data', () => {
    expect(formatScoreboardCell({ ...row, games: null }, 'games')).toBe('-');
    expect(formatScoreboardCell({ ...row, winRate: null }, 'winRate')).toBe('-');
    expect(formatScoreboardCell({ ...row, scoreDiff: null }, 'scoreDiff')).toBe('-');
  });
});
