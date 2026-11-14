import { cn } from '@/shared/lib/utils';
import { slotTitle, type RecordSchema } from '../recordSchema';
import {
  emptyRecordData,
  readTeams,
  withPlayers,
  withScore,
  type RecordProblem,
  type TeamIndex,
} from '../recordData';
import { playersField, problemField, scoreField } from '../recordFields';
import { teamDisplayOrder, type PlayerNames } from '../resultDisplay';
import type { RecordData } from '../resultTypes';
import { DigitsOnlyInput } from './DigitsOnlyInput';
import { PlayerSelect, type PlayerOption } from './PlayerSelect';

interface RecordEditorCellsProps {
  schema: RecordSchema;
  data: RecordData;
  /** Who can be picked: the session's JOINED participants, in roster order. */
  playerIds: string[];
  names: PlayerNames;
  locale: 'en' | 'vi';
  /** The problems to show now (already filtered to touched fields, or all after a Save attempt): they only color borders. */
  problems: RecordProblem[];
  disabled?: boolean;
  /** The record as last saved: a field that differs from it takes the focus-colored border. `null` for a new row. */
  initialData?: RecordData | null;
  /** A row marked for deletion: the same fields, gray and struck through, not editable. */
  deleted?: boolean;
  onChange: (data: RecordData, touched: string[]) => void;
  text: {
    teamWinner: string;
    teamLoser: string;
    addPlayer: string;
    clearPlayer: string;
    formerPlayer: string;
    slotLabel: (team: string, n: number) => string;
    scoreLabel: (team: string, slot: string) => string;
  };
}

const INVALID_BORDER = 'border-2 border-text-danger';

/**
 * CLIENT-GL-38: the four middle cells of one record row of the dialog's table (the dialog adds the index cell before
 * and the action cell after): `team 1 | score 1 - score 2 | team 2`, vertically centered, in the order the sport's
 * schema draws the winner (the first team in the data; `winnerAlign` RIGHT or BOTTOM puts it last).
 *
 * A team cell has `playersPerSide.max` player dropdowns stacked (no add button: every slot is there). A dropdown is a
 * plain native `<select>` (a popover would misbehave inside the session modal): it lists the session's joined players
 * that are not already in this record, plus the one it holds, and its first option adds or clears the slot. A score
 * cell stacks one number input per score slot, top to bottom, the slot's title as its placeholder. A field with a
 * problem gets a red border; the dialog writes the messages under the row.
 */
