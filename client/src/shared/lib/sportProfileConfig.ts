import type { SportKey } from '@/shared/types/sport';

/**
 * Static client-side label/icon/colorRamp config, keyed by the client's own
 * SportKey — not driven by the backend's `Sport.name`/`iconUrl` (same
 * approach sport-impl's A3 ticket already took for per-sport attributes;
 * SPORT-1 reuses it rather than inventing a backend-driven mapping). Follows
 * client/CLAUDE.md's ramp assignment order (teal, coral, purple, then pink,
 * then gray — never blue/green/amber/red).
 */
export const SPORT_PROFILE_CONFIG: Record<
  SportKey,
  { label: string; icon: string; colorRamp: string }
> = {
  football: { label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

/** Every SportKey the client knows about, in ramp-assignment order — the
 * "Add sport" flow's picker is bounded to this list (not the backend's
 * full sport catalog, which includes sports with no client-side label/icon/
 * ramp yet). Add a new key here (and to SPORT_PROFILE_CONFIG and
 * sportIdMap.ts's SPORT_ID_BY_KEY) when a 4th sport is scoped. */
export const ALL_SPORT_KEYS: SportKey[] = ['football', 'basketball', 'tennis'];
