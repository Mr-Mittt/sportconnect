import type { ReactNode } from 'react';
import type {
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { isRecord, optionLabel, renderRecord } from './attributeValues';

/**
 * CLIENT-SESSION-17 Part B — one selectable choice for a `#ref` control. A `#ref` node's choices
 * are the creator's own profile value(s) stored at `node.prefillKey`, plus any draft the user has
 * added through the "Other…" modal.
 */
export interface RefChoice {
  /** Stable string identity — React key, `<option value>`, and equality against the stored value. */
  key: string;
  /** The value this choice contributes to `session.attributes` (a scalar, or a whole record). */
  value: unknown;
  /** Plain-text label — used for a `<select>` `<option>` and for scalar radio/checkbox rows. */
  text: string;
  /** Rich label for a record-shaped choice (the nested `<dl>`); `undefined` for a scalar choice. */
  node?: ReactNode;
}

function isRecordBase(node: ResolvedRefAttribute): boolean {
  return node.type === 'DEFINITION' || node.type === 'DEFINITION_LIST';
}

/** A compact one-line summary of a record, for a `<select>` `<option>` where JSX can't be used. */
function summarizeRecord(
  definitionType: ResolvedSportAttributeDefinitionType | undefined,
  record: Record<string, unknown>,
): string {
  const fields = definitionType?.fields ?? [];
  const parts = fields
    .map((field) => record[field.key])
    .filter((value) => value !== '' && value !== null && value !== undefined)
    .map((value) => (isRecord(value) ? JSON.stringify(value) : String(value)));
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(record);
}

/** Deterministic key for a record choice — key order independent. */
function stableRecordKey(record: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = record[key];
        return acc;
      }, {}),
  );
}

/**
 * Derives the choice list for a `#ref` node from the creator's profile attributes.
 *
 * - profile value is a scalar → a one-entry list;
 * - profile value is an array (the profile attribute is itself a `LIST`/`DEFINITION_LIST`) → one
 *   entry per element;
 * - profile has nothing at that path → empty list (the control renders empty + a hint);
 * - `DEFINITION`/`DEFINITION_LIST`-shaped entries → `node` carries the same nested-record
 *   formatting `SessionAttributesSummary` uses; the stored value round-trips whole.
 *
 * Empty / `null` / `undefined` entries are dropped. Entries are de-duplicated by `key`.
 */
export function deriveRefChoices(
  node: ResolvedRefAttribute,
  profileAttributes: Record<string, unknown> | null,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
): RefChoice[] {
  const raw = profileAttributes?.[node.prefillKey];
  const entries: unknown[] =
    raw === undefined || raw === null || raw === ''
      ? []
      : Array.isArray(raw)
        ? raw
        : [raw];

  const recordBase = isRecordBase(node);
  const definitionType =
    recordBase && node.definitionRef != null ? definitionsByName.get(node.definitionRef) : undefined;

  const choices: RefChoice[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry === '' || entry === null || entry === undefined) continue;

    let choice: RefChoice;
    if (recordBase && isRecord(entry)) {
      const key = stableRecordKey(entry);
      choice = {
        key,
        value: entry,
        text: summarizeRecord(definitionType, entry),
        node:
          definitionType !== undefined
            ? renderRecord(definitionType, entry, definitionsByName)
            : undefined,
      };
    } else {
      const asString = String(entry);
      choice = { key: asString, value: entry, text: optionLabel(node.options, asString) };
    }

    if (seen.has(choice.key)) continue;
    seen.add(choice.key);
    choices.push(choice);
  }

  return choices;
}

/** The `RefChoice.key` a stored `#ref` value would have — lets a control match its current
 * `value` back to a choice (scalar by string identity, record by canonical JSON). */
export function refValueKey(value: unknown): string {
  return isRecord(value) ? stableRecordKey(value) : String(value);
}

/** Turns a user-entered "Other…" draft into a `RefChoice`, matching `deriveRefChoices`' shape so
 * the two lists concatenate. A record draft gets the same nested rendering. */
export function draftToChoice(
  node: ResolvedRefAttribute,
  draft: unknown,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
): RefChoice {
  if (isRecordBase(node) && isRecord(draft)) {
    const definitionType =
      node.definitionRef != null ? definitionsByName.get(node.definitionRef) : undefined;
    return {
      key: stableRecordKey(draft),
      value: draft,
      text: summarizeRecord(definitionType, draft),
      node:
        definitionType !== undefined
          ? renderRecord(definitionType, draft, definitionsByName)
          : undefined,
    };
  }
  const asString = String(draft);
  return { key: asString, value: draft, text: asString };
}