export function RecordEditorCells({
  schema,
  data,
  playerIds,
  names,
  locale,
  problems,
  disabled = false,
  initialData = null,
  deleted = false,
  onChange,
  text,
}: RecordEditorCellsProps) {
  const read = readTeams(data, schema) ?? readTeams(emptyRecordData(schema), schema);
  if (read === null) return null;
  const teams = read.teams;
  const initialTeams = initialData === null ? null : readTeams(initialData, schema);
  const order = teamDisplayOrder(schema);
  const { max } = schema.playersPerSide;
  const taken = new Set(teams.flatMap((team) => team.players));
  const hasProblem = (field: string) => problems.some((problem) => problemField(problem) === field);
  // Once anything is typed or picked in the record, the placeholders of its other fields are cleaned up (owner, 2026-11-13).
  const hasInput = teams.some(
    (team) => team.players.length > 0 || team.scores.some((score) => score !== null),
  );
  const labelOf = (team: TeamIndex) => (team === 0 ? text.teamWinner : text.teamLoser);

  const setSlot = (team: TeamIndex, index: number, userId: string) => {
    const players = [...teams[team].players];
    if (userId === '') players.splice(index, 1);
    else if (index < players.length) players[index] = userId;
    else players.push(userId);
    onChange(withPlayers(data, schema, team, players), [playersField(team)]);
  };

  // `position` 0 is the left team of the row, 1 the right one: the right team's values are right-aligned, its avatar on the right.
  const playersCell = (team: TeamIndex, position: 0 | 1) => {
    const right = position === 1;
    return (
      <td className="px-0.5 py-1 align-middle" data-team={team === 0 ? 'winner' : 'loser'}>
        <div className="flex flex-col gap-1">
          {Array.from({ length: max }, (_, index) => {
            const userId = teams[team].players[index];
            // Every empty slot adds at the end, so each empty slot after the first one adds to the same place.
            const slotIndex = Math.min(index, teams[team].players.length);
            const options = playerIds.filter((id) => id === userId || !taken.has(id));
            if (userId !== undefined && !options.includes(userId)) options.push(userId);
            // A missing player looks like a missing score: only the empty slots the team still needs get the red border.
            const missing =
              userId === undefined &&
              index < schema.playersPerSide.min &&
              problems.some((problem) => problem.team === team && problem.code === 'PLAYERS_MIN');
            // Too many players, or one on both teams, is a problem of the whole team; too few only of the empty slots.
            const teamLevel = problems.some(
              (problem) =>
                problem.team === team &&
                (problem.code === 'PLAYERS_MAX' || problem.code === 'PLAYER_BOTH_TEAMS'),
            );
            const invalid = missing || teamLevel;
            const toOption = (id: string): PlayerOption => ({
              id,
              name: names.get(id)?.name ?? text.formerPlayer,
              avatarUrl: names.get(id)?.avatarUrl ?? null,
            });
            const edited =
              initialTeams !== null &&
              (initialTeams.teams[team].players[index] ?? undefined) !== userId;
            return (
              <PlayerSelect
                key={index}
                value={userId}
                selected={userId === undefined ? undefined : toOption(userId)}
                options={options.map(toOption)}
                side={right ? 'right' : 'left'}
                invalid={!deleted && invalid}
                edited={!deleted && edited}
                deleted={deleted}
                placeholder={hasInput ? '' : text.addPlayer}
                clearLabel={text.clearPlayer}
                ariaLabel={text.slotLabel(labelOf(team), index + 1)}
                onChange={(id) => setSlot(team, slotIndex, id)}
              />
            );
          })}
        </div>
      </td>
    );
  };

  // The dash sits in the gap between the two score cells; both cells have the same width (their inner padding differs only on the gap side).
  const scoresCell = (team: TeamIndex, position: 0 | 1) => (
    <td
      className={cn('relative py-1 align-middle', position === 0 ? 'pr-2 pl-0.5' : 'pr-0.5 pl-2')}
    >
      {position === 0 && (
        <span
          className="pointer-events-none absolute top-1/2 -right-2 w-4 -translate-y-1/2 text-center text-2xs text-text-muted"
          aria-hidden="true"
        >
          –
        </span>
      )}
      <div className="flex flex-col gap-1">
        {schema.slots.map((slot, index) => {
          const title = slotTitle(slot, index, locale);
          const invalid = !deleted && hasProblem(scoreField(team, index));
          const edited =
            !deleted &&
            initialTeams !== null &&
            (initialTeams.teams[team].scores[index] ?? null) !==
              (teams[team].scores[index] ?? null);
          return (
            <DigitsOnlyInput
              key={index}
              inputMode="numeric"
              min={0}
              value={teams[team].scores[index] ?? ''}
              disabled={disabled || deleted}
              placeholder={hasInput ? '' : title}
              title={title}
              aria-label={text.scoreLabel(labelOf(team), title)}
              aria-invalid={invalid || undefined}
              data-edited={edited || undefined}
              className={cn(
                'h-8 w-full min-w-0 bg-surface-2 px-1 text-center text-2xs placeholder:text-text-muted placeholder:italic',
                edited && 'border-border-accent ring-3 ring-bg-accent',
                invalid && INVALID_BORDER,
                deleted && 'bg-surface-1 text-text-muted line-through disabled:opacity-100',
              )}
              onChange={(event) => {
                const raw = event.target.value;
                const score = raw === '' ? null : Number(raw);
                onChange(withScore(data, schema, team, index, score), [
                  scoreField(0, index),
                  scoreField(1, index),
                ]);
              }}
            />
          );
        })}
      </div>
    </td>
  );

  return (
    <>
      {playersCell(order[0], 0)}
      {scoresCell(order[0], 0)}
      {scoresCell(order[1], 1)}
      {playersCell(order[1], 1)}
    </>
  );
}
