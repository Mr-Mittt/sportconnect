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

/**
 * SPORT-13: an optional schema-driven presentation hint on any attribute/field/group node.
 * `layout` is an **object** (not a bare string) so more props can be added without another type
 * change — `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` holds the vocabulary. The renderer
 * degrades to its current default when `layout` is absent, malformed, or carries an id it doesn't
 * recognise for that element/type — a `layout` never gates a hard error.
 *
 * `AttributeLayout` is the raw shape (admin path): `format` is a locale map, exactly like
 * `label`. `ResolvedAttributeLayout` is the member-facing twin, `format` already resolved to one
 * string. The backend field that carries this is `common` C11 (not shipped yet — until then no
 * resolved schema sets `layout` and the renderer stays on its defaults).
 */
export interface AttributeLayout {
  /** Layout id for this element/type — one of the sets in the design doc. */
  id: string;
  /** SPORT-14 renders this (Tabler outline name) on container headings; SPORT-13 ignores it. */
  icon?: string | null;
  /** Value-format pattern, per locale (mirrors `label`). SPORT-13 grammar — NUMBER: `0`, `0.0`,
   * `0.00`, `#,##0`, `#,##0.0`, `0%`, with an optional literal prefix/suffix; STRING: `uppercase`,
   * `lowercase`, `titlecase`. */
  format?: Record<string, string> | null;
}

/** Resolved twin of {@link AttributeLayout} — `format` is one already-resolved pattern string. */
export interface ResolvedAttributeLayout {
  id: string;
  icon?: string | null;
  format?: string | null;
}

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
  /** SPORT-13: optional presentation hint — see {@link AttributeLayout}. */
  layout?: AttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag. A `hidden` field's value is stored and round-trips
   * normally, but no editor input and no read-only row is rendered for it (e.g. a code-populated
   * `Reference.url`). Mutually exclusive with `isRequired` (C11 validator rejects both; client-side
   * `hidden` wins). Not a soft delete — that is `isAvailable`. */
  hidden?: boolean | null;
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
  /** SPORT-13: optional presentation hint — see {@link AttributeLayout}. */
  layout?: AttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag — see {@link SportAttributeField.hidden}. Mutually
   * exclusive with a `defaultValue`-less required field. */
  hidden?: boolean | null;
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
  /** SPORT-13: optional presentation hint. Group layout (child arrangement + heading `icon`) is
   * rendered by SPORT-14 — added here now to keep the type stable across the split. */
  layout?: AttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag — a `hidden` group renders no editor section and no
   * read-only section (its whole subtree). Values under it still round-trip. */
  hidden?: boolean | null;
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

/* ── Session attribute schema — the raw admin document (A17,
 * `modules/sport/sport-impl`). Parallel to `SportAttributeSchema` above (the
 * *profile* schema) but describes which attributes a *session* of the sport may
 * carry. Read/written only by the admin editor (ADMIN-5) via
 * `GET /api/sports/all/{sportId}/session-attribute-schema` and its `PUT`; the
 * member-facing `GET /api/sports/{sportId}/session-attribute-schema` returns a
 * `ResolvedSportAttributeSchema` instead (see `useSessionAttributeSchema`).
 * 1:1 with the `SessionAttributeSchema`/`SessionAttributeGroup`/`SessionAttributeNode`
 * DTOs in `modules/sport/sport-api`. `GET` returns `data: null` for a sport
 * whose sessions offer no attributes — a valid state, not an error. */

/** One attribute node under a `SessionAttributeGroup` — one of two kinds,
 * distinguished by whether `#ref` is set (A17):
 * - **`#ref` node** (`#ref` non-null, A23/D9): draws its value(s) from the
 *   profile-schema attribute at that full `/`-separated path (`gear/rackets`).
 *   `type`/`options`/`definitionRef` are inherited; carries its own explicit
 *   `key` and a required `cardinality` (`SINGLE`/`LIST`), and an optional
 *   `label` override. Every other own-node field must be null/absent.
 * - **own node** (`#ref` null): a self-contained event-only attribute, shaped
 *   exactly like `SportAttributeDefinition`, whose `definitionRef` resolves
 *   against the session-local `SessionAttributeSchema.definitions`.
 *
 * The client only reads this raw shape through the admin JSON textarea
 * (ADMIN-5) — it is not narrowed into a discriminated union (CLIENT-SESSION-17
 * SC-3); the member-facing resolved read is `ResolvedRefAttribute` & co. */
