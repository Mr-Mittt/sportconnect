/**
 * SPORT-3: derived from the live sport catalog (`GET /api/sports`) — no
 * longer a fixed string-literal union. `key` is a sport's lowercased `name`
 * (see `useSportCatalog()`/`sportCatalogStore`), so any sport the backend
 * serves is a valid `SportKey` at runtime; there is nothing to extend here
 * by hand anymore.
 */
export type SportKey = string;

export interface SportProfile {
  key: SportKey;
  label: string;
  icon: string; // icon name, e.g. 'ball-football'
  colorRamp: string; // design-token ramp name, e.g. 'teal'
}

/** 1:1 with `SportResponse` (`modules/sport/sport-api`) — the raw shape
 * `GET /api/sports` returns (SPORT-3's real catalog fetch). */
export interface SportResponse {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  iconUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Normalized catalog entry `useSportCatalog()` derives from `SportResponse`
 * — `key` is `name.toLowerCase()`, the same "key = lowercased sport name"
 * convention the old hardcoded `SPORT_ID_BY_KEY` used for
 * football/basketball/tennis. */
export interface SportCatalogEntry {
  id: number;
  key: SportKey;
  name: string;
}

/** 1:1 with `UserSportProfileResponse` (`modules/sport/sport-api`) — the raw
 * shape `GET /api/sports/profiles/user/{userId}` returns, before SPORT-1's
 * mapping layer resolves it to a `SportProfile`. */
export interface UserSportProfileResponse {
  id: number;
  userId: string;
  sportId: number;
  sportName: string;
  skillLevel: string | null;
  yearsOfExperience: number | null;
  preferredPosition: string | null;
  bio: string | null;
  attributes: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
