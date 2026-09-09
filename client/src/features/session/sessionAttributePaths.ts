import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';

/** Full `/`-separated path of a child node — `''` prefix (a root group) yields the bare key.
 * Same convention `SportAttributesFields` uses (SPORT-7/A19). */
function joinPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}/${key}`;
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
 * Every attribute path the resolved schema declares (available nodes only), for trimming a draft
 * down to the current sport's schema before it goes in the create payload — a draft can carry
 * stale keys from a previously-selected sport (the modal's fields reset on sport change, but the
 * draft map is rebuilt, not diffed). The backend drops unknown keys anyway; this keeps the
 * request honest.
 *
 * (CLIENT-SESSION-15 shipped this in `sessionAttributePrefill.ts` alongside a one-shot `#ref`
 * pre-fill; A23 made `#ref` a *choice source* rather than a pre-filled value — see
 * `sessionRefChoices` / `RefField` — so the pre-fill helpers are gone and this file is the
 * path-collection remainder, renamed.)
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
