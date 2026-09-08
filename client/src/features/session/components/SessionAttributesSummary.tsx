import type { ReactNode } from 'react';
import type {
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeOption,
  ResolvedSportAttributeSchema,
  SportAttributeType,
} from '@/shared/types/sport';
import { cn } from '@/shared/lib/utils';

export interface SessionAttributesSummaryProps {
  /**
   * The resolved *session* attribute schema (A17) for this session's sport, from
   * `useSessionAttributeSchema`. Same `Resolved*` tree `SportAttributesFields` renders as inputs —
   * here it drives a read-only term/value view.
   */
  schema: ResolvedSportAttributeSchema;
  /**
   * `session.attributes` — the flat path→value map the session was created with (SESSION-23),
   * keyed by each attribute's full `/`-separated path from the schema root, exactly as
   * `SportAttributesFields` writes it.
   */
  values: Record<string, unknown>;
}

/** Full `/`-separated path of a child node — `''` prefix (a root group) yields the bare key. */
function joinPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}/${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionLabel(
  options: ResolvedSportAttributeOption[] | null | undefined,
  value: unknown,
): string {
  const asString = String(value);
  return options?.find((option) => option.value === asString)?.label ?? asString;
}

interface Row {
  key: string;
  term: string;
  node: ReactNode;
}

/** Term/value grid — one `<dt>`/`<dd>` pair per rendered attribute. */
function AttributeList({ rows }: { rows: Row[] }) {
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

/**
 * Renders one stored value for its schema `type`. Returns `null` when the value is absent, empty,
 * the wrong shape, or the type is one this client doesn't know — the caller then omits the row
 * entirely (a schema node with no usable stored value is not shown, and a stored key with no
 * schema node is never reached because rendering walks the schema, not the value map).
 */
function renderValueNode(
  type: SportAttributeType,
  value: unknown,
  options: ResolvedSportAttributeOption[] | null | undefined,
  definitionRef: string | null | undefined,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
): ReactNode | null {
  switch (type) {
    case 'STRING':
      return typeof value === 'string' && value.trim() !== '' ? value : null;
    case 'NUMBER':
      return typeof value === 'number' && !Number.isNaN(value) ? String(value) : null;
    case 'BOOLEAN':
      return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null;
    case 'ENUM':
      return typeof value === 'string' && value !== '' ? optionLabel(options, value) : null;
    case 'LIST': {
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
    }
    case 'DEFINITION': {
      const definitionType = definitionRef != null ? definitionsByName.get(definitionRef) : undefined;
      if (definitionType === undefined || !isRecord(value)) return null;
      return renderRecord(definitionType, value, definitionsByName);
    }
    case 'DEFINITION_LIST': {
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
    }
    default:
      return null;
  }
}

/** A `DEFINITION`/`DEFINITION_LIST` record value as its own nested term/value list. `null` when
 * no field in the record has a usable value. */
function renderRecord(
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
        field.options,
        field.definitionRef,
        definitionsByName,
      ),
    }))
    .filter((row): row is Row => row.node !== null);
  if (rows.length === 0) return null;
  return <AttributeList rows={rows} />;
}

/** One (sub-)group and its descendants. `null` when the group is unavailable or nothing inside it
 * has a stored value. */
function renderGroup(
  group: ResolvedSportAttributeSchema['groups'][number],
  prefix: string,
  depth: number,
  values: Record<string, unknown>,
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
): ReactNode | null {
  if (group.isAvailable === false) return null;
  const groupPath = joinPath(prefix, group.key);

  const rows: Row[] = group.attributes
    .filter((attribute) => attribute.isAvailable !== false)
    .map((attribute) => ({
      key: attribute.key,
      term: attribute.label,
      node: renderValueNode(
        attribute.type,
        values[joinPath(groupPath, attribute.key)],
        attribute.options,
        attribute.definitionRef,
        definitionsByName,
      ),
    }))
    .filter((row): row is Row => row.node !== null);

  const subGroups = (group.groups ?? [])
    .map((subGroup) => ({
      key: subGroup.key,
      node: renderGroup(subGroup, groupPath, depth + 1, values, definitionsByName),
    }))
    .filter((entry): entry is { key: string; node: ReactNode } => entry.node !== null);

  if (rows.length === 0 && subGroups.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1.5', depth > 0 && 'border-l border-border pl-3')}>
      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">{group.label}</p>
      {rows.length > 0 && <AttributeList rows={rows} />}
      {subGroups.map((entry) => (
        <div key={entry.key}>{entry.node}</div>
      ))}
    </div>
  );
}

/**
 * CLIENT-SESSION-16: read-only presentation of a session's stored `attributes`, resolved against
 * its sport's session attribute schema (A17). A term/value list, not a stack of disabled inputs —
 * `STRING`/`NUMBER` show the plain value, `BOOLEAN` shows Yes/No, `ENUM` shows the option's label,
 * `LIST` shows chips, `DEFINITION`/`DEFINITION_LIST` show an indented nested list.
 *
 * Renders **nothing** (`null`) when the session carries no attributes, the schema is empty, or
 * every field filters out (empty value, `isAvailable: false`, or a type this client doesn't know).
 * The enclosing modal can therefore mount it unconditionally. Editing is out of scope — the create
 * modal (`CreateSessionModal` → `SportAttributesFields`) is the only write path.
 */
export function SessionAttributesSummary({ schema, values }: SessionAttributesSummaryProps) {
  const definitionsByName = new Map<string, ResolvedSportAttributeDefinitionType>(
    (schema.definitions ?? []).map((definitionType) => [definitionType.name, definitionType]),
  );

  const groups = schema.groups
    .map((group) => ({
      key: group.key,
      node: renderGroup(group, '', 0, values, definitionsByName),
    }))
    .filter((entry): entry is { key: string; node: ReactNode } => entry.node !== null);

  if (groups.length === 0) return null;

  return (
    <section aria-label="Session detail" className="flex flex-col gap-2">
      <h3 className="text-2sm font-semibold text-text-primary">Session detail</h3>
      <div className="flex flex-col gap-3">
        {groups.map((entry) => (
          <div key={entry.key}>{entry.node}</div>
        ))}
      </div>
    </section>
  );
}
