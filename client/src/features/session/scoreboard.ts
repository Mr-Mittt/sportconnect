import { readTeams } from './recordData';
import type { RecordSchema, ScoreboardColumn, ScoreboardSortKey } from './recordSchema';
import type { PlayerNames } from './resultDisplay';
import type { SessionRecord } from './resultTypes';

/**
 * CLIENT-GL-49: the session scoreboard, computed on the client from the session's valid records (the server stores
 * records as sent and never totals them). What is counted and how rows are ordered comes from the sport's
 * `record.scoreboard` (see `recordSchema.ts`); this file is the only owner of the maths.
 *
 * A value is `null` when there is no data for it: a player with no game has no games, wins, losses, win rate or
 * differences; a score column is `null` until a scored record counts for that player. The screen draws `null` as "-".
 */
export interface ScoreboardRow {
  userId: string;
  /** The player's name, or `formerPlayerLabel` when the user is no longer in the roster. */
  name: string;
  games: number | null;
  wins: number | null;
  losses: number | null;
  /** Wins over games, 0 to 1. */
  winRate: number | null;
  /** Wins minus losses. */
  winDiff: number | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  scoreDiff: number | null;
}

interface Tally {
  games: number;
  wins: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  scored: boolean;
}

/**
 * One row per player: every JOINED participant (`joinedIds`), plus anyone named in a record (a player who has since
 * left keeps their games, named `formerPlayerLabel`). `records` are the session's valid records with the winner
 * first (`showableRecords`): the first team of a record won, the second lost.
 *
 * Score columns add a record's score only for the counted slots (`scoreboard.scoreSlot`, else every slot) where both
 * teams filled the slot, so a game logged without scores counts as a game, a win and a loss and adds nothing to them.
 */
export function buildScoreboard({
  schema,
  records,
  joinedIds,
  names,
  formerPlayerLabel,
}: {
  schema: RecordSchema;
  records: SessionRecord[];
  joinedIds: string[];
  names: PlayerNames;
  formerPlayerLabel: string;
}): ScoreboardRow[] {
  const tallies = new Map<string, Tally>();
  const order: string[] = [];
  const remember = (userId: string) => {
    if (!order.includes(userId)) order.push(userId);
  };
  joinedIds.forEach(remember);
  const slots =
    schema.scoreboard.scoreSlot === null
      ? schema.slots.map((_, index) => index)
      : [schema.scoreboard.scoreSlot];

  for (const record of records) {
    const read = readTeams(record.data, schema);
    if (read === null) continue;
    const [winner, loser] = read.teams;
    let winnerScore = 0;
    let loserScore = 0;
    let scored = false;
    for (const slot of slots) {
      const a = winner.scores[slot];
      const b = loser.scores[slot];
      if (a === null || a === undefined || b === null || b === undefined) continue;
      winnerScore += a;
      loserScore += b;
      scored = true;
    }
    const settle = (players: string[], won: boolean, own: number, other: number) => {
      for (const userId of new Set(players)) {
        remember(userId);
        const tally = tallies.get(userId) ?? { games: 0, wins: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, scored: false };
        tally.games += 1;
        if (won) tally.wins += 1;
        else tally.losses += 1;
        if (scored) {
          tally.scoreFor += own;
          tally.scoreAgainst += other;
          tally.scored = true;
        }
        tallies.set(userId, tally);
      }
    };
    settle(winner.players, true, winnerScore, loserScore);
    settle(loser.players, false, loserScore, winnerScore);
  }

  const rows = order.map((userId): ScoreboardRow => {
    const tally = tallies.get(userId);
    const name = names.get(userId)?.name ?? formerPlayerLabel;
    if (tally === undefined) {
      return {
        userId, name, games: null, wins: null, losses: null, winRate: null, winDiff: null,
        scoreFor: null, scoreAgainst: null, scoreDiff: null,
      };
    }
    return {
      userId,
      name,
      games: tally.games,
      wins: tally.wins,
      losses: tally.losses,
      winRate: tally.wins / tally.games,
      winDiff: tally.wins - tally.losses,
      scoreFor: tally.scored ? tally.scoreFor : null,
      scoreAgainst: tally.scored ? tally.scoreAgainst : null,
      scoreDiff: tally.scored ? tally.scoreFor - tally.scoreAgainst : null,
    };
  });

  return sortScoreboard(rows, schema.scoreboard.sort);
}

function valueOf(row: ScoreboardRow, key: ScoreboardSortKey): number | string | null {
  return key === 'name' ? row.name : row[key as ScoreboardColumn];
}

/** Orders rows by the configured keys; a missing value always sorts after a present one, whatever the direction. */
export function sortScoreboard(
  rows: ScoreboardRow[],
  sort: Array<{ by: ScoreboardSortKey; dir: 'ASC' | 'DESC' }>,
): ScoreboardRow[] {
  return [...rows].sort((left, right) => {
    for (const { by, dir } of sort) {
      const a = valueOf(left, by);
      const b = valueOf(right, by);
      if (a === b) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const compared =
        typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : (a as number) - (b as number);
      if (compared !== 0) return dir === 'ASC' ? compared : -compared;
    }
    // Same on every key: players with data first, then by name, so the order never jumps between renders.
    if ((left.games === null) !== (right.games === null)) return left.games === null ? 1 : -1;
    return left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId);
  });
}

const NO_DATA = '-';

/** A signed difference: `+3`, `0`, `-2`. */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** The text of one cell; `-` when there is no data for it, `64%` for a win rate, `+3` for a difference. */
export function formatScoreboardCell(row: ScoreboardRow, column: ScoreboardColumn): string {
  const value = row[column];
  if (value === null) return NO_DATA;
  if (column === 'winRate') return `${Math.round(value * 100)}%`;
  if (column === 'winDiff' || column === 'scoreDiff') return signed(value);
  return String(value);
}
