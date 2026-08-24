# Sport Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/sport/sport-impl`  
**Last updated:** 2026-08-21  

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
| 1 | [A12](MVP/A12_SCHEMA_V2_DEFINITION_TYPES.md) | Schema **v2** core — a sport-local `definitions` registry plus `DEFINITION`/`DEFINITION_LIST` type kinds and the required-field cascade, so an attribute value can be a record (a shoe with a name and a size) instead of only a string | `TODO` |
| 2 | [A13](MVP/A13_LOCALIZED_ATTRIBUTE_SCHEMA_LABELS.md) | Localized attribute-schema labels — `label` becomes a locale map + `defaultLocale`, resolved from `Accept-Language` for users and served raw to the admin editor; **breaking DTO change with a closing window** (nothing is seeded yet, so it is free today) | `TODO` |
| 3 | [A14](MVP/A14_ATTRIBUTE_VALUE_SUGGESTIONS_AND_SEARCH_SCOPE.md) | Attribute-value suggestions + `searchScope` — typeahead pooled from what users already typed, so free text converges *before* an Equipment catalogue exists; results carry an optional `id` from day one so the client never changes when it does | `TODO` |
| 4 | [A15](MVP/A15_SEED_BADMINTON_AND_PICKLEBALL_SCHEMAS.md) | Seed the Badminton (and Pickleball) schemas — A9 shipped unseeded, so the whole attribute feature currently does nothing for anyone | `TODO` |
| 5 | [A16](MVP/A16_NUMBER_AND_BOOLEAN_ATTRIBUTE_TYPES.md) | `NUMBER` and `BOOLEAN` attribute types — named by v1 §3 as the next additions; writing a real Badminton schema is the first thing that needs them | `TODO` |
| 6 | [A10](MVP/A10_NO_DELETE_PATH_FOR_A_STORED_PROFILE_ATTRIBUTE.md) | No delete path for a stored profile attribute — merge-only semantics retained by A9, so a stored key can never be removed; stale keys also consume the 4KB cap. **Sharpened by v2:** `DEFINITION_LIST` gets a working clear path for free (an empty list), which makes its absence for `STRING`/`ENUM` user-visible | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A11](MVP/A11_ADMIN_SCHEMA_READ_AND_RENAME_COLLISION_GUARD.md) | Admin attribute-schema read + rename collision guard — closes two gaps found while building client ADMIN-2: A9's schema `GET`/`PUT` disagreed about inactive sports (admin could write a schema it could never read back), and `updateSport` had no `existsByName` guard so a duplicate rename returned **500 instead of 400** | `DONE` |
| 2 | [A9](MVP/A9_PER_SPORT_ATTRIBUTE_SCHEMA.md) | Per-sport attribute schema (admin-managed, server-side) — V059 + typed DTOs + two endpoints; profile writes validated leniently (invalid attributes dropped, not rejected); **also fixed app-wide `@PreAuthorize` denials returning 500 instead of 403** | `DONE` |
| 3 | [A8](MVP/A8_DROP_DB_LEVEL_FK_ON_USER_SPORT_PROFILES.md) | Drop DB-level FK on `user_sport_profiles.user_id` — V058; cross-domain coupling into `user-impl`, schema-only, no code change | `DONE` |
| 4 | [A7](MVP/A7_ENFORCE_ISACTIVE_ON_SPORT_TAGGED_CREATE_PATHS_IN.md) | Enforce `isActive` on sport-tagged create paths — **grew well past its filing**: also fixed `hasProfileForSport` (renamed `hasActiveProfileForActiveSport`) silently granting access from soft-deleted profiles, made the sport cache active-only, removed the max-3-profiles cap, and made re-adding a deleted profile reactivate its row | `DONE` |
| 5 | [A5](MVP/A5_CACHE_SPORT_LOOKUPS.md) | Cache sport lookups — sport data is effectively static at runtime | `DONE` |
| 6 | [A6](MVP/A6_MVP_SPORT_RESTRICTION.md) | MVP sport restriction — deactivate all sports except Badminton & Pickleball; enforce `isActive` on every read/write path | `DONE` |
| 7 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 8 | [A2](MVP/A2_SPORT_PROFILE_OWNERSHIP_CHECK.md) | Sport profile ownership check (update + delete) | `DONE` |
| 9 | [A3](MVP/A3_FLEXIBLE_PER_SPORT_ATTRIBUTES.md) | Flexible per-sport attributes (JSONB) | `DONE` |
| 10 | [A4](MVP/A4_BATCH_SPORT_LOOKUP.md) | Batch sport lookup in getUserProfiles (cleanliness, not a scaling fix) | `DONE` |

---

**Dependencies:**
```
No hard dependency between A1 and A2, but both touch SportController.java —
consider doing them in the same session to avoid re-reading the same file twice.
A3: no hard dependency, can run independently.

Schema v2 (design: documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md):

  A12 ─┬─> A14 ──> client SPORT-6
       └─> A15 <── A13
  A12, A13 ──> client SPORT-2 (rescoped onto v2)
  A16: independent of all of the above.

A12 and A13 are independent of each other, and both block A15. Land them close
together: both change the document format, and while nothing is seeded there is
nothing to migrate between them.

DO NOT seed any sport before A13 lands. A13 changes `label` from String to a
locale map — a breaking DTO change that is free only because A9 shipped unseeded
and all 12 sports still carry NULL. Seeding first manufactures a migration for
no reason (v2 design §11).
```
