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
  bio: string | null;
  /** Flat `Record<string, unknown>`. v3/A19: keyed by each attribute's **full
   * `/`-separated path** from the schema root (`gear/rackets`,
   * `general/handedness`), not the bare leaf key. The map shape is unchanged —
   * only the key convention. `SportAttributesFields` builds the path while
   * walking the group tree. */
  attributes: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ── Schema v2 per-sport attribute schema (admin-managed) ────────────────────
 * Raw shapes 1:1 with the DTO tree in `modules/sport/sport-api` — served raw
 * (every locale) by `GET /api/sports/all/{sportId}/attribute-schema` (admin,
 * ADMIN-2) and resolved (one string per locale) by
 * `GET /api/sports/{sportId}/attribute-schema` (member-facing, SPORT-2) — see
 * the `Resolved*` twins below. Both are replaced wholesale by the matching
 * admin `PUT`.
 *
 * Declared here rather than in `features/admin/` or `features/profile/` on
 * purpose: multiple features are siblings over the same document shape, and
 * the next one to land must not redeclare these.
 */

/** 1:1 with `SportAttributeType` — a closed 7-member union (v1's `STRING`/
 * `ENUM`/`LIST`, v2/A12's `DEFINITION`/`DEFINITION_LIST`, v2/A16's `NUMBER`/
 * `BOOLEAN`). Backend calls this out as client-visible — a renderer branching
 * on it (SPORT-2, `NUMBER`/`BOOLEAN` added by SPORT-9) needs a case per
 * member. ADMIN-2 does not branch: it edits the document as opaque JSON and
 * lets the server validate, so a new member needs no change there. */
export type SportAttributeType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'ENUM'
  | 'LIST'
  | 'DEFINITION'
  | 'DEFINITION_LIST';

/** Server-side default cap on every `LIST`/`DEFINITION_LIST` value
 * (`SportAttributeValues.MAX_LIST_ITEMS`, v2 design §9.2) — not readable off
 * the schema response, so hardcoded here and shared by SPORT-2 (the `LIST`
 * multi-select) and SPORT-6 (the `DEFINITION_LIST` add/remove rows). */
export const MAX_LIST_ITEMS = 10;

/** One selectable choice on an `ENUM`/`LIST` node — raw shape, `label` is
 * every locale (admin only). `value` is what gets stored and is unique
 * within its node; options are additive by policy — removing one that
 * profiles may already hold is unsafe, retire the whole node via
 * `isAvailable` instead. See `ResolvedSportAttributeOption` for the
 * member-facing resolved twin (one string). */
export interface SportAttributeOption {
  value: string;
  label: Record<string, string>;
}

/** One field within a `SportAttributeDefinitionType` record (v2/A12). `key`
 * is unique only within its own definition — unlike `SportAttributeDefinition
 * .key` it is never written directly into `UserSportProfile.attributes`, only
 * nested inside the record stored under some attribute's key. Never itself
 * `DEFINITION_LIST` — a record field is never a repeating list (depth-2 rule,
 * v2 design §5.3). */
export interface SportAttributeField {
  key: string;
  label: Record<string, string>;
  type: SportAttributeType;
  /** Required and non-empty for `ENUM`/`LIST`; absent or empty otherwise. */
  options?: SportAttributeOption[] | null;
  /** Required when `type` is `DEFINITION`; absent for every other type. */
  definitionRef?: string | null;
  /** Missing/invalid ⇒ the whole enclosing record is dropped, not just this
   * field (v2 design §6). Absent reads as `false`. */
  isRequired?: boolean | null;
  /** SPORT-9/A16: inclusive bounds, meaningful only on `NUMBER` — rejected server-side on every
   * other type. Independent and optional; either, both, or neither may be set. A UX affordance
   * only (mirrored as `<input>` `min`/`max`) — the server silently drops an out-of-range value on
   * save rather than erroring (A3 merge semantics keep the field's previous value), so this never
   * gates a hard client-side error. */
  min?: number | null;
  max?: number | null;
}

/** A named, reusable record shape declared once in a sport's schema and
 * referenced by name — from an attribute or from another definition's field
 * — via `definitionRef` (v2/A12). Sport-local by design (v2 design §5.4):
 * every document is self-contained, even at the cost of two sports each
 * declaring their own e.g. `ShoeSize`. */
export interface SportAttributeDefinitionType {
  /** Unique within the document. PascalCase (`^[A-Z][a-zA-Z0-9]*$`) — a type
   * namespace, never itself written into a stored profile. */
  name: string;
  fields: SportAttributeField[];
}

export interface SportAttributeDefinition {
  /** Unique across the entire sport, not just its group. Matches `^[a-z][a-zA-Z0-9_]*$`. */
  key: string;
  label: Record<string, string>;
  type: SportAttributeType;
  /** Required and non-empty for `ENUM`/`LIST`; absent or empty otherwise. */
  options?: SportAttributeOption[] | null;
  /** Soft delete. When `false` the attribute is not offered on profile writes,
   * but values already stored under this key stay readable — switching a field
   * off destroys nothing a user saved. */
  isAvailable?: boolean | null;
  /** When present, must be valid for this node's own `type` and `options`.
   * Forbidden for `DEFINITION`/`DEFINITION_LIST` (v2 design §5.5) — a
   * prefilled record would read as the user's own data, not a placeholder. */
  defaultValue?: unknown;
  /** The `SportAttributeDefinitionType.name` this attribute's value is shaped
   * by. Required when `type` is `DEFINITION`/`DEFINITION_LIST`; absent for
   * every other type. */
  definitionRef?: string | null;
  /** Entity-linking typeahead pool (v2 design §8.3), e.g.
   * `"equipment.racket.badminton"` — only meaningful on `DEFINITION`/
   * `DEFINITION_LIST`. Absent means plain free text, no typeahead. */
  searchScope?: string | null;
  /** SPORT-9/A16: see `SportAttributeField.min`/`.max` — same rules, one level up. */
  min?: number | null;
  max?: number | null;
}

