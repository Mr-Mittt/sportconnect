import type { Segment } from '@/shared/lib/mentionMarkup';
import { COMMAND_NAMES, commandText, type CommandName } from './recordCommand';
import type { RecordSchema } from './recordSchema';

/** The words a hint template uses (localized by the caller). */
export interface HintLabels {
  player: string;
  score: string;
  id: string;
}

/** What one word of a hint stands for, so the text typed so far can be matched to it. */
export type HintPartRole = 'command' | 'id' | 'player' | 'score' | 'vs';

export interface HintPart {
  text: string;
  role: HintPartRole;
  /** Which side of `vs` a player or score belongs to. */
  side?: 0 | 1;
}

export interface CommandHint {
  command: CommandName;
  /** The whole template, e.g. `:add @player1 @player2 [score] vs [score] @player1 @player2`. */
  template: string;
  /** The template word by word (joined with one blank it is `template`). */
  parts: HintPart[];
}

function playerParts(schema: RecordSchema, labels: HintLabels, side: 0 | 1): HintPart[] {
  const { min, max } = schema.playersPerSide;
  return Array.from({ length: max }, (_, index) => {
    const slot = `@${labels.player}${index + 1}`;
    return { text: index < min ? slot : `[${slot}]`, role: 'player' as const, side };
  });
}

/** The score placeholder: none when the sport records no scores, `[score]` or `[score,score]` for several slots. */
function scorePart(schema: RecordSchema, labels: HintLabels, side: 0 | 1): HintPart[] {
  if (schema.slots.length === 0) return [];
  return [
    {
      text: `[${Array.from({ length: schema.slots.length }, () => labels.score).join(',')}]`,
      role: 'score',
      side,
    },
  ];
}

/** Every supported command with its template, built from the sport's record schema (all three for a COMPETITIVE one). */
export function buildCommandHints(schema: RecordSchema, labels: HintLabels): CommandHint[] {
  const record: HintPart[] = [
    ...playerParts(schema, labels, 0),
    ...scorePart(schema, labels, 0),
    { text: 'vs', role: 'vs' },
    ...scorePart(schema, labels, 1),
    ...playerParts(schema, labels, 1),
  ];
  return COMMAND_NAMES.map((command) => {
    const head: HintPart[] = [{ text: `:${command}`, role: 'command' }];
    if (command !== 'add') head.push({ text: `<${labels.id}>`, role: 'id' });
    const parts = command === 'del' ? head : [...head, ...record];
    return { command, template: parts.map((part) => part.text).join(' '), parts };
  });
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

const CHIP = /^\uE000.*\uE001$/;
const SCORE = /^\d+(,\d+)*$/;

/**
 * Which part of a hint the typed text already covers, for the bold in the hint list: one number per part, the count of
 * characters (from the start of the part) that are covered, 0 for a part not typed. The command word counts a typed
 * prefix (`:a` covers the `:a` of `:add`); every other part is all or nothing. Matched by role, as the parser reads it:
 * a tag chip is a player of the side it stands on, a number is the score of its side (the id right after `:upd` or
 * `:del`), `vs` switches the side. An optional part nobody typed, and a name typed without being picked, stay plain.
 */
export function coveredHintParts(hint: CommandHint, draft: Segment[]): number[] {
  const covered = hint.parts.map(() => 0);
  const tokens = commandText(draft)
    .split(/\s+/)
    .filter((token) => token !== '');
  if (tokens.length === 0 || hint.parts.length === 0) return covered;

  // The command word is always the first part.
  const typed = tokens[0].toLowerCase();
  const word = hint.parts[0].text;
  if (word.startsWith(typed)) covered[0] = typed.length;
  if (typed !== word) return covered;

  let position = 1;
  const idIndex = hint.parts.findIndex((part) => part.role === 'id');
  if (idIndex >= 0 && position < tokens.length && /^\d+$/.test(tokens[position])) {
    covered[idIndex] = hint.parts[idIndex].text.length;
    position += 1;
  }

  let side: 0 | 1 = 0;
  const players: [number, number] = [0, 0];
  for (; position < tokens.length; position += 1) {
    const token = tokens[position];
    if (token.toLowerCase() === 'vs') {
      const vsIndex = hint.parts.findIndex((part) => part.role === 'vs');
      if (vsIndex >= 0) covered[vsIndex] = hint.parts[vsIndex].text.length;
      side = 1;
    } else if (CHIP.test(token)) {
      players[side] += 1;
    } else if (SCORE.test(token)) {
      const scoreIndex = hint.parts.findIndex((part) => part.role === 'score' && part.side === side);
      if (scoreIndex >= 0) covered[scoreIndex] = hint.parts[scoreIndex].text.length;
    }
  }
  for (const wanted of [0, 1] as const) {
    let remaining = players[wanted];
    hint.parts.forEach((part, index) => {
      if (part.role === 'player' && part.side === wanted && remaining > 0) {
        covered[index] = part.text.length;
        remaining -= 1;
      }
    });
  }
  return covered;
}
