import { COMMAND_NAMES, type CommandName, type MentionPlayer } from './recordCommand';
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

export interface MentionQuery {
  /** Index of the `@` in the text. */
  start: number;
  /** What was typed after it, up to the caret. */
  query: string;
}

/**
 * The `@` word the caret is in, or `null`. Only while the text is a command candidate (starts with `:`), because a plain
 * comment has no mentions. The query may contain spaces (full names do): it runs back from the caret to the nearest `@`.
 */
export function activeMention(text: string, caret: number): MentionQuery | null {
  if (!text.startsWith(':')) return null;
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.includes('\n')) return null;
  return { start, query };
}

/** True when the name, or any word of it, starts with the lower-cased needle: `an` finds "Anh Tuan" and "Binh An", not "Bao". */
function startsAWord(token: string, needle: string): boolean {
  const lower = token.normalize('NFC').toLocaleLowerCase();
  return [...lower.matchAll(/(?:^|\s)(?=\S)/g)].some((match) =>
    lower.slice(match.index + match[0].length).startsWith(needle),
  );
}

/** The players to offer for an `@` query: the ones with a word starting with it, minus the ones already in the text. */
export function mentionOptions<T extends MentionPlayer>(text: string, mention: MentionQuery, players: T[]): T[] {
  const needle = mention.query.normalize('NFC').toLocaleLowerCase();
  // Already named: `@token` followed by a space or the end, outside the word being typed (so `@An` is not "used" by `@Anh`).
  const typedBefore = text.slice(0, mention.start).toLocaleLowerCase();
  const typedAfter = text.slice(mention.start + 1 + mention.query.length).toLocaleLowerCase();
  const used = (token: string) => {
    const word = `@${token.toLocaleLowerCase()}`;
    const named = (part: string) => {
      let index = part.indexOf(word);
      while (index >= 0) {
        const next = part[index + word.length];
        if (next === undefined || /\s/.test(next)) return true;
        index = part.indexOf(word, index + 1);
      }
      return false;
    };
    return named(typedBefore) || named(typedAfter);
  };
  return players.filter(
    (player) =>
      startsAWord(player.token, needle) && !used(player.token),
  );
}

/** The text and caret after picking a player for the `@` word in progress. */
export function insertMention(
  text: string,
  caret: number,
  mention: MentionQuery,
  player: MentionPlayer,
): { text: string; caret: number } {
  const inserted = `@${player.token} `;
  const after = text.slice(caret).replace(/^ /, '');
  const next = text.slice(0, mention.start) + inserted + after;
  return { text: next, caret: mention.start + inserted.length };
}
