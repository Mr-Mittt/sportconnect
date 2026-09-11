import type {
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeField,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';

/**
 * SPORT-16: apply a `#ref` node's `fieldLayouts` overrides to the definition type it points at,
 * returning a **new** `definitionsByName` map with just that one entry replaced. Every renderer
 * (`DefinitionFields`, `renderRecord`, `renderValueNode`) resolves the definition by name from the
 * map, so swapping the entry threads the overrides through with no other signature change.
 *
 * Per field: `node.fieldLayouts[field.key]` (an unknown key is ignored) —
 * - `layout` is **replaced** whole when the override carries any of `id` / `icon` / `format`
 *   (`fieldLayouts[key] ?? field.layout`, not a deep merge); a `{ hidden: true }`-only override
 *   leaves `field.layout` in force;
 * - `hidden` becomes `override.hidden ?? field.hidden`.
 *
 * Never touches `type` / `options` / `isRequired` / `definitionRef`. Returns the map unchanged when
 * the node has no `fieldLayouts`, no `definitionRef`, or that definition is not in the map.
 */
export function applyRefFieldLayouts(
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>,
  node: Pick<ResolvedRefAttribute, 'definitionRef' | 'fieldLayouts'>,
): Map<string, ResolvedSportAttributeDefinitionType> {
  const overrides = node.fieldLayouts;
  const name = node.definitionRef;
  if (overrides == null || name == null) return definitionsByName;

  const base = definitionsByName.get(name);
  if (base === undefined) return definitionsByName;

  const fields: ResolvedSportAttributeField[] = base.fields.map((field) => {
    const override = overrides[field.key];
    if (override == null) return field;

    const hasLayout =
      override.id != null || override.icon != null || override.format != null;
    return {
      ...field,
      layout: hasLayout
        ? { id: override.id ?? '', icon: override.icon ?? null, format: override.format ?? null }
        : field.layout,
      hidden: override.hidden ?? field.hidden,
    };
  });

  const next = new Map(definitionsByName);
  next.set(name, { ...base, fields });
  return next;
}

/**
 * SPORT-16: find a node in a resolved schema by its full `/`-separated path from the schema root
 * (`gear/rackets`, `general/handedness`). Walks group keys down the path, then matches the last
 * segment against the target group's `attributes`. `undefined` when the schema is missing or the
 * path does not resolve. Used to read a `#ref` node's base attribute (`node.layout ??
 * baseAttr.layout` inheritance — `common` C11's client-side open-decision resolution).
 */
export function findAttributeByPath(
  schema: ResolvedSportAttributeSchema | null | undefined,
  path: string | null | undefined,
): ResolvedSportAttributeDefinition | undefined {
  if (schema == null || path == null || path === '') return undefined;
  const segments = path.split('/');
  // Every attribute lives under at least one group, so a bare single-segment path has no node.
  if (segments.length < 2) return undefined;
  const leaf = segments[segments.length - 1];
  const groupPath = segments.slice(0, -1);

  let groups: ResolvedSportAttributeGroup[] = schema.groups;
  let target: ResolvedSportAttributeGroup | undefined;
  for (const key of groupPath) {
    target = groups.find((group) => group.key === key);
    if (target === undefined) return undefined;
    groups = target.groups ?? [];
  }
  return target?.attributes.find((attribute) => attribute.key === leaf);
}
