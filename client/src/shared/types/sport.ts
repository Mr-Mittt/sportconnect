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
  /** SPORT-4: the sport's real backend-served icon (`Sport.iconUrl`), resolved
   * via the live catalog by sportId — null when the catalog has no icon for
   * this sport yet. Renders through `SportIcon`, which falls back to a
   * generic icon when null. */
  iconUrl: string | null;
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
  /** SPORT-4: threaded through from `SportResponse.iconUrl` — previously
   * dropped here. */
  iconUrl: string | null;
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

/* ── A9 per-sport attribute schema (admin-managed) ───────────────────────────
 * 1:1 with the DTO tree in `modules/sport/sport-api` — served by
 * `GET /api/sports/{sportId}/attribute-schema`, replaced wholesale by the
 * matching `PUT`.
 *
 * Declared here rather than in `features/admin/` on purpose: ADMIN-2 (the
 * admin editor) and SPORT-2 (the user-facing renderer) are siblings over the
 * same document, and the second one to land must not redeclare these.
 */

/** 1:1 with `SportAttributeType`. Backend calls this out as client-visible —
 * a renderer branching on it (SPORT-2) needs a case per member. ADMIN-2 does
 * not branch: it edits the document as opaque JSON and lets the server
 * validate, so a new member needs no change here beyond this union. */
export type SportAttributeType = 'STRING' | 'ENUM' | 'LIST';

/** One selectable choice on an `ENUM`/`LIST` attribute. `value` is what gets
 * stored on the profile and is unique within its attribute; `label` is display
 * text only. Options are additive by policy — removing one that profiles may
 * already hold is unsafe; retire the whole attribute via `isAvailable`. */
export interface SportAttributeOption {
  value: string;
  label: string;
}

export interface SportAttributeDefinition {
  /** Unique across the entire sport, not just its group. Matches `^[a-z][a-zA-Z0-9_]*$`. */
  key: string;
  label: string;
  type: SportAttributeType;
  /** Required and non-empty for `ENUM`/`LIST`; absent or empty otherwise. */
  options?: SportAttributeOption[] | null;
  /** Soft delete. When `false` the attribute is not offered on profile writes,
   * but values already stored under this key stay readable — switching a field
   * off destroys nothing a user saved. */
  isAvailable?: boolean | null;
  /** Display order within the parent group. Not validated for uniqueness or contiguity. */
  order?: number | null;
  /** When present, must be valid for this node's own `type` and `options`. */
  defaultValue?: unknown;
}

export interface SportAttributeGroup {
  /** Unique among groups. Matches `^[a-z][a-zA-Z0-9_]*$`. */
  key: string;
  label: string;
  /** Soft delete that hides the *whole subtree* — children are not offered on
   * profile writes even where their own `isAvailable` is true. Parent state wins. */
  isAvailable?: boolean | null;
  order?: number | null;
  attributes: SportAttributeDefinition[];
}

/** The whole document. `GET` returns `data: null` for a sport that offers no
 * attributes — that is a valid state, not an error. */
export interface SportAttributeSchema {
  /** Document format version. The validator rejects a document without one,
   * so an empty starting document is `{ version: 1, groups: [] }`, never `{}`. */
  version: number;
  groups: SportAttributeGroup[];
}
