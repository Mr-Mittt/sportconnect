import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';

export function isGroupAvailable(group: ResolvedSportAttributeGroup): boolean {
  // SPORT-15: `hidden` suppresses the whole subtree in the editor, the same as a soft delete —
  // the stored values under it are untouched (a `hidden` group is code-managed data).
  return group.isAvailable !== false && group.hidden !== true;
}

export function isAttributeVisible(attribute: ResolvedSportAttributeDefinition): boolean {
  // SPORT-15: `hidden` ⇒ no input (value is code-written, e.g. a `Reference.url`). `hidden` wins
  // over any required flag (C11 rejects both upstream; this must not crash on a bad schema).
  return attribute.isAvailable !== false && attribute.hidden !== true;
}

/** Full `/`-separated path of a child node — `''` prefix (a root group) yields the bare key. */
export function joinPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}/${key}`;
}

/**
 * Every default the schema seeds into an empty form, keyed by attribute path: the visible, available
 * nodes that carry a `defaultValue`. A host that asks "did the user change anything?" compares against
 * this, because the seed lands in `values` on its own as soon as the schema loads.
 */
export function collectDefaultValues(schema: ResolvedSportAttributeSchema): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const walk = (groups: ResolvedSportAttributeGroup[], prefix: string) => {
    for (const group of groups) {
      if (!isGroupAvailable(group)) continue;
      const groupPath = joinPath(prefix, group.key);
      for (const attribute of group.attributes) {
        if (!isAttributeVisible(attribute)) continue;
        if (attribute.defaultValue === undefined || attribute.defaultValue === null) continue;
        defaults[joinPath(groupPath, attribute.key)] = attribute.defaultValue;
      }
      walk(group.groups ?? [], groupPath);
    }
  };
  walk(schema.groups, '');
  return defaults;
}

/**
 * Whether `values` holds anything the user entered, as opposed to what `SportAttributesFields` seeded
 * from the schema defaults on its own. Use this, never `Object.keys(values).length > 0` or a plain
 * comparison with the stored map, for every "is this form dirty / can it be saved" decision on an
 * attribute map: the seed arrives by itself once the schema has loaded, so on a slow machine an
 * untouched form already differs from where it started. A value counts when it has no default or
 * differs from its default; a `null` schema (not loaded, or the sport has none) seeds nothing.
 */
export function hasEditedAttributeValues(
  schema: ResolvedSportAttributeSchema | null,
  values: Record<string, unknown>,
): boolean {
  const defaults = schema === null ? {} : collectDefaultValues(schema);
  return Object.entries(values).some(
    ([path, value]) => !(path in defaults) || JSON.stringify(defaults[path]) !== JSON.stringify(value),
  );
}