export interface SportAttributeGroup {
  /** Sibling-unique (v3/A19) — unique only among its parent's child sub-groups
   * and attributes, which share one namespace, not sport-wide. Matches
   * `^[a-z][a-zA-Z0-9_]*$`. */
  key: string;
  label: Record<string, string>;
  /** Soft delete that hides the *whole subtree* at every depth — children and
   * descendant sub-groups are not offered on profile writes even where their
   * own `isAvailable` is true. Parent state wins, recursively. */
  isAvailable?: boolean | null;
  attributes: SportAttributeDefinition[];
  /** v3/A19: nested sub-groups. A group may carry `groups` and `attributes`
   * together, to arbitrary depth (nesting is by containment, so no cycle and no
   * depth counter). Absent/`null`/`[]` on a leaf group. */
  groups?: SportAttributeGroup[] | null;
}

/** The whole raw document (admin-only path). `GET` returns `data: null` for a
 * sport that offers no attributes — that is a valid state, not an error. No
 * `version` field — A12 removed it server-side (v2 design §11); there is no
 * plan to version the schema syntax, so don't reintroduce it. */
export interface SportAttributeSchema {
  /** Sport-local registry of record shapes a `DEFINITION`/`DEFINITION_LIST`
   * attribute or record field may reference by name. Absent/empty on a
   * document using neither. */
  definitions?: SportAttributeDefinitionType[] | null;
  groups: SportAttributeGroup[];
  /** BCP 47 (e.g. `"en"`) — every labeled node's `label` map must carry an
   * entry for this locale. */
  defaultLocale: string;
}

/* ── Resolved twins — member-facing (SPORT-2). `label` is already resolved to
 * one display string for the caller's `Accept-Language` (A13) instead of the
 * raw locale map above. Served by `GET /api/sports/{sportId}/attribute-schema`.
 * 1:1 with the `Resolved*` DTO tree in `modules/sport/sport-api`. No
 * `defaultLocale` — that's only ever an input to resolution, not something a
 * resolved-for-one-locale document needs to carry. */

export interface ResolvedSportAttributeOption {
  value: string;
  label: string;
}

export interface ResolvedSportAttributeField {
  key: string;
  label: string;
  type: SportAttributeType;
  options?: ResolvedSportAttributeOption[] | null;
  definitionRef?: string | null;
  isRequired?: boolean | null;
  /** SPORT-9/A16: see `SportAttributeField.min`/`.max`. */
  min?: number | null;
  max?: number | null;
}

export interface ResolvedSportAttributeDefinitionType {
  name: string;
  fields: ResolvedSportAttributeField[];
}

export interface ResolvedSportAttributeDefinition {
  key: string;
  label: string;
  type: SportAttributeType;
  options?: ResolvedSportAttributeOption[] | null;
  isAvailable?: boolean | null;
  defaultValue?: unknown;
  definitionRef?: string | null;
  searchScope?: string | null;
  /** SPORT-9/A16: see `SportAttributeField.min`/`.max`. */
  min?: number | null;
  max?: number | null;
  /** A17 (`modules/sport/sport-impl`), populated on the **session** attribute schema resolution
   * only (`GET /api/sports/{sportId}/session-attribute-schema`): `true` on a `#ref` node — one
   * that mirrors one of the sport's profile attributes and can be seeded from the user's own
   * profile. Absent/`null` on an "own" (event-only) node and on every profile-schema
   * (`/attribute-schema`) resolution. Read by CLIENT-SESSION-15 to decide which fields to
   * pre-fill. */
  prefillable?: boolean | null;
  /** A17, session schema only: when {@link prefillable} is `true`, the full `/`-separated path of
   * the referenced profile attribute — the key to read from `profile.attributes[prefillKey]`. */
  prefillKey?: string | null;
}

export interface ResolvedSportAttributeGroup {
  key: string;
  label: string;
  isAvailable?: boolean | null;
  attributes: ResolvedSportAttributeDefinition[];
  /** v3/A19: nested sub-groups, resolved twin of `SportAttributeGroup.groups`.
   * Rendered recursively by `SportAttributesFields`, one indent level per depth.
   * Absent/`null`/`[]` on a leaf group. */
  groups?: ResolvedSportAttributeGroup[] | null;
}

/** The whole document `GET /api/sports/{sportId}/attribute-schema` returns —
 * `SportAttributesFields`' `schema` prop. `data: null` for a sport with no
 * attributes (valid state, not an error) — callers check for `null` before
 * rendering. */
export interface ResolvedSportAttributeSchema {
  definitions?: ResolvedSportAttributeDefinitionType[] | null;
  groups: ResolvedSportAttributeGroup[];
}
