import type { RecordProblem, TeamIndex } from './recordData';

/** Field ids the record dialog tracks as "touched": a team's players, or one score cell. */
export const playersField = (team: TeamIndex) => `players:${team}`;
export const scoreField = (team: TeamIndex, slot: number) => `score:${team}:${slot}`;

/** The field a problem belongs to, so the dialog can show it once that field was touched (or after Save). */
export function problemField(problem: RecordProblem): string {
  return problem.slot === undefined ? playersField(problem.team) : scoreField(problem.team, problem.slot);
}
