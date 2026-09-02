# CLIENT-SESSION-14 · Session attribute schema hook + types

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** SESSION-23 (for the `SessionResponse`
shape) and A17 (for `GET /api/sports/{sportId}/session-attribute-schema`)
**Filed:** 2026-09-02, scaffolding for the session-attribute client work.

## What ships

- `useSessionAttributeSchema(sportId)` — a 1:1 clone of `useSportAttributeSchema`
  (`shared/hooks/`): query key `['sessionAttributeSchema', sportId]`, `enabled: sportId !== undefined`,
  hits `GET /api/sports/{sportId}/session-attribute-schema`, returns
  `ResolvedSportAttributeSchema | null` (the existing type — A17 keeps the resolved shape identical,
  adding only the optional `prefillable`/`prefillKey` marker, which goes on
  `ResolvedSportAttributeDefinition` as optional fields).
- Add `attributes?: Record<string, unknown>` to the session response type.

## Out of scope

Any rendering or pre-fill (CLIENT-SESSION-15/16).

## Tests

Vitest: hook returns `null` for a sport with no session schema, data on success, doesn't fire when
`sportId` is undefined — mirrors `useSportAttributeSchema.test`.
