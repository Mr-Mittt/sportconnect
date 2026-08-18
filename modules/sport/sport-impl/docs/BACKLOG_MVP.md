# Sport Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/sport/sport-impl`  
**Last updated:** 2026-08-08

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
| 1 | [A7](MVP/A7_ENFORCE_ISACTIVE_ON_SPORT_TAGGED_CREATE_PATHS_IN.md) | Enforce `isActive` on sport-tagged create paths in group/location/session domains | `TODO` |
| 2 | [A8](MVP/A8_DROP_DB_LEVEL_FK_ON_USER_SPORT_PROFILES.md) | Drop DB-level FK on `user_sport_profiles.user_id` (cross-domain, violates domain-scoped-tables rule) | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A5](MVP/A5_CACHE_SPORT_LOOKUPS.md) | Cache sport lookups — sport data is effectively static at runtime | `DONE` |
| 2 | [A6](MVP/A6_MVP_SPORT_RESTRICTION.md) | MVP sport restriction — deactivate all sports except Badminton & Pickleball; enforce `isActive` on every read/write path | `DONE` |
| 3 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 4 | [A2](MVP/A2_SPORT_PROFILE_OWNERSHIP_CHECK.md) | Sport profile ownership check (update + delete) | `DONE` |
| 5 | [A3](MVP/A3_FLEXIBLE_PER_SPORT_ATTRIBUTES.md) | Flexible per-sport attributes (JSONB) | `DONE` |
| 6 | [A4](MVP/A4_BATCH_SPORT_LOOKUP.md) | Batch sport lookup in getUserProfiles (cleanliness, not a scaling fix) | `DONE` |

---

**Dependencies:**
```
No hard dependency between A1 and A2, but both touch SportController.java —
consider doing them in the same session to avoid re-reading the same file twice.
A3: no hard dependency, can run independently.
```
