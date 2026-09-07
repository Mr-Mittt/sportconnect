# CLIENT-SESSION-14 · Session attribute schema hook + types

**Status:** `DONE` (2026-09-07) · **Type:** Enhancement · **Depends on:** SESSION-23
(`modules/session`, for the `SessionResponse` shape — merged 2026-09-07) and A17
(`modules/sport/sport-impl`, for `GET /api/sports/{sportId}/session-attribute-schema` — merged
PR #228)
**Filed:** 2026-09-02, scaffolding for the session-attribute client work.

## What ships

- `useSessionAttributeSchema(sportId)` — a 1:1 clone of `useSportAttributeSchema`
  (`shared/hooks/`): query key `['sessionAttributeSchema', sportId]`, `enabled: sportId !== undefined`,
  hits `GET /api/sports/{sportId}/session-attribute-schema`, returns
  `ResolvedSportAttributeSchema | null` (the existing type — A17 keeps the resolved shape identical,
  adding only the optional `prefillable`/`prefillKey` marker, which goes on
  `ResolvedSportAttributeDefinition` as optional fields).
- Add `attributes?: Record<string, unknown>` to the session response type.
- **Scope change 2026-09-07 (pickup):** also add `prefillable?: boolean | null` and
  `prefillKey?: string | null` to `ResolvedSportAttributeDefinition` in `shared/types/sport.ts`,
  mirroring the two fields A17 (`modules/sport/sport-impl`) added to the backend
  `ResolvedSportAttributeDefinition` DTO (session-schema resolution only — always `null` for the
  profile-schema resolution and for session "own" nodes). Type scaffolding only, no behaviour; the
  sole consumer is CLIENT-SESSION-15 (`client`). Done here rather than in CLIENT-SESSION-15 so that
  feature ticket touches no shared type. (User decision at pickup.)

## Out of scope

Any rendering or pre-fill (CLIENT-SESSION-15/16). Reading/acting on `prefillable`/`prefillKey` —
this ticket only adds the fields to the type.

## Tests

Vitest: hook returns `null` for a sport with no session schema, data on success, doesn't fire when
`sportId` is undefined — mirrors `useSportAttributeSchema.test`.

---

## Implementation (2026-09-07)

### Approved design

Pure scaffolding, no UI. `useSportAttributeSchema.test` turned out not to exist — the new test was
modelled on `client/src/shared/hooks/useSportProfiles.test.tsx` instead (`renderHook` +
`QueryClientProvider` wrapper, `vi.spyOn(apiClient, 'get')`).

1. **Types**
   - `client/src/shared/types/sport.ts` — `ResolvedSportAttributeDefinition` gains
     `prefillable?: boolean | null` and `prefillKey?: string | null` (the scope change above),
     mirroring the backend DTO A17 added. Optional, so every existing reader of the type
     (`SportAttributesFields` is the only one) is untouched.
   - `client/src/shared/types/session.ts` — `Session` gains
     `attributes?: Record<string, unknown> | null`, mirroring `SessionResponse.attributes`
     (SESSION-23, `modules/session` — `Map<String,Object>`, nullable).
2. **Data layer** — new `client/src/shared/hooks/useSessionAttributeSchema.ts`: a 1:1 sibling of
   `useSportAttributeSchema` — same `{ data, isLoading, isError }` shape and the same
   disabled-query `isLoading` guard — differing only in the URL
   (`/sports/{sportId}/session-attribute-schema`) and the query key
   (`['sessionAttributeSchema', sportId]`, exported as `sessionAttributeSchemaQueryKey`).
3. **No components, no page wiring, no MSW handler** — nothing renders the hook yet
   (CLIENT-SESSION-15/16), and no E2E/visual flow touches the endpoint.
4. **Tests** — `client/src/shared/hooks/useSessionAttributeSchema.test.tsx` (5):
   disabled when `sportId` undefined (no fetch, `isLoading` false); resolves the schema from the
   right URL with `prefillable`/`prefillKey` markers intact; `data: null` (not an error) when the
   sport offers no session schema; a rejected request surfaces as `isError` with `data` null; the
   query key shape.

### Consumer census (`client`)

- `useSessionAttributeSchema` — new, no consumers.
- `Session.attributes` — optional add; all session hooks/components/mocks **compatible as-is**.
- `ResolvedSportAttributeDefinition.prefillable?/prefillKey?` — optional add; sole consumer
  `client/src/shared/components/SportAttributesFields.tsx` reads named fields only, **compatible
  as-is**. CLIENT-SESSION-15 (`client`) will read the markers — the next `client` queue ticket,
  already depends on this one (not deferred).

### Divergence from the plan

None. (The plan already anticipated `useSportAttributeSchema.test` not existing.)

### Verification

- `pnpm exec tsc -b` — clean.
- `pnpm test` — **1110 passed / 162 files**, incl. the 5 new cases.
- `pnpm lint` — 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`, untouched).
- No dev-server / browser walk and no real-backend round trip — nothing consumes the hook yet;
  the real contract is exercised when CLIENT-SESSION-15 lands.

### Visual-regression expectation

No baselined surface touched — no baseline change expected; a failing `visual-regression` run would
be the documented Windows noise floor, not a regression. Not run.

### Delta for CLIENT-SESSION-15 / CLIENT-SESSION-16 (`client`)

`ResolvedSportAttributeDefinition.prefillable?` / `prefillKey?` and `Session.attributes?` already
exist in `shared/types/` — neither follow-up ticket needs to add them.
