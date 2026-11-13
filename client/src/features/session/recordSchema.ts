import catalog from './recordSchema/record-ui-v1.json';

/*
 * CLIENT-GL-38: the sport's result schema as this client understands it (v1, COMPETITIVE records).
 * The server stores the document as the admin sent it and reads only `maxRecords`; everything else is
 * read here, tolerantly: a document this client cannot understand parses to `null` and the Result
 * section stays hidden, an unknown UI style or tone falls back to the catalog default.
 *
 * Contract: documentation/md/RECORD_SCHEMA_CONTRACT.md; the UI options come from
 * `recordSchema/record-ui-v1.json`, the badminton example is `recordSchema/badminton-record-schema-v1.json`.
 */

export const SUPPORTED_SCHEMA_VERSION = 1;
/** The server's default and ceiling for `maxRecords` (SessionRecordServiceImpl). */
export const DEFAULT_MAX_RECORDS = 100;
export const CEILING_MAX_RECORDS = 500;
/** Sanity caps so a mistyped schema cannot make the dialog render hundreds of slots. */
const MAX_PLAYERS_PER_SIDE = 10;
const MAX_SCORE_SLOTS = 4;

export type Tone = 'success' | 'warning' | 'danger' | 'accent';
export type RecordStyleId = 'horizontal' | 'vertical';

/** One `op value` comparison of a score rule, e.g. `>=0`. */
export interface ScoreComparison {
  op: '>' | '>=' | '<' | '<=';
  value: number;
}

/** A score rule: every comparison must hold (`>=0&<=30`). Empty = any integer. */
export type ScoreRule = ScoreComparison[];

export interface ScoreSlot {
  /** On a side that has any score filled, every required slot must be filled too. */
  required: boolean;
  title: { en?: string; vi?: string };
  rule: ScoreRule;
}

export interface RecordUiConfig {
  id: RecordStyleId;
  /** `LEFT`/`RIGHT` for `horizontal`, `TOP`/`BOTTOM` for `vertical`: where the winner (first team) is drawn. */
  winnerAlign: string;
  winnerTone: Tone;
  loserTone: Tone;
}

export interface RecordSchema {
  maxRecords: number;
  playersPerSide: { min: number; max: number };
  /** Score slots per side, drawn top to bottom. Empty = the sport records no scores. */
  slots: ScoreSlot[];
  ui: RecordUiConfig;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Parses a score rule: comparisons joined with `&` (`>0`, `>=0`, `<=30`, `>=0&<=30`). Anything else is
 * unreadable and counts as no rule (any integer is accepted), never as a rule that rejects everything.
 */
export function parseScoreRule(raw: unknown): ScoreRule {
  if (typeof raw !== 'string') return [];
  const rule: ScoreRule = [];
  for (const part of raw.split('&')) {
    const match = /^\s*(>=|<=|>|<)\s*(-?\d+)\s*$/.exec(part);
    if (match === null) return [];
    rule.push({ op: match[1] as ScoreComparison['op'], value: Number(match[2]) });
  }
  return rule;
}

/** True when an integer score satisfies every comparison of the rule. */
export function scoreSatisfies(rule: ScoreRule, score: number): boolean {
  return Number.isInteger(score) && rule.every(({ op, value }) => {
    if (op === '>') return score > value;
    if (op === '>=') return score >= value;
    if (op === '<') return score < value;
    return score <= value;
  });
}

const STYLES = catalog.COMPETITIVE.styles as Record<
  string,
  { config: { winnerAlign: { enum: string[]; default: string }; winnerTone: { default: string }; loserTone: { default: string } } }
>;
const TONES = catalog.tones as Tone[];

function parseUi(raw: unknown): RecordUiConfig {
  const ui = isObject(raw) ? raw : {};
  const requested = typeof ui.id === 'string' && ui.id in STYLES ? ui.id : catalog.COMPETITIVE.defaultStyle;
  const style = STYLES[requested].config;
  const config = isObject(ui.config) ? ui.config : {};
  const tone = (value: unknown, fallback: string): Tone =>
    typeof value === 'string' && (TONES as string[]).includes(value) ? (value as Tone) : (fallback as Tone);
  return {
    id: requested as RecordStyleId,
    winnerAlign:
      typeof config.winnerAlign === 'string' && style.winnerAlign.enum.includes(config.winnerAlign)
        ? config.winnerAlign
        : style.winnerAlign.default,
    winnerTone: tone(config.winnerTone, style.winnerTone.default),
    loserTone: tone(config.loserTone, style.loserTone.default),
  };
}

function parseSlots(raw: unknown): ScoreSlot[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SCORE_SLOTS) return null;
  const slots: ScoreSlot[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) return null;
    const title = isObject(entry.title) ? entry.title : {};
    slots.push({
      required: entry.required === true,
      title: {
        en: typeof title.en === 'string' ? title.en : undefined,
        vi: typeof title.vi === 'string' ? title.vi : undefined,
      },
      rule: parseScoreRule(entry.rule),
    });
  }
  return slots;
}

/**
 * Turns the raw `GET /sports/{id}/result-schema` document into a typed schema, or `null` when it is
 * missing or not understood (wrong `version`, a record `type` other than COMPETITIVE, a malformed
 * `playersPerSide` or score slots): the Result section is then hidden. `maxRecords` falls back to the
 * server's default (100) and is clamped to its ceiling (500), exactly as the server reads it.
 */
export function parseRecordSchema(raw: unknown): RecordSchema | null {
  if (!isObject(raw) || raw.version !== SUPPORTED_SCHEMA_VERSION) return null;
  const record = raw.record;
  if (!isObject(record) || !isObject(record.data) || record.data.type !== 'COMPETITIVE') return null;
  const players = record.data.playersPerSide;
  if (!isObject(players) || !isInt(players.min) || !isInt(players.max)) return null;
  if (players.min < 1 || players.max < players.min || players.max > MAX_PLAYERS_PER_SIDE) return null;
  const score = record.data.score;
  const slots = score === undefined ? [] : isObject(score) ? parseSlots(score.slot) : null;
  if (slots === null) return null;
  const maxRecords = isInt(raw.maxRecords)
    ? Math.min(Math.max(raw.maxRecords, 1), CEILING_MAX_RECORDS)
    : DEFAULT_MAX_RECORDS;
  return {
    maxRecords,
    playersPerSide: { min: players.min, max: players.max },
    slots,
    ui: parseUi(record.UI),
  };
}

/** A slot's title in the viewer's language, falling back to the other language, then to "#n". */
export function slotTitle(slot: ScoreSlot, index: number, locale: 'en' | 'vi'): string {
  return slot.title[locale] ?? slot.title.en ?? slot.title.vi ?? `#${index + 1}`;
}
