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
PUT    /api/sports/{sportId}                               ROLE_ADMIN
DELETE /api/sports/{sportId}                               soft delete — ROLE_ADMIN

POST   /api/sports/profiles                                 ROLE_USER — userId from JWT principal
GET    /api/sports/profiles/{profileId}                    public
GET    /api/sports/profiles/user/{userId}                  public
GET    /api/sports/profiles/user/{userId}/sport/{sportId}
PUT    /api/sports/profiles/{profileId}                    ROLE_USER
DELETE /api/sports/profiles/{profileId}                    ROLE_USER
```

## Run Tests

```bash
./gradlew :modules:sport:sport-impl:test
```

## Gotchas

- `getAllSports()` uses `findAll()` (returns inactive records too); `getAllActiveSports()` uses `findByIsActiveTrue()`. There is no global `isActive` filter — always call the correct method explicitly.
- `UserSportProfile` stores `sportId` (Long) as a plain column, no `@ManyToOne`. The service fetches `Sport` by ID for each profile in `getUserProfiles()` — potential N+1 on large lists.
- Image PNGs: `src/main/resources/images/sports/*.png` (12 files). V013 migration sets `icon_url` to `/images/sports/{name}.png`. `WebConfig` serves them; `SecurityConfig` (in auth-impl) must have `permitAll("/images/**")`.
- `FacilityType` entity and repository exist but have no service, no controller, no endpoints — leftover placeholder, leave it alone.
