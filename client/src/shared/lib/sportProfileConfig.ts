import i18next from 'i18next';
import type { SportKey } from '@/shared/types/sport';

/**
 * Static client-side label/colorRamp config, keyed by the client's own
 * SportKey — not driven by the backend's `Sport.name` (same approach
 * sport-impl's A3 ticket already took for per-sport attributes; SPORT-1
 * reused it rather than inventing a backend-driven mapping). Follows
 * client/CLAUDE.md's ramp assignment order (teal, coral, purple, then pink,
 * then gray — never blue/green/amber/red).
 *
 * SPORT-3: re-curated for the MVP's real active catalog (Badminton +
 * Pickleball, per sport-impl's A6) — football/basketball/tennis are no
 * longer active server-side, so they're dropped rather than kept as dormant
 * entries nothing in the live catalog can reach. Since `SportKey` is now a
 * live-derived `string` (not a closed union), a sport the catalog returns
 * with no bespoke entry here degrades through `getSportProfileConfig`'s
 * fallback below instead of a compile error.
 *
 * SPORT-4: dropped the `icon` field (used to hold a Tabler stand-in name,
 * e.g. Badminton's `'ball-tennis'`) — `SportProfile.iconUrl` now comes from
 * the live catalog's real backend-served icon instead of a hand-picked
 * approximation here.
 *
 * CLIENT-I18N-11: `label` is no longer hardcoded English — it is resolved per call
 * through `getSportLabel` (`common:sport.*`), so anything memoizing a `SportProfile`
 * must depend on `i18n.language`.
 */
const SPORT_PROFILE_CONFIG: Record<SportKey, { colorRamp: string }> = {
  badminton: { colorRamp: 'teal' },
  pickleball: { colorRamp: 'coral' },
};

/** Generic fallback for any catalog sport with no bespoke entry above yet —
 * e.g. one reactivated server-side before this config is updated for it.
 * Title-cases the raw key as a readable label rather than showing it
 * verbatim. Neutral ramp, never blue/green/amber/red (reserved for semantic
 * meaning app-wide, per client/CLAUDE.md). */
function fallbackSportProfileConfig(): { colorRamp: string } {
  return { colorRamp: 'gray' };
}

/** CLIENT-I18N-11: the localized display name for a sport. Resolves
 * `common:sport.<key>` against the i18next singleton (plain function, same
 * pattern as `relativeTime.ts`, so it follows the active language), then falls
 * back to the backend-provided `fallbackName`, then to the title-cased key —
 * `SportKey` is a live-derived `string`, so a catalog sport with no locale
 * entry yet is a real case. Callers holding only a backend `sportName` should
 * pass it as the fallback. */
export function getSportLabel(key: SportKey, fallbackName?: string): string {
  const i18nKey = `common:sport.${key}`;
  if (i18next.exists(i18nKey)) {
    return i18next.t(i18nKey);
  }
  return fallbackName ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Looks up a sport's label/colorRamp, falling back to a generic entry
 * instead of `undefined` — safe to call for any `SportKey` the live catalog
 * can return, not just the ones with a bespoke entry above. Use this instead
 * of indexing `SPORT_PROFILE_CONFIG` directly. */
export function getSportProfileConfig(key: SportKey): { label: string; colorRamp: string } {
  return { label: getSportLabel(key), ...(SPORT_PROFILE_CONFIG[key] ?? fallbackSportProfileConfig()) };
}
