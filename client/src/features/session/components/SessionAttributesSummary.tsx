import type { ReactNode } from 'react';
import type {
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeSchema,
  SportAttributeType,
} from '@/shared/types/sport';
import { isRefAttribute } from '@/shared/types/sport';
import { cn } from '@/shared/lib/utils';
import { AttributeList, renderValueNode, type Row } from '@/shared/components/attributeFields/attributeValues';

/**
 * The type `renderValueNode` should use for a resolved node's stored value. For an "own" node it is
 * just `node.type`. For a `#ref`-derived node (CLIENT-SESSION-17) the stored value's *shape* is
 * driven by `cardinality`, not the inherited scalar `type` — a `LIST` `#ref` stores an array, a
 * `SINGLE` `#ref` a single instance — so map it onto the matching own-node render type:
 * `LIST` → `LIST` (scalar base) / `DEFINITION_LIST` (record base); `SINGLE` → the base type as-is
 * (scalar) / `DEFINITION` (record base).
 */
function effectiveRenderType(attribute: ResolvedSportAttributeDefinition): SportAttributeType {
  if (!isRefAttribute(attribute)) return attribute.type;
  const ref: ResolvedRefAttribute = attribute;
  const recordBase = ref.type === 'DEFINITION' || ref.type === 'DEFINITION_LIST';
  if (ref.cardinality === 'LIST') return recordBase ? 'DEFINITION_LIST' : 'LIST';
  return recordBase ? 'DEFINITION' : ref.type;
}

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
        effectiveRenderType(attribute),
        values[joinPath(groupPath, attribute.key)],
        'options' in attribute ? attribute.options : undefined,
        'definitionRef' in attribute ? attribute.definitionRef : undefined,
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
 * `LIST` shows chips, `DEFINITION`/`DEFINITION_LIST` show an indented nested list. A `#ref`
 * attribute (CLIENT-SESSION-17) stores a plain scalar / array / record and renders through the
 * same `renderValueNode` on its inherited `type` — a `SINGLE` `#ref` shows a plain value, a `LIST`
 * `#ref` shows chips.
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
