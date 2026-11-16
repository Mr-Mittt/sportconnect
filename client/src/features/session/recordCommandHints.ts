import { COMMAND_NAMES, type CommandName } from './recordCommand';
import type { RecordSchema } from './recordSchema';

/** The words a hint template uses (localized by the caller). */
export interface HintLabels {
  player: string;
  score: string;
  id: string;
}

export interface CommandHint {
  command: CommandName;
  /** The whole template, e.g. `:add @player1 @player2 [score] vs [score] @player1 @player2`. */
  template: string;
}

function playersText(schema: RecordSchema, labels: HintLabels): string {
  const { min, max } = schema.playersPerSide;
  return Array.from({ length: max }, (_, index) => {
    const slot = `@${labels.player}${index + 1}`;
    return index < min ? slot : `[${slot}]`;
  }).join(' ');
}

/** The score placeholder: none when the sport records no scores, `[score]` or `[score,score]` for several slots. */
function scoreText(schema: RecordSchema, labels: HintLabels): string | null {
  if (schema.slots.length === 0) return null;
  return `[${Array.from({ length: schema.slots.length }, () => labels.score).join(',')}]`;
}

/** Every supported command with its template, built from the sport's record schema (all three for a COMPETITIVE one). */
export function buildCommandHints(schema: RecordSchema, labels: HintLabels): CommandHint[] {
  const players = playersText(schema, labels);
  const score = scoreText(schema, labels);
  const left = score === null ? players : `${players} ${score}`;
  const right = score === null ? players : `${score} ${players}`;
  const record = `${left} vs ${right}`;
  return COMMAND_NAMES.map((command) => ({
    command,
    template:
      command === 'add'
        ? `:add ${record}`
        : command === 'upd'
          ? `:upd <${labels.id}> ${record}`
          : `:del <${labels.id}>`,
  }));
}

/**
 * The hints to show for the text typed so far: nothing unless it starts with `:`; the first word picks the commands
 * whose name starts with it (`:` lists all, `:a` only `:add`, `:add 5 ...` only `:add`).
 */
export function matchingHints(text: string, hints: CommandHint[]): CommandHint[] {
  if (!text.startsWith(':')) return [];
  const first = (/^\S*/.exec(text)?.[0] ?? '').toLowerCase();
  return hints.filter((hint) => `:${hint.command}`.startsWith(first));
}
