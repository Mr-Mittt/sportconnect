import { cn } from '@/shared/lib/utils';
import { slotTitle, type RecordSchema } from '../recordSchema';
import { readTeams, type TeamIndex } from '../recordData';
import {
  formatScoreCell,
  formatTeamNames,
  teamDisplayOrder,
  TONE_CLASSES,
  type PlayerNames,
} from '../resultDisplay';
import type { RecordData } from '../resultTypes';

const ROW_GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-1.5';

/**
 * The Winner / Loser labels above the list, in the schema's tones, aligned like the teams below them: the left label
 * right-aligned over the left team, the right label left-aligned over the right team (same grid as a record line).
 */
export function RecordListHeader({
  schema,
  text,
}: {
  schema: RecordSchema;
  text: { teamWinner: string; teamLoser: string };
}) {
  const order = teamDisplayOrder(schema);
  const label = (index: TeamIndex, align: 'text-right' | 'text-left') => (
    <span
      data-header-team={index === 0 ? 'winner' : 'loser'}
      className={cn(
        'min-w-0 truncate text-2xs font-semibold underline',
        align,
        TONE_CLASSES[index === 0 ? schema.ui.winnerTone : schema.ui.loserTone].label,
      )}
    >
      {index === 0 ? text.teamWinner : text.teamLoser}
    </span>
  );
  return (
    <div
      className={cn(ROW_GRID, 'border-hairline border-transparent')}
      data-testid="record-list-header"
      aria-hidden="true"
    >
      <span />
      {label(order[0], 'text-right')}
      <span className="invisible">–</span>
      {label(order[1], 'text-left')}
    </div>
  );
}

interface RecordCardProps {
  schema: RecordSchema;
  data: RecordData;
  /** The record's number in the list (#n). */
  number: number;
  names: PlayerNames;
  locale: 'en' | 'vi';
  /** Copy for the "Former player" fallback. */
  text: { formerPlayer: string };
}

/**
 * CLIENT-GL-38: one saved record on the Result section's list: one line,
 * "#n  [team 1  score 1]  -  [score 2  team 2]". The left group (team 1 and its score) is right-aligned and the right
 * group (its score and team 2) left-aligned, so the two scores meet around the dash in the middle. The first team (the
 * winner) is on the schema's winnerAlign side, in the winner tone; the other in the loser tone; no Won / Lost label.
 *
 * A team is its first two players' names, then "/ ...(x)" with the team size past two; hovering shows the full list. The
 * names are cut with an ellipsis only when there is not enough room (a long name, or a narrow view): they shrink
 * together, nothing is shortened in advance. A score is the first slot's value, "-" when missing, and "(...)" after it
 * when the sport has several score slots; hovering shows every slot as a bullet ("- label: score").
 */
export function RecordCard({ schema, data, number, names, locale, text }: RecordCardProps) {
  const read = readTeams(data, schema);
  if (read === null) return null;
  const order = teamDisplayOrder(schema);
  const slotTitles = schema.slots.map((slot, index) => slotTitle(slot, index, locale));

  const team = (index: TeamIndex) => {
    const {
      names: shown,
      more,
      title,
    } = formatTeamNames(
      read.teams[index].players.map((id) => names.get(id)?.name ?? text.formerPlayer),
    );
    const tone = TONE_CLASSES[index === 0 ? schema.ui.winnerTone : schema.ui.loserTone];
    return (
      <span
        title={title}
        data-team={index === 0 ? 'winner' : 'loser'}
        className={cn('flex min-w-0 items-baseline font-medium', tone.label)}
      >
        {shown.map((name, position) => (
          <span key={position} className="flex min-w-0 items-baseline">
            {position > 0 && <span className="shrink-0 px-0.5">/</span>}
            <span className="min-w-0 truncate">{name}</span>
          </span>
        ))}
        {more !== null && <span className="shrink-0 pl-0.5">{`/ ...(${more})`}</span>}
      </span>
    );
  };

  const score = (index: TeamIndex) => {
    const cell = formatScoreCell(read.teams[index].scores, slotTitles);
    return (
      <span
        title={cell.title ?? undefined}
        className="shrink-0 font-semibold whitespace-pre text-text-primary"
      >
        {cell.text}
      </span>
    );
  };

  return (
    <li
      className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-lg border-hairline border-border bg-surface-2 px-1.5 py-1.5 text-2xs"
      data-testid="record-card"
    >
      <span className="text-center font-semibold text-text-muted">#{number}</span>
      <span className="flex min-w-0 items-baseline justify-end gap-1.5" data-side="left">
        {team(order[0])}
        {score(order[0])}
      </span>
      <span className="text-text-muted" aria-hidden="true">
        –
      </span>
      <span className="flex min-w-0 items-baseline justify-start gap-1.5" data-side="right">
        {score(order[1])}
        {team(order[1])}
      </span>
    </li>
  );
}
