/* eslint-disable react-refresh/only-export-components -- shared schema-value rendering helpers, not
   a component module; `AttributeList` / `GridPairs` are private-ish presentational helpers used by
   the readers here and by `SessionAttributesSummary`. Fast-refresh granularity is irrelevant. */
import type { ReactNode } from 'react';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeOption,
  SportAttributeType,
} from '@/shared/types/sport';
import { formatAttributeValue } from '@/shared/lib/formatAttributeValue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { renderHeadingLabel } from './headingIcons';
import { normalizeLayout, pickLayoutId } from './layout';

/* Read-only value rendering for resolved attribute schemas (CLIENT-SESSION-17 Part A — extracted
 * verbatim from `SessionAttributesSummary` so `SessionAttributesSummary` and the `#ref` choice
 * derivation share one renderer). SPORT-15 threads the node's resolved `layout` through so the
 * read view honours `format` (scalars), the `LIST` display set (`chips`/`comma`/`bullets`), the
 * `DEFINITION` arrangement (`stacked`/`inline`/`grid-2`) and the `DEFINITION_LIST` presentation
 * (`cards`/`table`/`accordion`). Absent `layout` ⇒ the exact pre-SPORT-15 markup. One pure
 * function per `SportAttributeType`, keyed in `valueRenderers`; an unknown type is simply absent
 * from the map and renders nothing. */

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
  /** SPORT-15: `ReactNode` (not `string`) so a term can carry a `layout.icon` prefix. */
  term: ReactNode;
  node: ReactNode;
}

/** Term/value grid — one `<dt>`/`<dd>` pair per rendered attribute (label-left). */
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

/** SPORT-15: term-over-value cells in a responsive N-column grid — the read-only `grid-2` / `grid-3`
 * arrangement for a `group` or a `DEFINITION` record. */
