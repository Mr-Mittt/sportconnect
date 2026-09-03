# Sport Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/sport/sport-impl`  
**Last updated:** 2026-09-03  

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon sport mvp` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A14](MVP/A14_ATTRIBUTE_VALUE_SUGGESTIONS_AND_SEARCH_SCOPE.md) | Attribute-value suggestions + `searchScope` — typeahead pooled from what users already typed, so free text converges *before* an Equipment catalogue exists; results carry an optional `id` from day one so the client never changes when it does. **Postponed at 2026-08-25 pickup** — the aggregation strategy needs more design investigation before implementation (see the ticket's own Investigation notes) | `TODO` |
| 2 | [A19](MVP/A19_NESTED_ATTRIBUTE_GROUPS.md) | Nested attribute groups + sibling-scoped keys (schema v3) — `group` gains a self-referential `groups[]` (arbitrary depth, sub-groups + attributes together), node keys become sibling-unique, references become paths (`#gear/rackets/tension`); reworks the flat stored map + `ProfileAttributeFilter` + immutable-key policy; Phase 0 design doc first. **Sequence before A17** | `TODO` |
| 3 | [A17](MVP/A17_SESSION_ATTRIBUTE_SCHEMA.md) | Session attribute schema — per-sport `session_attributes_schema`, `#ref`/own node kinds, validator + resolver + admin/member endpoints; user-facing session-attributes feature (SESSION-23 is the session-domain half) | `TODO` |
| 4 | [A18](MVP/A18_REMOVE_PREFERRED_POSITION_COLUMN.md) | Remove `user_sport_profiles.preferred_position` — a mistake; sport-specific data belongs in the A9 attribute schema. Pairs with client SPORT-8 | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A21](MVP/A21_OWNER_ONLY_GET_PROFILE_BY_ID.md) | Owner-only gate on `GET /api/sports/profiles/{profileId}` (2026-09-03) — the follow-up A20 deferred. `SportController.getProfileById` gains `@PreAuthorize("hasRole('USER')")` + a fetch-then-authorize `principal == response.getUserId()` check → `403` non-owner (`404` still wins for missing/soft-deleted, resolved first). `SecurityConfig` GET matcher widened from `/api/sports/profiles/user/*` to also cover `/api/sports/profiles/*` → `401` anonymous. **Consumer census:** no client code and no cross-module backend code reads this GET; only two ITs, both already owner-authenticated — both green. `getUserProfileForSport` is the identical remaining gap, left as a follow-up. Green: sport-impl + auth-impl + `:server:test` | `DONE` |
| 2 | [A20](MVP/A20_ISRESUME_REACTIVATION_MODE.md) | `isResume` mode on sport-profile reactivation (2026-09-03) — `Boolean isResume` on `CreateUserSportProfileRequest`; when `true`, `createProfile` **purely reactivates** the caller's soft-deleted profile (old scalars kept verbatim, `attributes` = A10 `retainDefined` prune only, request body ignored; `400` if nothing to resume). Revises A7. **Scope grew at pickup:** `GET /profiles/user/{userId}` gained `?includeInactive=true` (new active-only-preserving `getUserProfiles(UUID, boolean)` overload) and became **owner-only** — `SecurityConfig` matcher → `401` anonymous, controller `principal==userId` check → `403` non-owner; breaks other-user sport display, 2 client tickets filed alongside. `skillLevel` `@NotNull` → `@AssertTrue` cross-field (not required on resume). Green: sport-impl + auth-impl + `:server:test` + `build` | `DONE` |
| 3 | [A10](MVP/A10_NO_DELETE_PATH_FOR_A_STORED_PROFILE_ATTRIBUTE.md) | Delete + prune stored profile attributes (2026-09-03) — Part 1: an explicit `null` in an `updateProfile` `attributes` map removes that key (`""` still stores an empty string). Part 2 / "2b": every `updateProfile` re-filters the whole stored map — keys with no physical definition pruned, `isAvailable:false` values kept verbatim, live values re-validated (undeclared nested fields stripped, a record failing its current definition dropped whole — gap closed by client SPORT-6). `updateProfile` only; reactivation is A20. Client "remove field" UI filed alongside | `DONE` |
| 4 | [A16](MVP/A16_NUMBER_AND_BOOLEAN_ATTRIBUTE_TYPES.md) | `NUMBER` and `BOOLEAN` attribute types (2026-09-02) — `instanceof Number` (any int/decimal), `instanceof Boolean`; optional inclusive `min`/`max` on `NUMBER` (scope addition at pickup); legal as definition fields incl. inner-position; strict on admin `PUT`, lenient-drop on profile write. Client half filed as `SPORT-9` | `DONE` |
| 5 | [A15](MVP/A15_SEED_BADMINTON_AND_PICKLEBALL_SCHEMAS.md) | Seed the Badminton attribute schema (v2, real content) — no code change, seeded live via the admin `PUT`; verified structural match, locale resolution (en + vi), and a real profile round trip; Pickleball stays unseeded (no real content exists for it) | `DONE` |
| 6 | [A13](MVP/A13_LOCALIZED_ATTRIBUTE_SCHEMA_LABELS.md) | Localized attribute-schema labels — `label` becomes a locale map + `defaultLocale`, resolved from `Accept-Language` for users (new `ResolvedSportAttributeSchema` DTO tree) and served raw to the admin editor; validator now enforces every label covers `defaultLocale`; unblocks A15 and client SPORT-2 | `DONE` |
| 7 | [A12](MVP/A12_SCHEMA_V2_DEFINITION_TYPES.md) | Schema **v2** core — a sport-local `definitions` registry plus `DEFINITION`/`DEFINITION_LIST` type kinds and the required-field cascade, so an attribute value can be a record (a shoe with a name and a size) instead of only a string; fixed a nested-record filtering bug before it shipped; **removed `SportAttributeSchema.version` entirely** (added mid-ticket, then dropped on review — no plan to version the schema syntax); added a default **10-item cap** on `LIST`/`DEFINITION_LIST` values, client-mirrored in SPORT-2/SPORT-6 | `DONE` |
| 8 | [A11](MVP/A11_ADMIN_SCHEMA_READ_AND_RENAME_COLLISION_GUARD.md) | Admin attribute-schema read + rename collision guard — closes two gaps found while building client ADMIN-2: A9's schema `GET`/`PUT` disagreed about inactive sports (admin could write a schema it could never read back), and `updateSport` had no `existsByName` guard so a duplicate rename returned **500 instead of 400** | `DONE` |
| 9 | [A9](MVP/A9_PER_SPORT_ATTRIBUTE_SCHEMA.md) | Per-sport attribute schema (admin-managed, server-side) — V059 + typed DTOs + two endpoints; profile writes validated leniently (invalid attributes dropped, not rejected); **also fixed app-wide `@PreAuthorize` denials returning 500 instead of 403** | `DONE` |
| 10 | [A8](MVP/A8_DROP_DB_LEVEL_FK_ON_USER_SPORT_PROFILES.md) | Drop DB-level FK on `user_sport_profiles.user_id` — V058; cross-domain coupling into `user-impl`, schema-only, no code change | `DONE` |
| 11 | [A7](MVP/A7_ENFORCE_ISACTIVE_ON_SPORT_TAGGED_CREATE_PATHS_IN.md) | Enforce `isActive` on sport-tagged create paths — **grew well past its filing**: also fixed `hasProfileForSport` (renamed `hasActiveProfileForActiveSport`) silently granting access from soft-deleted profiles, made the sport cache active-only, removed the max-3-profiles cap, and made re-adding a deleted profile reactivate its row | `DONE` |
| 12 | [A5](MVP/A5_CACHE_SPORT_LOOKUPS.md) | Cache sport lookups — sport data is effectively static at runtime | `DONE` |
| 13 | [A6](MVP/A6_MVP_SPORT_RESTRICTION.md) | MVP sport restriction — deactivate all sports except Badminton & Pickleball; enforce `isActive` on every read/write path | `DONE` |
| 14 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 15 | [A2](MVP/A2_SPORT_PROFILE_OWNERSHIP_CHECK.md) | Sport profile ownership check (update + delete) | `DONE` |
| 16 | [A3](MVP/A3_FLEXIBLE_PER_SPORT_ATTRIBUTES.md) | Flexible per-sport attributes (JSONB) | `DONE` |
| 17 | [A4](MVP/A4_BATCH_SPORT_LOOKUP.md) | Batch sport lookup in getUserProfiles (cleanliness, not a scaling fix) | `DONE` |

---

**Dependencies:**
```
No hard dependency between A1 and A2, but both touch SportController.java —
consider doing them in the same session to avoid re-reading the same file twice.
A3: no hard dependency, can run independently.

Schema v2 (design: documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md):

  A12, A13, A15 all DONE — Badminton now has a real, live v2 schema.
  A14 ──> client SPORT-6 (A14 postponed pending an aggregation-strategy
          redesign — see its own Investigation notes; unrelated to A15)
  client SPORT-2 (rescoped onto v2) now has real content to build against.
  A16 DONE 2026-09-02 (NUMBER/BOOLEAN + optional min/max) ──> client SPORT-9
          (the two form controls). Pickleball: still unseeded, no real
          content exists for it — pick up whenever product content is ready.
  A19 (nested groups, schema v3) ──> must land before A17 — it removes the
          sport-wide key uniqueness A17's #ref grammar assumes.
  A10 ──> A20 (hard): A20 reuses A10's ProfileAttributeFilter.retainDefined +
          attribute-merge helper for the isResume reactivation path. A20 also
          revises A7's "reactivation = fresh create" decision.
```
