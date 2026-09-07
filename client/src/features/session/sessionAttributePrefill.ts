import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeSchema,
  SportAttributeType,
} from '@/shared/types/sport';

/** Full `/`-separated path of a child node — `''` prefix (a root group) yields the bare key.
 * Same convention `SportAttributesFields` uses (SPORT-7/A19). */
function joinPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}/${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a stored profile value is shape-compatible with the resolved node it would seed. The
 * two schemas (a sport's *profile* schema and its *session* schema) are admin-edited
 * independently, so a `prefillKey` can resolve to a value whose type no longer matches the
 * session node — e.g. the profile node was switched `STRING -> NUMBER` after the value was saved
 * (schema v2/v3 keeps stored values readable across such a change). An empty string / null /
 * undefined counts as "no value", never a match.
 */
export function isPrefillValueCompatible(value: unknown, type: SportAttributeType): boolean {
  if (value === undefined || value === null || value === '') return false;
  switch (type) {
    case 'STRING':
    case 'ENUM':
      return typeof value === 'string';
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value);
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'LIST':
    case 'DEFINITION_LIST':
      return Array.isArray(value);
    case 'DEFINITION':
      return isRecord(value);
    default:
      return false;
  }
}

function walkGroups(
  groups: ResolvedSportAttributeGroup[],
  prefix: string,
  visit: (attribute: ResolvedSportAttributeDefinition, path: string) => void,
): void {
  for (const group of groups) {
    if (group.isAvailable === false) continue;
    const groupPath = joinPath(prefix, group.key);
    for (const attribute of group.attributes) {
      if (attribute.isAvailable === false) continue;
      visit(attribute, joinPath(groupPath, attribute.key));
    }
    walkGroups(group.groups ?? [], groupPath, visit);
  }
}

/**
 * CLIENT-SESSION-15: seeds a `CreateSessionModal` attributes draft from the creator's sport
 * profile. For every resolved **session-schema** node flagged `prefillable` (an A17 `#ref` node),
 * reads `profileAttributes[node.prefillKey]` — `prefillKey` is already the full `/`-path of the
 * mirrored *profile* attribute (A17 + SPORT-7) — and seeds it at the **session** node's own full
 * path, but only when the stored value is present and {@link isPrefillValueCompatible}. Own
 * (non-`prefillable`) nodes are not touched here — `SportAttributesFields` seeds their
 * `defaultValue` itself, same as the profile editor.
 *
 * Returns a flat `path -> value` map (possibly empty). The caller overlays it *under* any value
 * the user has already entered.
 */
export function buildSessionAttributePrefill(
  schema: ResolvedSportAttributeSchema,
  profileAttributes: Record<string, unknown> | null,
): Record<string, unknown> {
  const seeds: Record<string, unknown> = {};
  if (profileAttributes === null) return seeds;
  walkGroups(schema.groups, '', (attribute, path) => {
    if (attribute.prefillable !== true) return;
    const prefillKey = attribute.prefillKey;
    if (prefillKey == null || prefillKey === '') return;
    const raw = profileAttributes[prefillKey];
    if (!isPrefillValueCompatible(raw, attribute.type)) return;
    seeds[path] = raw;
  });
  return seeds;
}

/**
 * Every attribute path the resolved schema declares (available nodes only), for trimming a draft
 * down to the current sport's schema before it goes in the create payload — a draft can carry
 * stale keys from a previously-selected sport (the modal's fields reset on sport change, but the
 * draft map is rebuilt, not diffed). The backend drops unknown keys anyway; this keeps the
 * request honest.
 */
export function collectSchemaPaths(schema: ResolvedSportAttributeSchema): Set<string> {
  const paths = new Set<string>();
  walkGroups(schema.groups, '', (_attribute, path) => {
    paths.add(path);
  });
  return paths;
}

/** `values` restricted to the keys in `allowed`. */
export function pickPaths(
  values: Record<string, unknown>,
  allowed: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}
