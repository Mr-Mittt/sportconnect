# A17 · Session attribute schema

**Status:** `TODO`
**Type:** New Feature
**Depends on:** nothing hard (builds on the A9/A12/A13 profile-schema machinery, all `DONE`)
**Filed:** 2026-09-02, from a design session on letting sessions carry sport-specific structured
attributes and pre-filling them from the creator's sport profile.

## Phase 0 (before code)

Write `documentation/md/SESSION_ATTRIBUTE_SCHEMA_DESIGN.md` + a `PROGRESS.md` summary. The candidate
notification trigger this surfaced ("notify users whose sport profile attributes match a newly
created session") is logged in `documentation/md/NOTIFICATION_USE_CASES.md` as NOTIF-6 at filing
time — the design doc should reference it, not re-litigate it.

## What ships

A second admin-managed schema per sport, stored in a new nullable `sports.session_attributes_schema
JSONB` column (mirrors `attributes_schema`, V059) — NULL means "this sport's sessions offer no
attributes". Two node kinds per group:

- **`#ref`** — `{ "#ref": "<profileAttributeKey>", "label"?: {locale->str}, "order"? }`. Type,
  options, `definitionRef` resolve from the referenced profile attribute; only `label`/`order` may
  be overridden. Pre-fillable client-side from the user's profile.
- **own** — a full self-contained `SportAttributeDefinition` (key/label/type/options/definitionRef/
  defaultValue/isAvailable/order), for event-only attributes ("Balls provided?", "Competitive /
  casual") with no profile counterpart. Not pre-fillable (`defaultValue` only).

**`SessionAttributeSchemaValidator`** (strict, all-or-nothing — mirrors
`SportAttributeSchemaValidator`): sport-wide key uniqueness across the session schema, where a
`#ref`'s effective key is the referenced profile key; every `#ref` resolves to a live, available,
renderable profile attribute; an own node's `key` must not collide with **any** profile attribute
key (referenced or not); own-node rules identical to the profile validator; 16KB cap; dangling
`#ref` -> 400.

**`SessionAttributeSchemaResolver`**: `(session schema + profile schema + Accept-Language) ->
ResolvedSportAttributeSchema` — the exact shape the client renderer already consumes. Adds a
`prefillable`/`prefillKey` marker on `#ref`-derived nodes so the client knows which to seed. Own
`DEFINITION`/`DEFINITION_LIST` `definitions` are carried through.

**Endpoints:**
- `GET /api/sports/all/{sportId}/session-attribute-schema` — ROLE_ADMIN, raw
- `PUT /api/sports/all/{sportId}/session-attribute-schema` — ROLE_ADMIN, replace-wholesale, validated
- `GET /api/sports/{sportId}/session-attribute-schema` — member, resolved, active-only (404 for a
  deactivated sport, `data: null` when unset)

**`SportService` (`sport-api`):** `getSessionAttributeSchemaRaw(sportId)` returning a **ref-expanded**
raw doc (each `#ref` inlined to a full definition, labels still locale maps) so SESSION-23's filter
stays a near-clone of `ProfileAttributeFilter`; plus a resolved variant for the member controller.

Reuse `SportAttributeValues` unchanged.

## Open question (resolve at pickup)

Do own `DEFINITION`/`DEFINITION_LIST` nodes carry their **own** `definitions` registry in the
session schema (self-contained, v2 §5.4), or reuse the sport's profile-schema `definitions`?

## Cross-domain

`session-impl` already depends on `sport-api` (`requireActiveSportById` in the create path) — the two
new `SportService` methods add no new module edge.

## Account lifecycle

Admin-only writes; the member GET is a plain read. A deactivated caller reaching the member GET is
the same accepted access-token-window risk every other authenticated GET carries (CLAUDE.md / U12) —
no new surface.

## Client-visible

`GET /api/sports/{sportId}/session-attribute-schema` returns the same `ResolvedSportAttributeSchema`
DTO tree the client already mirrors for SPORT-2, plus the additive `prefillable`/`prefillKey`
marker. Client consumers filed alongside: CLIENT-SESSION-14 (hook), ADMIN-5 (editor).

## Tests

Spock: `SessionAttributeSchemaValidatorSpec` (ref resolution, dangling ref -> 400, own/ref key
collision, own-node rules), `SessionAttributeSchemaResolverSpec` (label override precedence,
prefill marker, ref type inheritance). IT in `server/src/test/java/.../integration/` for admin-role
gating on both admin endpoints and the active-only 404 on the member GET.

## Out of scope

Session-side storage and write validation (SESSION-23). Any client rendering (CLIENT-SESSION-*).
Discovery/ranking on session attributes (SESSION-8 territory).
