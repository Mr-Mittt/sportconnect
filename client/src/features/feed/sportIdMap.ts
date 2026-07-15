import type { SportKey } from '@/shared/types/sport';

/**
 * TEMPORARY bridge between the client's SportKey convention and the
 * backend's real `sports.id`. Originally built for `Post.sportId` (FEED-1);
 * SPORT-1 reuses `sportKeyForId()` as-is for its own
 * UserSportProfileResponse -> SportProfile mapping too, rather than adding a
 * second id<->key table — this file is the one source of truth for both.
 *
 * Ids derived from `server/.../V003__create_sports_tables.sql`'s INSERT
 * order (BIGSERIAL, no explicit ids — Badminton=1, Tennis=2, Pickleball=3,
 * Table Tennis=4, Soccer=5, Basketball=6, ...) and confirmed unchanged by
 * `V014__update_sports_with_thumbnails_and_metadata.sql` (UPDATEs by name
 * only, no new INSERTs before Basketball/Tennis/Soccer).
 *
 * NOTE: the backend has no sport named "Football" — only "Soccer". This
 * map treats them as the same real-world sport (SPORT-1 made the same call
 * for sport profiles, rather than renaming the client's SportKey).
 */
export const SPORT_ID_BY_KEY: Record<SportKey, number> = {
  football: 5, // Soccer
  basketball: 6,
  tennis: 2,
};

const KEY_BY_SPORT_ID = new Map<number, SportKey>(
  Object.entries(SPORT_ID_BY_KEY).map(([key, id]) => [id, key as SportKey]),
);

/** Reverse lookup — undefined for any sportId outside the 3 known sports (e.g. null, or a real sportId this temporary map doesn't cover). */
export function sportKeyForId(sportId: number | null): SportKey | undefined {
  return sportId === null ? undefined : KEY_BY_SPORT_ID.get(sportId);
}