export function GridPairs({ rows, cols }: { rows: Row[]; cols: 2 | 3 }) {
  return (
    <dl
      className={
        cols === 3
          ? 'grid grid-cols-1 gap-x-4 gap-y-2 text-2sm sm:grid-cols-2 lg:grid-cols-3'
          : 'grid grid-cols-1 gap-x-4 gap-y-2 text-2sm sm:grid-cols-2'
      }
    >
      {rows.map((row) => (
        <div key={row.key} className="min-w-0">
          <dt className="text-2xs text-text-muted">{row.term}</dt>
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
  /** SPORT-15: the node's resolved `layout` — `format` for scalars, display id for `LIST`,
   * arrangement for `DEFINITION`/`DEFINITION_LIST`. */
  layout: ResolvedAttributeLayout | null | undefined;
  /** A short, stable context string for `devWarn` (the node key/label). */
  context: string;
}

const LIST_DISPLAY_IDS = ['chips', 'comma', 'bullets'] as const;
// SPORT-14 editable `LIST` container ids — valid on the node, just not a *display* choice, so they
// resolve to the `chips` default without a warning.
const LIST_EDIT_IDS = ['checkboxes', 'multiselect', 'ordered'];

function listDisplayId(
  layout: ResolvedAttributeLayout | null | undefined,
  context: string,
): (typeof LIST_DISPLAY_IDS)[number] {
  const { id } = normalizeLayout(layout, context);
  if (id == null || LIST_EDIT_IDS.includes(id)) return 'chips';
  return pickLayoutId(id, LIST_DISPLAY_IDS, 'chips', context);
}

function renderChips(items: unknown[], options: ValueContext['options']) {
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
}

const valueRenderers: Record<SportAttributeType, (ctx: ValueContext) => ReactNode | null> = {
  STRING: ({ value, layout }) => {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const { format } = normalizeLayout(layout, 'string');
    return format != null ? formatAttributeValue(value, 'STRING', format) : value;
  },
  NUMBER: ({ value, layout }) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    const { format } = normalizeLayout(layout, 'number');
    return format != null ? formatAttributeValue(value, 'NUMBER', format) : String(value);
  },
  BOOLEAN: ({ value }) => (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null),
  ENUM: ({ value, options }) =>
    typeof value === 'string' && value !== '' ? optionLabel(options, value) : null,
  LIST: ({ value, options, layout, context }) => {
    const items = Array.isArray(value)
      ? value.filter((item) => item !== '' && item !== null && item !== undefined)
      : [];
    if (items.length === 0) return null;
    const display = listDisplayId(layout, context);
    if (display === 'comma') {
      return <span>{items.map((item) => optionLabel(options, item)).join(', ')}</span>;
    }
    if (display === 'bullets') {
      return (
        <ul className="list-disc pl-4">
          {items.map((item, index) => (
            <li key={`${index}-${String(item)}`}>{optionLabel(options, item)}</li>
          ))}
        </ul>
      );
    }
    return renderChips(items, options);
  },
  DEFINITION: ({ value, definitionRef, definitionsByName, layout }) => {
    const definitionType = definitionRef != null ? definitionsByName.get(definitionRef) : undefined;
    if (definitionType === undefined || !isRecord(value)) return null;
    return renderRecord(definitionType, value, definitionsByName, layout);
  },
  DEFINITION_LIST: ({ value, definitionRef, definitionsByName, layout, context }) => {
    const definitionType = definitionRef != null ? definitionsByName.get(definitionRef) : undefined;
    if (definitionType === undefined || !Array.isArray(value)) return null;
    const records = value.filter(isRecord);
    if (records.length === 0) return null;
    const kind = pickLayoutId(
      normalizeLayout(layout, context).id,
      ['cards', 'table', 'accordion'] as const,
      'cards',
      context,
    );

    if (kind === 'table') {
      const fields = definitionType.fields.filter((field) => field.hidden !== true);
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-2sm">
            <thead>
              <tr className="border-hairline-b border-border">
                {fields.map((field) => (
                  <th key={field.key} scope="col" className="p-1.5 text-2xs font-medium text-text-muted">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={index} className="border-hairline-b border-border align-top">
                  {fields.map((field) => (
                    <td key={field.key} className="p-1.5 text-text-primary">
                      {renderValueNode(
                        field.type,
                        record[field.key],
                        'options' in field ? field.options : undefined,
                        'definitionRef' in field ? field.definitionRef : undefined,
                        definitionsByName,
                        field.layout,
                      ) ?? <span className="text-text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (kind === 'accordion') {
      return (
        <div className="flex flex-col gap-1.5">
          {records.map((record, index) => (
            <Collapsible key={index} defaultOpen className="border-hairline rounded-lg border-border">
              <CollapsibleTrigger className="p-2 text-2xs font-medium text-text-secondary">
                {accordionSummary(definitionType, record, index)}
              </CollapsibleTrigger>
              <CollapsibleContent className="border-hairline-t border-border p-2">
                {renderRecord(definitionType, record, definitionsByName, null)}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      );
    }

    // `cards` (default) — bordered blocks, byte-identical to pre-SPORT-15.
    const blocks = records
      .map((record, index) => ({
        key: String(index),
        node: renderRecord(definitionType, record, definitionsByName, null),
      }))
      .filter((block): block is { key: string; node: ReactNode } => block.node !== null);
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

/** Accordion trigger text: `Item N`, plus the first non-empty scalar field value. */
function accordionSummary(
  definitionType: ResolvedSportAttributeDefinitionType,
  record: Record<string, unknown>,
  index: number,
): string {
  for (const field of definitionType.fields) {
    if (field.hidden === true) continue;
    if (field.type !== 'STRING' && field.type !== 'NUMBER') continue;
    const value = record[field.key];
    if (typeof value === 'string' && value.trim() !== '') return `Item ${index + 1} · ${value}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `Item ${index + 1} · ${value}`;
  }
  return `Item ${index + 1}`;
}

/**
 * Renders one stored value for its schema `type`. Returns `null` when the value is absent, empty,
 * the wrong shape, or the type is one this client doesn't know — the caller then omits the row
 * entirely. SPORT-15: `layout` (the node's resolved `layout`, optional) drives `format` /
 * `LIST` display / `DEFINITION(_LIST)` presentation; `context` names the node for dev warnings.
 */
export function renderValueNode(
  type: SportAttributeType,
  value: unknown,
  options: ResolvedSportAttributeOption[] | null | undefined,
  definitionRef: string | null | undefined,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
  layout?: ResolvedAttributeLayout | null,
  context = 'attribute',
): ReactNode | null {
  const renderer = valueRenderers[type];
  if (renderer === undefined) return null;
  return renderer({ value, options, definitionRef, definitionsByName, layout, context });
}

/** A `DEFINITION`/`DEFINITION_LIST` record value as its own nested term/value view. `null` when no
 * (non-`hidden`) field in the record has a usable value. SPORT-15: `layout` picks the arrangement
 * — `stacked`/`inline` → the label-left `<dl>` (the read view is already label-left, so `inline`
 * equals `stacked` here), `grid-2` → a 2-col grid of term-over-value cells. Per-field `layout` and
 * `hidden` are honoured. */
export function renderRecord(
  definitionType: ResolvedSportAttributeDefinitionType,
  record: Record<string, unknown>,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
  layout?: ResolvedAttributeLayout | null,
): ReactNode | null {
  const rows: Row[] = definitionType.fields
    .filter((field) => field.hidden !== true)
    .map((field) => ({
      key: field.key,
      term: renderHeadingLabel(
        field.label,
        normalizeLayout(field.layout, field.key).icon,
        field.key,
      ),
      node: renderValueNode(
        field.type,
        record[field.key],
        'options' in field ? field.options : undefined,
        'definitionRef' in field ? field.definitionRef : undefined,
        definitionsByName,
        field.layout,
        field.key,
      ),
    }))
    .filter((row): row is Row => row.node !== null);
  if (rows.length === 0) return null;

  const kind = pickLayoutId(
    normalizeLayout(layout, definitionType.name).id,
    ['stacked', 'inline', 'grid-2'] as const,
    'stacked',
    definitionType.name,
  );
  return kind === 'grid-2' ? <GridPairs rows={rows} cols={2} /> : <AttributeList rows={rows} />;
}
