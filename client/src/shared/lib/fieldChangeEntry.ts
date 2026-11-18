import i18next from 'i18next';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { formatGameMood } from '@/shared/lib/gameMood';
import { formatLocalized } from '@/shared/lib/localizedDate';
import type { FeeType } from '@/shared/types/session';

/**
 * CLIENT-SESSION-51: the thread sentence for a field the host changed while the session was `PREPARING`
 * (SESSION-67 writes one `SESSION_*_CHANGED` system comment per changed field). One sentence per *shape* and a label
 * per field, so the copy stays small and the same in both languages:
 *
 * - **added** (old empty, new set): `Alex added the start time "Fri, Nov 20 · 18:00"`
 * - **updated** (a free-text field with both set): `Alex updated the fee note "Bring cash"`
 * - **changed** (any other field with both set): `Alex changed the fee from "Free" to "Split"`
 * - **removed** (new empty): `Alex removed the duration`
 *
 * The server sends every value as a string and an empty string means "no value", which is what picks the shape. The
 * values are shown in the viewer's language and zone (an ISO instant, minutes, the fee type and amount, the mood).
 */
export const FIELD_CHANGE_CODES = [
  'SESSION_TITLE_CHANGED',
  'SESSION_LOCATION_CHANGED',
  'SESSION_LOCATION_NOTE_CHANGED',
  'SESSION_START_CHANGED',
  'SESSION_DURATION_CHANGED',
  'SESSION_CAPACITY_CHANGED',
  'SESSION_FEE_CHANGED',
  'SESSION_FEE_NOTE_CHANGED',
  'SESSION_AUTO_APPROVE_CHANGED',
  'SESSION_INITIAL_SLOT_CHANGED',
  'SESSION_MALE_SLOTS_CHANGED',
  'SESSION_FEMALE_SLOTS_CHANGED',
  'SESSION_GAME_MOOD_CHANGED',
] as const;

export type FieldChangeCode = (typeof FIELD_CHANGE_CODES)[number];

export function isFieldChangeCode(code: string): code is FieldChangeCode {
  return (FIELD_CHANGE_CODES as readonly string[]).includes(code);
}

/** `text` fields read "updated ... "new"" when both sides are set; every other field reads "changed ... from ... to ...". */
type Kind = 'text' | 'value';

/** Turns one raw (non-empty) server value into what is shown; `null` when it cannot be shown faithfully. */
type Format = (raw: string) => string | null;

const asIs: Format = (raw) => raw;

const asInstant: Format = (raw) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : formatLocalized(date, 'weekdayMonthDayTime');
};

const asMinutes: Format = (raw) =>
  /^\d+$/.test(raw) ? i18next.t('session:detail.summary.minutes', { count: Number(raw) }) : null;

const asMood: Format = (raw) => (/^\d+$/.test(raw) ? formatGameMood(Number(raw)) : null);

const asApproval: Format = (raw) => {
  if (raw === 'true') return i18next.t('enums:sessionApproval.auto');
  if (raw === 'false') return i18next.t('enums:sessionApproval.hostApproval');
  return null;
};

const FIELDS: Record<FieldChangeCode, { kind: Kind; format: Format }> = {
  SESSION_TITLE_CHANGED: { kind: 'text', format: asIs },
  SESSION_LOCATION_CHANGED: { kind: 'value', format: asIs },
  SESSION_LOCATION_NOTE_CHANGED: { kind: 'text', format: asIs },
  SESSION_START_CHANGED: { kind: 'value', format: asInstant },
  SESSION_DURATION_CHANGED: { kind: 'value', format: asMinutes },
  SESSION_CAPACITY_CHANGED: { kind: 'value', format: asIs },
  SESSION_FEE_CHANGED: { kind: 'value', format: asIs },
  SESSION_FEE_NOTE_CHANGED: { kind: 'text', format: asIs },
  SESSION_AUTO_APPROVE_CHANGED: { kind: 'value', format: asApproval },
  SESSION_INITIAL_SLOT_CHANGED: { kind: 'value', format: asIs },
  SESSION_MALE_SLOTS_CHANGED: { kind: 'value', format: asIs },
  SESSION_FEMALE_SLOTS_CHANGED: { kind: 'value', format: asIs },
  SESSION_GAME_MOOD_CHANGED: { kind: 'value', format: asMood },
};

const FEE_TYPES: readonly string[] = ['FREE', 'SPLIT', 'FIXED'];

/** One side of a fee change: the type and its amount (empty unless `FIXED`) as one value, `null` when unreadable. */
function feeSide(type: string | undefined, amount: string | undefined): string | null {
  if (type === undefined || amount === undefined) return null;
  if (type === '') return '';
  if (!FEE_TYPES.includes(type)) return null;
  if (type !== 'FIXED') return formatFeeDisplay(type as FeeType, null);
  return /^\d+$/.test(amount) ? formatFeeDisplay('FIXED', Number(amount)) : null;
}

/**
 * The en/vi sentence for a field-change entry, or `null` when the stored English `content` must be shown instead:
 * the editor's name is missing, a value the code needs is absent or cannot be read (a bad instant, a non-numeric
 * duration, an unknown fee type), or both sides are empty (nothing to say).
 */
export function fieldChangeEntryText(code: FieldChangeCode, params: Record<string, string> | null | undefined): string | null {
  const values = params ?? {};
  const name = values.name;
  if (name === undefined || name === '') return null;

  const spec = FIELDS[code];
  let before: string | null;
  let after: string | null;
  if (code === 'SESSION_FEE_CHANGED') {
    before = feeSide(values.oldFeeType, values.oldFeeAmountVnd);
    after = feeSide(values.newFeeType, values.newFeeAmountVnd);
  } else {
    before = readSide(spec.format, values.old);
    after = readSide(spec.format, values.new);
  }
  if (before === null || after === null) return null;
  if (before === '' && after === '') return null;

  const shape = before === '' ? 'added' : after === '' ? 'removed' : spec.kind === 'text' ? 'updated' : 'changed';
  return i18next.t(`enums:systemEntries.fieldChange.${shape}`, {
    name,
    field: i18next.t(`enums:systemEntries.fieldLabel.${code}`),
    value: after,
    old: before,
    new: after,
  });
}

/** `''` stays `''` (no value), an absent param is `null` (unreadable), anything else goes through its formatter. */
function readSide(format: Format, raw: string | undefined): string | null {
  if (raw === undefined) return null;
  return raw === '' ? '' : format(raw);
}
