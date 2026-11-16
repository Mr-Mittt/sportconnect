import {
  playersOf,
  validateRecord,
  winnerFirst,
  type RecordProblem,
  type RecordProblemCode,
  type TeamData,
} from './recordData';
import type { RecordSchema } from './recordSchema';
import type { Segment } from '@/shared/lib/mentionMarkup';
import type { RecordData, SessionRecord } from './resultTypes';

/*
 * CLIENT-GL-39: record commands typed in the session thread's comment box. A command is NOT a comment: the client
 * recognizes it by its first word (exactly `:add`, `:upd` or `:del`), validates it with the same checks as the record
 * dialog, and sends the same one-item change set; nothing is posted to the thread.
 *
 *   :add <team 1> vs <team 2>          e.g.  :add @Bao @An 21 vs 15 @Binh @Chi
 *   :upd <record id> <team 1> vs <team 2>
 *   :del <record id>
 *
 * Team 1 is its players then its optional scores; team 2 is its optional scores then its players, so the two scores
 * meet around `vs`. Several score slots are comma-separated (`21,18`). The first team is the winner (`winnerFirst`
 * swaps a team typed on the wrong side, as the dialog does). The record id is the real id the Result section's copy
 * button puts on the clipboard. Players are `@` plus the full name the record dialog shows (picked from the `@` list).
 */

/** A tag chip inside a command text: `CHIP_OPEN id CHIP_NAME name CHIP_CLOSE` (private-use characters, never typed). */
const CHIP_OPEN = '\uE000';
const CHIP_NAME = '\uE002';
const CHIP_CLOSE = '\uE001';
const CHIP_PATTERN = /^\uE000([^\uE002]*)\uE002([^\uE001]*)\uE001/;

