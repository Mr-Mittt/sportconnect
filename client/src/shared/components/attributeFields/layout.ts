import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { devWarn } from '@/shared/lib/devWarn';

export interface NormalizedLayout {
  /** A non-empty `layout.id`, or `null` when there is no usable hint. */
  id: string | null;
  /** A non-empty `layout.format` pattern, or `null`. */
  format: string | null;
}

const EMPTY: NormalizedLayout = { id: null, format: null };

/**
 * SPORT-13: validate a resolved `layout` object once, before an arm switches on it.
 *
 * `null`/`undefined` → no hint (the arm renders its default, silently — an absent hint is normal).
 * A present-but-malformed `layout` (not an object, or missing a string `id`) → no hint **and** a
 * deduped {@link devWarn}, since the author clearly meant something. `context` names the node in
 * the warning (its key/path).
 */
export function normalizeLayout(
  layout: ResolvedAttributeLayout | null | undefined,
  context: string,
): NormalizedLayout {
  if (layout == null) return EMPTY;
  if (typeof layout !== 'object' || Array.isArray(layout)) {
    devWarn(`layout-shape:${context}`, `"${context}" has a non-object \`layout\` — ignoring it`);
    return EMPTY;
  }
  const { id, format } = layout as ResolvedAttributeLayout;
  if (typeof id !== 'string' || id === '') {
    devWarn(`layout-id-missing:${context}`, `"${context}" \`layout\` has no string \`id\` — ignoring it`);
    return { id: null, format: typeof format === 'string' && format !== '' ? format : null };
  }
  return { id, format: typeof format === 'string' && format !== '' ? format : null };
}

/**
 * Resolve `id` against the arm's supported set. An unknown id (for this element/type) → `fallback`
 * + a deduped warning; a `null` id → `fallback` silently.
 */
export function pickLayoutId<T extends string>(
  id: string | null,
  allowed: readonly T[],
  fallback: T,
  context: string,
): T {
  if (id == null) return fallback;
  if ((allowed as readonly string[]).includes(id)) return id as T;
  devWarn(
    `layout-id-unknown:${context}:${id}`,
    `"${context}" \`layout.id\` "${id}" is not one of ${allowed.join('/')} — using "${fallback}"`,
  );
  return fallback;
}
