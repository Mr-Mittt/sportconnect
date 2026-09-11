import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { devWarn } from '@/shared/lib/devWarn';

export interface NormalizedLayout {
  /** A non-empty `layout.id`, or `null` when there is no usable hint. */
  id: string | null;
  /** The `layout.format` pattern resolved to one string for the UI locale, or `null`. */
  format: string | null;
  /** SPORT-14: a non-empty `layout.icon` (Tabler outline name) for container headings, or `null`.
   * Resolved to a component by `resolveHeadingIcon` (`headingIcons.tsx`); the scalar arms ignore it. */
  icon: string | null;
}

const EMPTY: NormalizedLayout = { id: null, format: null, icon: null };

/** SPORT-16: the app has no UI locale yet (`I18N-1`, V1) — same hardcoded `'en-US'` default
 * `formatAttributeValue` carries. When i18n lands, thread the resolved UI locale in here. */
const UI_LOCALE = 'en-US';

/**
 * SPORT-16: `common` C11 carries `layout.format` **raw** — a `locale -> pattern` map, like a
 * `label` map, no longer server-resolved to one string. Resolve it here: exact UI locale, then
 * `'en'` (what every seeded schema uses), else treat it as no format (return `null` — the readers
 * then show the raw value, same as an absent pattern). A bare string is tolerated (older fixtures /
 * a hand-built layout) and returned as-is.
 */
export function resolveFormatMap(
  format: Record<string, string> | string | null | undefined,
): string | null {
  if (format == null) return null;
  if (typeof format === 'string') return format === '' ? null : format;
  if (typeof format !== 'object' || Array.isArray(format)) return null;
  const picked = format[UI_LOCALE] ?? format.en;
  return typeof picked === 'string' && picked !== '' ? picked : null;
}

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
  const { id, format, icon } = layout as ResolvedAttributeLayout;
  const cleanFormat = resolveFormatMap(format);
  const cleanIcon = typeof icon === 'string' && icon !== '' ? icon : null;
  if (typeof id !== 'string' || id === '') {
    devWarn(`layout-id-missing:${context}`, `"${context}" \`layout\` has no string \`id\` — ignoring it`);
    return { id: null, format: cleanFormat, icon: cleanIcon };
  }
  return { id, format: cleanFormat, icon: cleanIcon };
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