/** The name part of a chip token is URI-encoded, so a name can never contain a blank or the word `vs` the parser splits on. */
function decodeName(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/** The text the command parser reads for a draft: typed text as it is, each tag chip as an id token. */
export function commandText(segments: Segment[]): string {
  return segments
    .map((segment) =>
      segment.kind === 'text'
        ? segment.text
        : `${CHIP_OPEN}${segment.userId}${CHIP_NAME}${encodeURIComponent(segment.name)}${CHIP_CLOSE}`,
    )
    .join('');
}

export type CommandName = 'add' | 'upd' | 'del';

export const COMMAND_NAMES: readonly CommandName[] = ['add', 'upd', 'del'];

/** The command a text starts with: the first word has to be exactly `:add`, `:upd` or `:del`. `null` = a normal comment. */
export function commandNameOf(text: string): CommandName | null {
  const match = /^:(add|upd|del)(?=\s|$)/.exec(text);
  return match === null ? null : (match[1] as CommandName);
}

/** A player a command can name, with the exact `@` text that names them. */
export interface MentionPlayer {
  id: string;
  /** The text after `@`: the full name, or `Name (1)`, `Name (2)` when several participants share a full name. */
  token: string;
  name: string;
}

function normalize(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

/** The players a command can name, in roster order; participants with the same full name get `(1)`, `(2)`, ... */
export function mentionPlayers(players: Array<{ id: string; name: string }>): MentionPlayer[] {
  const totals = new Map<string, number>();
  for (const player of players) {
    const key = normalize(player.name);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return players.map((player) => {
    const key = normalize(player.name);
    if ((totals.get(key) ?? 0) < 2) return { id: player.id, token: player.name, name: player.name };
    const position = (seen.get(key) ?? 0) + 1;
    seen.set(key, position);
    return { id: player.id, token: `${player.name} (${position})`, name: player.name };
  });
}

/** What is wrong with a command (the dialog's own problem codes are reused for the record itself). */
export type CommandIssueCode =
  | 'ID_MISSING'
  | 'ID_INVALID'
  | 'ID_NOT_FOUND'
  | 'VS_MISSING'
  | 'VS_MULTIPLE'
  | 'PLAYER_UNKNOWN'
  | 'PLAYER_AMBIGUOUS'
  | 'PLAYER_REPEATED'
  | 'TEXT_UNEXPECTED'
  | 'SCORE_FORMAT'
  | 'EXTRA_TEXT';

export interface CommandIssue {
  code: CommandIssueCode | RecordProblemCode;
  /** 1 or 2: which team of the command the issue is in (record problems and team-level parse issues). */
  team?: 1 | 2;
  /** The offending text, for the codes that quote it. */
  text?: string;
  /** The score slot, for `SCORE_MISSING` and `SCORE_RULE`. */
  slot?: number;
}

export type CommandOperation =
  | { kind: 'add'; data: RecordData; playerIds: string[] }
  | { kind: 'upd'; id: number; data: RecordData; playerIds: string[] }
  | { kind: 'del'; id: number };

export type ParsedCommand =
  | { ok: true; operation: CommandOperation }
  | { ok: false; issues: CommandIssue[] };

export interface CommandContext {
  schema: RecordSchema;
  players: MentionPlayer[];
  /** Every record the session holds now (an `:upd` / `:del` id has to be one of them). */
  records: Array<Pick<SessionRecord, 'id'>>;
}

interface SideRead {
  players: string[];
  scores: number[];
  issues: CommandIssue[];
}

function readSide(text: string, side: 'left' | 'right', context: CommandContext, team: 1 | 2): SideRead {
  const read: SideRead = { players: [], scores: [], issues: [] };
  let rest = text.trim();
  let sawScore = false;
  let sawPlayer = false;
  const issue = (code: CommandIssueCode, quoted?: string) =>
    read.issues.push({ code, team, ...(quoted === undefined ? {} : { text: quoted }) });

  while (rest.length > 0) {
    if (rest.startsWith(CHIP_OPEN)) {
      // A tag chip names its person by id: no name matching, so "Bao" and "Bao 15" can never be mixed up.
      const chip = CHIP_PATTERN.exec(rest);
      const chipText = chip === null ? rest.slice(1) : chip[0];
      const hit = chip === null ? undefined : context.players.find((player) => player.id === chip[1]);
      if (hit === undefined) {
        issue('PLAYER_UNKNOWN', chip === null ? '' : decodeName(chip[2]));
        sawPlayer = true;
      } else {
        if (side === 'left' && sawScore) issue('TEXT_UNEXPECTED', `@${hit.name}`);
        else if (read.players.includes(hit.id)) issue('PLAYER_REPEATED', hit.name);
        else read.players.push(hit.id);
        sawPlayer = true;
      }
      rest = rest.slice(chipText.length).trimStart();
      continue;
    }
    if (rest.startsWith('@')) {
      // An `@name` typed or pasted without being picked is not a player: the command is refused.
      const quoted = /^@\S*/.exec(rest)?.[0].slice(1) ?? '';
      issue('PLAYER_UNKNOWN', quoted);
      sawPlayer = true;
      rest = rest.replace(/^@\S*\s*/, '');
      continue;
    }
    const score = /^(\d+(?:,\d+)*)(?=\s|$)/.exec(rest);
    if (score !== null) {
      const inPlace = side === 'left' ? !sawScore : !sawPlayer && !sawScore;
      if (!inPlace) issue('TEXT_UNEXPECTED', score[1]);
      else read.scores = score[1].split(',').map(Number);
      sawScore = true;
      rest = rest.slice(score[1].length).trimStart();
      continue;
    }
    const word = /^\S+/.exec(rest)?.[0] ?? rest;
    issue('TEXT_UNEXPECTED', word);
    rest = rest.slice(word.length).trimStart();
  }
  return read;
}

function toTeamData(read: SideRead, schema: RecordSchema): TeamData {
  return {
    players: read.players,
    scores: schema.slots.map((_, index) => read.scores[index] ?? null),
  };
}

function parseId(rest: string, context: CommandContext): { id: number; rest: string } | CommandIssue {
  const match = /^(\S+)\s*([\s\S]*)$/.exec(rest);
  if (match === null) return { code: 'ID_MISSING' };
  if (!/^\d+$/.test(match[1]) || !Number.isSafeInteger(Number(match[1]))) {
    return { code: 'ID_INVALID', text: match[1] };
  }
  const id = Number(match[1]);
  if (!context.records.some((record) => record.id === id)) return { code: 'ID_NOT_FOUND', text: match[1] };
  return { id, rest: match[2] };
}

/**
 * Parses and validates one command text. Call it only when `commandNameOf(text)` is not null. Returns the operation to
 * send or every issue found; the record itself is checked with the dialog's `validateRecord` and the winner is put
 * first with `winnerFirst`.
 */
export function parseCommand(text: string, context: CommandContext): ParsedCommand {
  const name = commandNameOf(text);
  if (name === null) return { ok: false, issues: [] };
  let rest = text.slice(1 + name.length).trim();

  let id: number | null = null;
  if (name !== 'add') {
    const parsed = parseId(rest, context);
    if ('code' in parsed) return { ok: false, issues: [parsed] };
    id = parsed.id;
    rest = parsed.rest.trim();
  }
  if (name === 'del') {
    return rest.length > 0
      ? { ok: false, issues: [{ code: 'EXTRA_TEXT', text: rest }] }
      : { ok: true, operation: { kind: 'del', id: id as number } };
  }

  const parts = rest.split(/(?:^|\s)vs(?=\s|$)/i);
  if (parts.length < 2) return { ok: false, issues: [{ code: 'VS_MISSING' }] };
  if (parts.length > 2) return { ok: false, issues: [{ code: 'VS_MULTIPLE' }] };

  const sides = [readSide(parts[0], 'left', context, 1), readSide(parts[1], 'right', context, 2)];
  const issues: CommandIssue[] = sides.flatMap((side) => side.issues);
  sides.forEach((side, index) => {
    if (side.scores.length > context.schema.slots.length) {
      issues.push({ code: 'SCORE_FORMAT', team: (index + 1) as 1 | 2, text: side.scores.join(',') });
    }
  });
  if (issues.length > 0) return { ok: false, issues };

  const data: RecordData = {
    teams: [toTeamData(sides[0], context.schema), toTeamData(sides[1], context.schema)],
  };
  const problems: RecordProblem[] = validateRecord(context.schema, data);
  if (problems.length > 0) {
    return {
      ok: false,
      issues: problems.map((problem) => ({
        code: problem.code,
        team: (problem.team + 1) as 1 | 2,
        ...(problem.slot === undefined ? {} : { slot: problem.slot }),
      })),
    };
  }
  const ordered = winnerFirst(context.schema, data);
  const playerIds = playersOf(ordered);
  return {
    ok: true,
    operation:
      name === 'add'
        ? { kind: 'add', data: ordered, playerIds }
        : { kind: 'upd', id: id as number, data: ordered, playerIds },
  };
}
