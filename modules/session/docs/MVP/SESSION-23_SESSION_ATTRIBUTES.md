# SESSION-23 · Session attributes

**Status:** `TODO`
**Type:** New Feature
**Depends on:** **A17** (`modules/sport/sport-impl`) — needs
`SportService.getSessionAttributeSchemaRaw`.
**Filed:** 2026-09-02, same design session as A17 — the session-domain half.

## What ships

- Liquibase migration: `sessions.attributes JSONB` (nullable).
- `SessionAttributeFilter` — a near-clone of `sport-impl`'s `ProfileAttributeFilter` but with
  **replace semantics** (the submitted map is the whole truth — no merge, so no A10-style
  "can't delete a key" gap). Lenient: unknown keys, wrong-shaped values, and writes to an
  `isAvailable: false` node are dropped silently. 4KB serialized cap fails loudly (same rule as
  profile attributes).
- Resolve each submitted key's type/options via `SportService.getSessionAttributeSchemaRaw(sportId)`
  (ref-expanded by A17). Reuse `SportAttributeValues`.
- Wire into `createSession` and `updateSession` (attributes editable post-creation, replace
  semantics).
- `attributes` on `CreateSessionRequest` / the update request; `attributes` on `SessionResponse`
  + mapper.

## Edge cases

- Sport has no session schema (`null`) -> every submitted attribute dropped, session still created.
- Deactivated sport -> session create/update already gated upstream; no new path.
- Deactivated caller — session create/update are existing authenticated write paths; this ticket
  adds a field, not a new endpoint, so it inherits the same accepted access-token-window risk
  (CLAUDE.md / U12), no new surface.

## Cross-domain

Uses the existing `session-impl -> sport-api` dependency; A17 adds the method, no new module edge.

## Client-visible

`SessionResponse` gains `attributes`. Client consumers: CLIENT-SESSION-14/15/16.

## Tests

Spock `SessionAttributeFilterSpec` (replace vs merge, drop invalid, drop `isAvailable:false`,
oversize -> 400). IT: create a session with attributes end-to-end, and a write to a switched-off
node is dropped through the real pipeline.

## Out of scope

The session attribute *schema* itself (A17). Rendering (CLIENT-SESSION-*). Discovery filtering on
attributes (SESSION-8).