export interface SessionAttributeNode {
  '#ref'?: string | null;
  /** `#ref` node: optional locale→text override (`null` keeps the inherited
   * label). Own node: the required label map, carrying the schema's
   * `defaultLocale`. */
  label?: Record<string, string> | null;
  /** `#ref` node (A23): its own sibling-unique key. Own node: sibling-unique. */
  key?: string | null;
  /** `#ref` node only (A23): `SINGLE` → one value, `LIST` → many. */
  cardinality?: Cardinality | null;
  /** Own node only. */
  type?: SportAttributeType | null;
  /** Own node only. Required and non-empty for `ENUM`/`LIST`. */
  options?: SportAttributeOption[] | null;
  /** Own node only. Soft delete. */
  isAvailable?: boolean | null;
  /** Own node only. Must be valid for `type`; forbidden for
   * `DEFINITION`/`DEFINITION_LIST`. */
  defaultValue?: unknown;
  /** Own node only. Inclusive bounds, legal only when `type` is `NUMBER`. */
  min?: number | null;
  max?: number | null;
  /** Own node only. Names a `SessionAttributeSchema.definitions` entry;
   * required when `type` is `DEFINITION`/`DEFINITION_LIST`. */
  definitionRef?: string | null;
  /** SPORT-13: optional presentation hint — see {@link AttributeLayout}. Legal on both a `#ref`
   * node and an own node. */
  layout?: AttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag — see {@link SportAttributeField.hidden}. */
  hidden?: boolean | null;
}

export interface SessionAttributeGroup {
  /** Sibling-unique (among the parent's sub-groups and own-node keys). */
  key: string;
  label: Record<string, string>;
  /** Soft delete that hides the whole subtree; parent state wins. */
  isAvailable?: boolean | null;
  /** Nested sub-groups, arbitrary depth. Absent/`null`/`[]` on a leaf group. */
  groups?: SessionAttributeGroup[] | null;
  attributes: SessionAttributeNode[];
  /** SPORT-13: optional presentation hint (group layout rendered by SPORT-14). */
  layout?: AttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag — a `hidden` group renders no section (whole subtree). */
  hidden?: boolean | null;
}

