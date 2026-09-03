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
| 1 | [A10](MVP/A10_NO_DELETE_PATH_FOR_A_STORED_PROFILE_ATTRIBUTE.md) | No delete path for a stored profile attribute — merge-only semantics retained by A9, so a stored key can never be removed; stale keys also consume the 4KB cap. **Sharpened by v2:** `DEFINITION_LIST` gets a working clear path for free (an empty list), which makes its absence for `STRING`/`ENUM` user-visible | `TODO` |
| 2 | [A14](MVP/A14_ATTRIBUTE_VALUE_SUGGESTIONS_AND_SEARCH_SCOPE.md) | Attribute-value suggestions + `searchScope` — typeahead pooled from what users already typed, so free text converges *before* an Equipment catalogue exists; results carry an optional `id` from day one so the client never changes when it does. **Postponed at 2026-08-25 pickup** — the aggregation strategy needs more design investigation before implementation (see the ticket's own Investigation notes) | `TODO` |
| 3 | [A19](MVP/A19_NESTED_ATTRIBUTE_GROUPS.md) | Nested attribute groups + sibling-scoped keys (schema v3) — `group` gains a self-referential `groups[]` (arbitrary depth, sub-groups + attributes together), node keys become sibling-unique, references become paths (`#gear/rackets/tension`); reworks the flat stored map + `ProfileAttributeFilter` + immutable-key policy; Phase 0 design doc first. **Sequence before A17** | `TODO` |
| 4 | [A17](MVP/A17_SESSION_ATTRIBUTE_SCHEMA.md) | Session attribute schema — per-sport `session_attributes_schema`, `#ref`/own node kinds, validator + resolver + admin/member endpoints; user-facing session-attributes feature (SESSION-23 is the session-domain half) | `TODO` |
| 5 | [A18](MVP/A18_REMOVE_PREFERRED_POSITION_COLUMN.md) | Remove `user_sport_profiles.preferred_position` — a mistake; sport-specific data belongs in the A9 attribute schema. Pairs with client SPORT-8 | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A16](MVP/A16_NUMBER_AND_BOOLEAN_ATTRIBUTE_TYPES.md) | `NUMBER` and `BOOLEAN` attribute types (2026-09-02) — `instanceof Number` (any int/decimal), `instanceof Boolean`; optional inclusive `min`/`max` on `NUMBER` (scope addition at pickup); legal as definition fields incl. inner-position; strict on admin `PUT`, lenient-drop on profile write. Client half filed as `SPORT-9` | `DONE` |
| 2 | [A15](MVP/A15_SEED_BADMINTON_AND_PICKLEBALL_SCHEMAS.md) | Seed the Badminton attribute schema (v2, real content) — no code change, seeded live via the admin `PUT`; verified structural match, locale resolution (en + vi), and a real profile round trip; Pickleball stays unseeded (no real content exists for it) | `DONE` |
| 3 | [A13](MVP/A13_LOCALIZED_ATTRIBUTE_SCHEMA_LABELS.md) | Localized attribute-schema labels — `label` becomes a locale map + `defaultLocale`, resolved from `Accept-Language` for users (new `ResolvedSportAttributeSchema` DTO tree) and served raw to the admin editor; validator now enforces every label covers `defaultLocale`; unblocks A15 and client SPORT-2 | `DONE` |
| 4 | [A12](MVP/A12_SCHEMA_V2_DEFINITION_TYPES.md) | Schema **v2** core — a sport-local `definitions` registry plus `DEFINITION`/`DEFINITION_LIST` type kinds and the required-field cascade, so an attribute value can be a record (a shoe with a name and a size) instead of only a string; fixed a nested-record filtering bug before it shipped; **removed `SportAttributeSchema.version` entirely** (added mid-ticket, then dropped on review — no plan to version the schema syntax); added a default **10-item cap** on `LIST`/`DEFINITION_LIST` values, client-mirrored in SPORT-2/SPORT-6 | `DONE` |
| 5 | [A11](MVP/A11_ADMIN_SCHEMA_READ_AND_RENAME_COLLISION_GUARD.md) | Admin attribute-schema read + rename collision guard — closes two gaps found while building client ADMIN-2: A9's schema `GET`/`PUT` disagreed about inactive sports (admin could write a schema it could never read back), and `updateSport` had no `existsByName` guard so a duplicate rename returned **500 instead of 400** | `DONE` |
| 6 | [A9](MVP/A9_PER_SPORT_ATTRIBUTE_SCHEMA.md) | Per-sport attribute schema (admin-managed, server-side) — V059 + typed DTOs + two endpoints; profile writes validated leniently (invalid attributes dropped, not rejected); **also fixed app-wide `@PreAuthorize` denials returning 500 instead of 403** | `DONE` |
| 7 | [A8](MVP/A8_DROP_DB_LEVEL_FK_ON_USER_SPORT_PROFILES.md) | Drop DB-level FK on `user_sport_profiles.user_id` — V058; cross-domain coupling into `user-impl`, schema-only, no code change | `DONE` |
| 8 | [A7](MVP/A7_ENFORCE_ISACTIVE_ON_SPORT_TAGGED_CREATE_PATHS_IN.md) | Enforce `isActive` on sport-tagged create paths — **grew well past its filing**: also fixed `hasProfileForSport` (renamed `hasActiveProfileForActiveSport`) silently granting access from soft-deleted profiles, made the sport cache active-only, removed the max-3-profiles cap, and made re-adding a deleted profile reactivate its row | `DONE` |
| 9 | [A5](MVP/A5_CACHE_SPORT_LOOKUPS.md) | Cache sport lookups — sport data is effectively static at runtime | `DONE` |
| 10 | [A6](MVP/A6_MVP_SPORT_RESTRICTION.md) | MVP sport restriction — deactivate all sports except Badminton & Pickleball; enforce `isActive` on every read/write path | `DONE` |
| 11 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 12 | [A2](MVP/A2_SPORT_PROFILE_OWNERSHIP_CHECK.md) | Sport profile ownership check (update + delete) | `DONE` |
| 13 | [A3](MVP/A3_FLEXIBLE_PER_SPORT_ATTRIBUTES.md) | Flexible per-sport attributes (JSONB) | `DONE` |
| 14 | [A4](MVP/A4_BATCH_SPORT_LOOKUP.md) | Batch sport lookup in getUserProfiles (cleanliness, not a scaling fix) | `DONE` |

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
```
