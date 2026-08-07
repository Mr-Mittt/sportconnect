import type { SportKey } from '@/shared/types/sport';

/**
 * Static client-side label/icon/colorRamp config, keyed by the client's own
 * SportKey — not driven by the backend's `Sport.name`/`iconUrl` (same
 * approach sport-impl's A3 ticket already took for per-sport attributes;
 * SPORT-1 reused it rather than inventing a backend-driven mapping). Follows
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
 */
const SPORT_PROFILE_CONFIG: Record<SportKey, { label: string; icon: string; colorRamp: string }> = {
  badminton: { label: 'Badminton', icon: 'ball-tennis', colorRamp: 'teal' },
  pickleball: { label: 'Pickleball', icon: 'tournament', colorRamp: 'coral' },
};

/** Generic fallback for any catalog sport with no bespoke entry above yet —
 * e.g. one reactivated server-side before this config is updated for it.
 * Title-cases the raw key as a readable label rather than showing it
 * verbatim. Neutral ramp/icon, never blue/green/amber/red (reserved for
 * semantic meaning app-wide, per client/CLAUDE.md). */
function fallbackSportProfileConfig(key: SportKey): { label: string; icon: string; colorRamp: string } {
  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    icon: 'question-mark',
    colorRamp: 'gray',
  };
}

/** Looks up a sport's label/icon/colorRamp, falling back to a generic entry
 * instead of `undefined` — safe to call for any `SportKey` the live catalog
 * can return, not just the ones with a bespoke entry above. Use this instead
 * of indexing `SPORT_PROFILE_CONFIG` directly. */
export function getSportProfileConfig(key: SportKey): { label: string; icon: string; colorRamp: string } {
  return SPORT_PROFILE_CONFIG[key] ?? fallbackSportProfileConfig(key);
}