export interface SessionAttributeSchema {
  /** Session-local registry of record shapes an *own* node may reference by
   * name via `definitionRef`. A name here must not collide with a
   * profile-schema definition pulled in by a `#ref`. Absent/empty when unused. */
  definitions?: SportAttributeDefinitionType[] | null;
  groups: SessionAttributeGroup[];
  /** BCP 47 (e.g. `"en"`) — every labeled node's `label` map must carry an
   * entry for this locale. Same contract as `SportAttributeSchema.defaultLocale`. */
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

/** How many values a `#ref` node holds (A23/`common.attributes` extraction plan D9) — mirrors the
 * backend `Cardinality` enum. `SINGLE` → the client renders a single-select control; `LIST` → a
 * multi-select. Independent of the referenced base attribute's own `type`. */
export type Cardinality = 'SINGLE' | 'LIST';

/* ── Discriminated union: one arm per `SportAttributeType` (CLIENT-SESSION-17 Part A) ───────────
 * The backend serves these flattened (`common.attributes.ResolvedAttributeNode` is one flat DTO —
 * `type` plus whichever per-kind fields apply, the rest `null`); the client narrows that wire into
 * the union below so every attribute surface switches exhaustively (`assertNever`) instead of
 * reading optional fields off a god-type. A schema-declared `type` this client build doesn't know
 * is still possible (older client than backend) — the render dispatchers guard for that at runtime
 * *before* trusting the union, and degrade rather than crash. */

interface ResolvedAttributeCommon {
  key: string;
  label: string;
  /** Soft delete — `false` hides the node (and, for a group, its subtree). */
  isAvailable?: boolean | null;
  /** Seeds a field with no stored value, once. Never set on `DEFINITION`/`DEFINITION_LIST`. */
  defaultValue?: unknown;
  /** SPORT-13: optional presentation hint — {@link ResolvedAttributeLayout}. The scalar arms
   * (`StringField`/`NumberField`/`BooleanField`/`EnumField`) read `layout.id` + `layout.format`;
   * container/`#ref`/read-only handling is SPORT-14/15. */
  layout?: ResolvedAttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag. `true` ⇒ no editor input (`SportAttributesFields`) and
   * no read-only row (`SessionAttributesSummary`), but the stored value round-trips untouched.
   * Mutually exclusive with a required field (C11 rejects both; client-side `hidden` wins). Not a
   * soft delete — that is `isAvailable`. */
  hidden?: boolean | null;
}

export interface ResolvedStringAttribute extends ResolvedAttributeCommon {
  type: 'STRING';
}

export interface ResolvedNumberAttribute extends ResolvedAttributeCommon {
  type: 'NUMBER';
  /** SPORT-9/A16: inclusive bounds, mirrored as `<input>` `min`/`max`. Independent and optional. */
  min?: number | null;
  max?: number | null;
}

export interface ResolvedBooleanAttribute extends ResolvedAttributeCommon {
  type: 'BOOLEAN';
}

export interface ResolvedEnumAttribute extends ResolvedAttributeCommon {
  type: 'ENUM';
  options: ResolvedSportAttributeOption[];
}

export interface ResolvedListAttribute extends ResolvedAttributeCommon {
  type: 'LIST';
  options: ResolvedSportAttributeOption[];
}

export interface ResolvedDefinitionAttribute extends ResolvedAttributeCommon {
  type: 'DEFINITION' | 'DEFINITION_LIST';
  /** Names the `ResolvedSportAttributeDefinitionType` this value is shaped by. */
  definitionRef: string;
  /** Entity-linking typeahead pool (v2 design §8.3); absent means plain free text. */
  searchScope?: string | null;
}

/**
 * A `#ref`-derived resolved node — A23/C9, session attribute schema only
 * (`GET /api/sports/{sportId}/session-attribute-schema`). On the wire it is **not** a distinct
 * `type`: it carries the *inherited* base `type` plus `cardinality`/`prefillable`/`prefillKey`.
 * The client keeps it a separate union arm, discriminated by `prefillable === true` (see
 * {@link isRefAttribute}), and renders it (CLIENT-SESSION-17 Part B) as a single-/multi-select
 * whose choices are the creator's own profile value(s) at `prefillKey` — never by switching on
 * `type`. Absent from every profile-schema (`/attribute-schema`) resolution and from "own"
 * (event-only) session nodes.
 */
export interface ResolvedRefAttribute extends ResolvedAttributeCommon {
  /** Inherited from the referenced base attribute. */
  type: SportAttributeType;
  cardinality: Cardinality;
  prefillable: true;
  /** Full `/`-separated path of the referenced profile attribute — the key to read the choice
   * list from `profile.attributes[prefillKey]`. */
  prefillKey: string;
  /** Inherited — present when the base attribute is `ENUM`/`LIST`. */
  options?: ResolvedSportAttributeOption[] | null;
  /** Inherited — present when the base attribute is `DEFINITION`/`DEFINITION_LIST`. */
  definitionRef?: string | null;
}

export type ResolvedSportAttributeDefinition =
  | ResolvedRefAttribute
  | ResolvedStringAttribute
  | ResolvedNumberAttribute
  | ResolvedBooleanAttribute
  | ResolvedEnumAttribute
  | ResolvedListAttribute
  | ResolvedDefinitionAttribute;

/** Narrows a resolved node to its `#ref`-derived arm. `prefillable` is the only wire signal that
 * distinguishes it — its `type` is the inherited base type, so a `switch (node.type)` cannot. */
export function isRefAttribute(
  attribute: ResolvedSportAttributeDefinition,
): attribute is ResolvedRefAttribute {
  return (attribute as { prefillable?: unknown }).prefillable === true;
}

/* One field within a `DEFINITION`/`DEFINITION_LIST` record — same per-type union, minus the `#ref`
 * arm (a record field is never a `#ref`) and `DEFINITION_LIST` (depth-2 rule, v2 design §5.3). */

interface ResolvedFieldCommon {
  key: string;
  label: string;
  /** Missing/invalid ⇒ the whole enclosing record is dropped (v2 design §6). Absent reads `false`. */
  isRequired?: boolean | null;
  /** SPORT-13: optional presentation hint — {@link ResolvedAttributeLayout}. A record-context
   * scalar field honours `layout` the same way a top-level one does. */
  layout?: ResolvedAttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag — see {@link ResolvedAttributeCommon.hidden}. A `hidden`
   * record field is skipped by `DefinitionFields` (edit) and `renderRecord` (read); its value in
   * the record round-trips untouched. */
  hidden?: boolean | null;
}

export interface ResolvedStringField extends ResolvedFieldCommon {
  type: 'STRING';
}

export interface ResolvedNumberField extends ResolvedFieldCommon {
  type: 'NUMBER';
  min?: number | null;
  max?: number | null;
}

export interface ResolvedBooleanField extends ResolvedFieldCommon {
  type: 'BOOLEAN';
}

export interface ResolvedEnumField extends ResolvedFieldCommon {
  type: 'ENUM';
  options: ResolvedSportAttributeOption[];
}

export interface ResolvedListField extends ResolvedFieldCommon {
  type: 'LIST';
  options: ResolvedSportAttributeOption[];
}

export interface ResolvedDefinitionField extends ResolvedFieldCommon {
  type: 'DEFINITION';
  definitionRef: string;
}

export type ResolvedSportAttributeField =
  | ResolvedStringField
  | ResolvedNumberField
  | ResolvedBooleanField
  | ResolvedEnumField
  | ResolvedListField
  | ResolvedDefinitionField;

export interface ResolvedSportAttributeDefinitionType {
  name: string;
  fields: ResolvedSportAttributeField[];
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
  /** SPORT-13: optional presentation hint (group layout + heading `icon` rendered by SPORT-14). */
  layout?: ResolvedAttributeLayout | null;
  /** SPORT-15/C11: render-suppression flag — a `hidden` group renders no editor section and no
   * read-only section (its whole subtree). Values under it still round-trip. */
  hidden?: boolean | null;
}

/** The whole document `GET /api/sports/{sportId}/attribute-schema` returns —
 * `SportAttributesFields`' `schema` prop. `data: null` for a sport with no
 * attributes (valid state, not an error) — callers check for `null` before
 * rendering. */
export interface ResolvedSportAttributeSchema {
  definitions?: ResolvedSportAttributeDefinitionType[] | null;
  groups: ResolvedSportAttributeGroup[];
}
