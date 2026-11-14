import type { RecordSchema, RecordUiConfig, Tone } from './recordSchema';
import type { TeamIndex } from './recordData';
import type { SessionParticipant } from './types';

/** A player as the Result section shows them. */
export interface PlayerInfo {
  name: string;
  avatarUrl: string | null;
}

export type PlayerNames = ReadonlyMap<string, PlayerInfo>;

/** Resolves user ids to a name and avatar from the session's JOINED participants. */
export function buildPlayerNames(participants: SessionParticipant[]): PlayerNames {
  return new Map(
    participants.map((participant) => [
      participant.userId,
      { name: participant.userFullName, avatarUrl: participant.userAvatarUrl },
    ]),
  );
}

/**
 * Tailwind classes for each semantic tone of the record schema (`winnerTone`, `loserTone`). Only design
 * tokens: a tinted background and a border carry the tone, the label beside it (Won / Lost) carries the
 * meaning, so colour is never the only signal.
 */
export const TONE_CLASSES: Record<Tone, { panel: string; label: string }> = {
  success: { panel: 'border-text-success bg-bg-success', label: 'text-text-success' },
  warning: { panel: 'border-amber-800 bg-amber-50', label: 'text-amber-800' },
  danger: { panel: 'border-text-danger bg-bg-danger', label: 'text-text-danger' },
  accent: { panel: 'border-border-accent bg-bg-accent', label: 'text-text-accent' },
};

/** True for the `horizontal` style (teams side by side), false for `vertical` (stacked). */
export function isHorizontal(ui: RecordUiConfig): boolean {
  return ui.id === 'horizontal';
}

/**
 * The order the two teams are drawn in. The first team is the winner and `winnerAlign` says where it goes:
 * `LEFT` / `TOP` draws it first, `RIGHT` / `BOTTOM` draws it last.
 */
export function teamDisplayOrder(schema: Pick<RecordSchema, 'ui'>): [TeamIndex, TeamIndex] {
  const winnerLast = schema.ui.winnerAlign === 'RIGHT' || schema.ui.winnerAlign === 'BOTTOM';
  return winnerLast ? [1, 0] : [0, 1];
}

/**
 * A team on the one-line record summary: its first two players' names and, past two, the team size for `...(x)`. The names
 * are NOT cut here: the line cuts them with an ellipsis only when there is not enough room (a long name or a narrow
 * view). `title` is the full list, one name per line, shown on hover.
 */
export function formatTeamNames(playerNames: string[]): { names: string[]; more: number | null; title: string } {
  return {
    names: playerNames.slice(0, 2),
    more: playerNames.length > 2 ? playerNames.length : null,
    title: playerNames.join('\n'),
  };
}

/**
 * One team's score on the one-line summary: the first slot's score, `-` when it is missing, and `(...)` after it when the
 * sport has more than one score slot. `title` lists every slot as a bullet (`• Goals: 2`) for the hover; `null` with one slot.
 */
export function formatScoreCell(
  scores: Array<number | null>,
  slotTitles: string[],
): { text: string; title: string | null } {
  const first = scores[0] ?? null;
  const text = `${first === null ? '-' : first}${slotTitles.length > 1 ? '(...)' : ''}`;
  const title =
    slotTitles.length > 1 ? slotTitles.map((label, index) => `• ${label}: ${scores[index] ?? '-'}`).join('\n') : null;
  return { text, title };
}
