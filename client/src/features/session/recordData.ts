import { scoreSatisfies, type RecordSchema } from './recordSchema';
import type { RecordData } from './resultTypes';

/*
 * CLIENT-GL-38: what a COMPETITIVE record's `data` holds, and its validation. The server stores `data`
 * as sent and never reads it, so this file is the only owner of the shape:
 *
 *   { teams: [ { players: [userId], scores: [n | null] }, { players: [...], scores: [...] } ] }
 *
 * The FIRST team is the winner (position, not a flag); `scores` has one entry per schema score slot,
 * `null` = not filled. The user's input is accepted as typed, but on Save `winnerFirst` puts the team with the higher
 * first-slot score first (a team typed on the wrong side swaps with its score), so the stored record always has the
 * winner first and the list draws it on the schema's `winnerAlign` side.
 */

export interface TeamData {
  players: string[];
  scores: Array<number | null>;
}

export interface CompetitiveData {
  teams: [TeamData, TeamData];
}

export type TeamIndex = 0 | 1;

/** A fresh record: two teams with no players and every score slot empty. */
export function emptyRecordData(schema: RecordSchema): RecordData {
  const empty = (): TeamData => ({ players: [], scores: schema.slots.map(() => null) });
  return { teams: [empty(), empty()] };
}

/**
 * Reads a record's `data` tolerantly into two teams (scores padded to the schema's slot count), or
 * `null` when it is not a COMPETITIVE record at all (wrong team count, a player that is not a string,
 * a score that is not an integer or null).
 */
export function readTeams(data: RecordData, schema: RecordSchema): CompetitiveData | null {
  const raw = data.teams;
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const teams: TeamData[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { players, scores } = entry as { players?: unknown; scores?: unknown };
    if (!Array.isArray(players) || !players.every((id) => typeof id === 'string' && id !== ''))
      return null;
    const given = scores === undefined ? [] : scores;
    if (!Array.isArray(given) || !given.every((score) => score === null || Number.isInteger(score)))
      return null;
    teams.push({
      players: players as string[],
      scores: schema.slots.map((_, index) => (given[index] as number | null | undefined) ?? null),
    });
  }
  return { teams: [teams[0], teams[1]] };
}

/** Every user named in a record, sent beside `data` as `playerIds` so the server can check they are JOINED. */
export function playersOf(data: RecordData): string[] {
  const raw = data.teams;
  if (!Array.isArray(raw)) return [];
  const ids = raw.flatMap((team) =>
    typeof team === 'object' && team !== null && Array.isArray((team as TeamData).players)
      ? ((team as TeamData).players.filter((id) => typeof id === 'string') as string[])
      : [],
  );
  return [...new Set(ids)];
}

/** Returns `data` with one team's players replaced. */
export function withPlayers(
  data: RecordData,
  schema: RecordSchema,
  team: TeamIndex,
  players: string[],
): RecordData {
  const read = readTeams(data, schema) ?? (emptyRecordData(schema) as unknown as CompetitiveData);
  const teams: [TeamData, TeamData] = [read.teams[0], read.teams[1]];
  teams[team] = { ...teams[team], players };
  return { teams };
}

/** Returns `data` with one team's score in one slot replaced (`null` clears it). */
export function withScore(
  data: RecordData,
  schema: RecordSchema,
  team: TeamIndex,
  slot: number,
  score: number | null,
): RecordData {
  const read = readTeams(data, schema) ?? (emptyRecordData(schema) as unknown as CompetitiveData);
  const teams: [TeamData, TeamData] = [read.teams[0], read.teams[1]];
  teams[team] = {
    ...teams[team],
    scores: teams[team].scores.map((value, index) => (index === slot ? score : value)),
  };
  return { teams };
}

export type RecordProblemCode =
  /** The record is not readable as a COMPETITIVE record at all. */
  | 'UNREADABLE'
  /** A team has fewer players than `playersPerSide.min`. */
  | 'PLAYERS_MIN'
  /** A team has more players than `playersPerSide.max` (only a stored record can). */
  | 'PLAYERS_MAX'
  /** The same player is on both teams (BA GL-4). */
  | 'PLAYER_BOTH_TEAMS'
  /** A score is missing: the other team has this slot filled, or a required slot of a team that has a score. */
  | 'SCORE_MISSING'
  /** A filled score fails its slot's `rule`. */
  | 'SCORE_RULE';

/** One thing wrong in a record; the dialog puts the red border on that team's players or that score cell. */
export interface RecordProblem {
  code: RecordProblemCode;
  team: TeamIndex;
  /** The score slot, for `SCORE_MISSING` and `SCORE_RULE`. */
  slot?: number;
}

/**
 * Checks a record against the sport's schema. Scores are optional as a whole, but a score has to be
 * complete: for each slot both teams fill it or neither does, a filled score satisfies the slot's rule,
 * and a team that has any score filled fills all of its required slots. Returns every problem (empty
 * list = valid), the same checks serve the red borders while typing, on Save, and the skip-on-load of a
 * stored record that fails them.
 */
export function validateRecord(schema: RecordSchema, data: RecordData): RecordProblem[] {
  const read = readTeams(data, schema);
  if (read === null) return [{ code: 'UNREADABLE', team: 0 }];
  const problems: RecordProblem[] = [];
  const add = (problem: RecordProblem) => {
    if (
      !problems.some(
        (p) => p.code === problem.code && p.team === problem.team && p.slot === problem.slot,
      )
    ) {
      problems.push(problem);
    }
  };

  const [first, second] = read.teams;
  ([0, 1] as const).forEach((team) => {
    const count = read.teams[team].players.length;
    if (count < schema.playersPerSide.min) add({ code: 'PLAYERS_MIN', team });
    if (count > schema.playersPerSide.max) add({ code: 'PLAYERS_MAX', team });
  });
  if (first.players.some((id) => second.players.includes(id))) {
    add({ code: 'PLAYER_BOTH_TEAMS', team: 0 });
    add({ code: 'PLAYER_BOTH_TEAMS', team: 1 });
  }

  schema.slots.forEach((slot, index) => {
    ([0, 1] as const).forEach((team) => {
      const mine = read.teams[team].scores[index];
      const other = read.teams[team === 0 ? 1 : 0].scores[index];
      if (mine !== null && !scoreSatisfies(slot.rule, mine))
        add({ code: 'SCORE_RULE', team, slot: index });
      if (mine === null && other !== null) add({ code: 'SCORE_MISSING', team, slot: index });
      const hasAnyScore = read.teams[team].scores.some((score) => score !== null);
      if (mine === null && slot.required && hasAnyScore)
        add({ code: 'SCORE_MISSING', team, slot: index });
    });
  });
  return problems;
}

/**
 * Puts the winner first (owner, 2026-11-14). The user may type the winning score on either side; on Save the team with
 * the higher score in the first score slot (the main point) becomes the first team, taking its players and all its scores
 * with it. A tie, a missing first score on either team, or a record that cannot be read is returned as it is.
 */
export function winnerFirst(schema: RecordSchema, data: RecordData): RecordData {
  const read = readTeams(data, schema);
  if (read === null) return data;
  const [first, second] = read.teams;
  const a = first.scores[0];
  const b = second.scores[0];
  if (a === null || b === null || b <= a) return data;
  return { ...data, teams: [second, first] };
}
