import i18next from 'i18next';
import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';

type Group = ResolvedSportAttributeSchema['groups'][number];

export interface AttributeSummaryEntry {
  /** The attribute's resolved label. */
  label: string;
  /** Display text for a stored scalar / list-of-scalars value, or `null` when nothing is stored. */
  text: string | null;
}

function textOf(attribute: ResolvedSportAttributeDefinition, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const options = 'options' in attribute ? attribute.options : undefined;
  const labelOf = (raw: unknown): string =>
    options?.find((option) => option.value === String(raw))?.label ?? String(raw);
  if (typeof value === 'boolean') {
    return i18next.t(value ? 'enums:attributeValues.yes' : 'enums:attributeValues.no');
  }
  if (Array.isArray(value)) {
    const scalars = value.filter((item) => typeof item !== 'object' || item === null);
    return scalars.length > 0 ? scalars.map(labelOf).join(', ') : null;
  }
  if (typeof value === 'object') return null;
  return labelOf(value);
}

function collect(group: Group, prefix: string, values: Record<string, unknown>, out: AttributeSummaryEntry[]) {
  if (group.isAvailable === false || group.hidden === true) return;
  const groupPath = prefix === '' ? group.key : `${prefix}/${group.key}`;
  for (const attribute of group.attributes) {
    if (attribute.isAvailable === false || attribute.hidden === true) continue;
    // A `#ref` attribute stores a plain scalar / list like an own one; a record-shaped value reads
    // as missing here (`textOf` returns null) — the expanded view renders those in full.
    out.push({ label: attribute.label, text: textOf(attribute, values[`${groupPath}/${attribute.key}`]) });
  }
  for (const subGroup of group.groups ?? []) collect(subGroup, groupPath, values, out);
}

/**
 * The detail modal's collapsed "Session detail" row (CLIENT-SESSION-34): one `{ label, text }` per
 * available attribute of the sport's session schema, in schema order — `text: null` where nothing is
 * stored (the summary shows "..."). Scalars and lists of scalars read as plain text, a `BOOLEAN` as
 * Yes/No, an `ENUM` through its option label; a record-shaped value (a `DEFINITION`) has no one-line
 * form and shows as "..." here — the expanded read view renders it in full.
 */
export function buildAttributeSummary(
  schema: ResolvedSportAttributeSchema,
  values: Record<string, unknown>,
): AttributeSummaryEntry[] {
  const out: AttributeSummaryEntry[] = [];
  for (const group of schema.groups) collect(group, '', values, out);
  return out;
}
