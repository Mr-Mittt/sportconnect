# CLAUDE.md — sport-impl

Sport catalog and per-user sport profiles (skill level, position, experience).
Also serves sport thumbnail PNG files as static resources via classpath.

## Dependencies

| From | Why |
|---|---|
| `modules/sport/sport-api` | SportService + UserSportProfileService interfaces + DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| Spring Security | `@PreAuthorize` on admin-only sport management endpoints |

## Key Classes

| Class | Purpose |
|---|---|
| `SportServiceImpl` | Sport CRUD; soft delete via `isActive=false`; partial update (null-check per field) |
| `UserSportProfileServiceImpl` | Validates sport exists before profile create; blocks duplicate `(userId, sportId)` |
| `WebConfig` | `ResourceHandler`: `/images/**` → `classpath:/images/`; 1-year cache |

## Endpoints

```
GET    /api/sports                                          public, active only
GET    /api/sports/{sportId}                               public
GET    /api/sports/all                                     includes inactive — ROLE_ADMIN
GET    /api/sports/category/{category}                     public
POST   /api/sports                                         ROLE_ADMIN
PUT    /api/sports/{sportId}                               ROLE_ADMIN — partial; `statisticsEnabled` switches statistics and ranking on or off (SESSION-53 rework)
DELETE /api/sports/{sportId}                               soft delete — ROLE_ADMIN

POST   /api/sports/profiles                                 ROLE_USER — userId from JWT principal
GET    /api/sports/profiles/{profileId}                    ROLE_USER — owner-only (A21)
GET    /api/sports/profiles                                 ROLE_USER — caller-scoped list (A22); ?includeInactive=true
GET    /api/sports/profiles/sport/{sportId}                ROLE_USER — caller-scoped, 404 if none (A22)
PUT    /api/sports/profiles/{profileId}                    ROLE_USER
DELETE /api/sports/profiles/{profileId}                    ROLE_USER
```

## Run Tests

```bash
./gradlew :modules:sport:sport-impl:test
```

## Gotchas

- **`sports.statistics_enabled`** (entity `Sport.statisticsEnabled`, off by default, V105) is the one switch for statistics and ranking: `SportService.isStatisticsEnabled(sportId)` (active sports only, a 404 otherwise) and `getStatisticsEnabledSportIds()` (one in-memory pass over the cached active sports) are what the session module's statistics runner and ranking proposal read, so every write that changes it must evict `SportLookupCache` (`updateSport` and `createSport` do). It does not affect logging results, which needs only `result_schema`. Which stats a sport counts is not stored here: it is the result schema's `record.scoreboard.columns` (`documentation/md/RECORD_SCHEMA_CONTRACT.md`).
- `getAllSports()` uses `findAll()` (returns inactive records too); `getAllActiveSports()` uses `findByIsActiveTrue()`. There is no global `isActive` filter — always call the correct method explicitly.
- `UserSportProfile` stores `sportId` (Long) as a plain column, no `@ManyToOne`. The service fetches `Sport` by ID for each profile in `getUserProfiles()` — potential N+1 on large lists.
- Image PNGs: `src/main/resources/images/sports/*.png` (12 files). V013 migration sets `icon_url` to `/images/sports/{name}.png`. `WebConfig` serves them; `SecurityConfig` (in auth-impl) must have `permitAll("/images/**")`.
- `FacilityType` entity and repository exist but have no service, no controller, no endpoints — leftover placeholder, leave it alone.
