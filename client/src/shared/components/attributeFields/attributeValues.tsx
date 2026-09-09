/* eslint-disable react-refresh/only-export-components -- shared schema-value rendering helpers, not
   a component module; `AttributeList` is a private-ish presentational helper used by the readers
   here and by `SessionAttributesSummary`. Fast-refresh granularity is irrelevant for this file. */
import type { ReactNode } from 'react';
import type {
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeOption,
  SportAttributeType,
} from '@/shared/types/sport';

/* Read-only value rendering for resolved attribute schemas (CLIENT-SESSION-17 Part A — extracted
 * verbatim from `SessionAttributesSummary` so `SessionAttributesSummary` and the `#ref` choice
 * derivation share one renderer). One pure function per `SportAttributeType`, keyed in
 * `valueRenderers`; an unknown type is simply absent from the map and renders nothing. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionLabel(
  options: ResolvedSportAttributeOption[] | null | undefined,
  value: unknown,
): string {
  const asString = String(value);
  return options?.find((option) => option.value === asString)?.label ?? asString;
}

export interface Row {
  key: string;
  term: string;
  node: ReactNode;
}

/** Term/value grid — one `<dt>`/`<dd>` pair per rendered attribute. */
export function AttributeList({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-3 gap-y-1 text-2sm">
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className="min-w-0 text-text-muted">{row.term}</dt>
          <dd className="min-w-0 text-text-primary">{row.node}</dd>
        </div>
      ))}
    </dl>
  );
}

interface ValueContext {
  value: unknown;
  options: ResolvedSportAttributeOption[] | null | undefined;
  definitionRef: string | null | undefined;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

const valueRenderers: Record<SportAttributeType, (ctx: ValueContext) => ReactNode | null> = {
  STRING: ({ value }) => (typeof value === 'string' && value.trim() !== '' ? value : null),
  NUMBER: ({ value }) =>
    typeof value === 'number' && !Number.isNaN(value) ? String(value) : null,
  BOOLEAN: ({ value }) => (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null),
  ENUM: ({ value, options }) =>
    typeof value === 'string' && value !== '' ? optionLabel(options, value) : null,
  LIST: ({ value, options }) => {
    const items = Array.isArray(value)
      ? value.filter((item) => item !== '' && item !== null && item !== undefined)
      : [];
    if (items.length === 0) return null;
    return (
      <ul className="flex flex-wrap gap-1">
        {items.map((item, index) => (
          <li
            key={`${index}-${String(item)}`}
            className="border-hairline inline-flex items-center rounded-full border-border bg-surface-1 px-2 py-0.5 text-2xs text-text-secondary"
          >
            {optionLabel(options, item)}
          </li>
        ))}
      </ul>
    );
  },
  DEFINITION: ({ value, definitionRef, definitionsByName }) => {
    const definitionType = definitionRef != null ? definitionsByName.get(definitionRef) : undefined;
    if (definitionType === undefined || !isRecord(value)) return null;
    return renderRecord(definitionType, value, definitionsByName);
  },
  DEFINITION_LIST: ({ value, definitionRef, definitionsByName }) => {
    const definitionType = definitionRef != null ? definitionsByName.get(definitionRef) : undefined;
    if (definitionType === undefined || !Array.isArray(value)) return null;
    const blocks = value
      .filter(isRecord)
      .map((record, index) => ({
        key: String(index),
        node: renderRecord(definitionType, record, definitionsByName),
      }))
      .filter((block): block is Row => block.node !== null);
    if (blocks.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        {blocks.map((block) => (
          <div key={block.key} className="border-hairline rounded-lg border-border p-2">
            {block.node}
          </div>
        ))}
      </div>
    );
  },
};

/**
 * Renders one stored value for its schema `type`. Returns `null` when the value is absent, empty,
 * the wrong shape, or the type is one this client doesn't know — the caller then omits the row
 * entirely.
 */
export function renderValueNode(
  type: SportAttributeType,
  value: unknown,
  options: ResolvedSportAttributeOption[] | null | undefined,
  definitionRef: string | null | undefined,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
): ReactNode | null {
  const renderer = valueRenderers[type];
  if (renderer === undefined) return null;
  return renderer({ value, options, definitionRef, definitionsByName });
}

/** A `DEFINITION`/`DEFINITION_LIST` record value as its own nested term/value list. `null` when
 * no field in the record has a usable value. */
export function renderRecord(
  definitionType: ResolvedSportAttributeDefinitionType,
  record: Record<string, unknown>,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
): ReactNode | null {
  const rows: Row[] = definitionType.fields
    .map((field) => ({
      key: field.key,
      term: field.label,
      node: renderValueNode(
        field.type,
        record[field.key],
        'options' in field ? field.options : undefined,
        'definitionRef' in field ? field.definitionRef : undefined,
        definitionsByName,
      ),
    }))
    .filter((row): row is Row => row.node !== null);
  if (rows.length === 0) return null;
  return <AttributeList rows={rows} />;
}
