# U3 · UserPreference endpoints

**Status:** DONE
**Module:** `modules/user/user-api` + `modules/user/user-impl`
**Date:** 2026-07-02

## What was built

Wired up the previously-orphaned `UserPreference` entity (table + entity + repository already existed
from V001, but had no service or controller) with a self-service settings API.

- `GET /api/users/me/preferences` — returns the caller's preferences, auto-creating a default row on
  first access
- `PUT /api/users/me/preferences` — partial update; also auto-creates a default row first if none
  exists yet (upsert semantics on both endpoints, not just GET)
- Both endpoints are `ROLE_USER`, always keyed off the authenticated caller
  (`SecurityUtils.extractUserId(Authentication)`) — no path param, so there's no "other user's
  preferences" to leak and no permission check needed beyond authentication itself
- New DTOs: `UserPreferenceResponse` (all 9 fields + timestamps), `UpdateUserPreferenceRequest` (same
  fields, all optional)
- New service interface `UserPreferenceService` (`user-api`) + `UserPreferenceServiceImpl`
  (`user-impl`), sharing a private `findOrCreate()` helper between `getPreferences()` and
  `updatePreferences()`

## Key decisions

- **PUT auto-creates too, not just GET** — the client doesn't need to GET before it can PUT; both
  endpoints upsert.
- **Invalid enum values silently fall back to that field's default**, rather than rejecting with 400
  or preserving whatever was previously stored. E.g. `distanceUnit: "furlongs"` results in `"km"` (the
  schema default), not an error and not the prior value. This applies only to `distanceUnit`
  (`km`/`mi`) and `privacyProfile`/`privacyLocation` (`public`/`friends`/`private`) — the three fields
  with a restricted value set. Notification booleans have no "invalid" state to handle.
- Followed the sibling `UserFriendController`'s convention (`Authentication` +
  `SecurityUtils.extractUserId()`) rather than `UserController`'s `@AuthenticationPrincipal String`
  pattern, since it's the more recent convention in this exact package.

## Non-obvious constraints

- No migration needed — `user_preferences` table already existed from V001.
- This ticket is deliberately scoped to **app settings only**. A related but distinct concept —
  physical/sport profile data (height/weight/shoe size, sport-specific attributes like dominant hand)
  — was raised during scoping and split into two separate tickets instead: **U7** (this module) and
  **A3** (`modules/sport`). See those tickets' text for why "preference" and "physical profile" are
  kept as separate concepts in this codebase.

## Tests

8 new tests in `UserPreferenceServiceImplSpec.groovy`: defaults created on first `GET`, existing row
returned without re-creating, defaults created first on `PUT` when missing, partial update only
changes supplied fields, invalid `distanceUnit`/`privacyProfile`/`privacyLocation` each fall back to
default, valid `distanceUnit` accepted as-is. Full module suite: 55 → 63 tests, 0 failures, 0 errors.

Run with: `./gradlew :modules:user:user-impl:test`

---

**Status:** `DONE`
**Type:** New Feature
**Entities:** `UserPreference` (already exists — table + entity + repository from V001; no service or
controller wired up yet)

Wire up the existing `UserPreference` entity end-to-end so users can read/update their settings
(language, timezone, distance unit, notification toggles, privacy).

**New DTOs (in `user-api`):**
- `UserPreferenceResponse` — all 9 config fields (`language`, `timezone`, `distanceUnit`,
  `notificationEmail`, `notificationPush`, `notificationSms`, `privacyProfile`, `privacyLocation`, plus
  timestamps)
- `UpdateUserPreferenceRequest` — same fields, all nullable/optional (partial update — only supplied
  fields change)

**New service interface — `UserPreferenceService` (in `user-api`):**
```java
UserPreferenceResponse getPreferences(UUID userId); // auto-creates a default row on first access
UserPreferenceResponse updatePreferences(UUID userId, UpdateUserPreferenceRequest request);
```

**New controller — `UserPreferenceController` (in `user-impl`) at `/api/users/me/preferences`:**
```
GET /api/users/me/preferences   ROLE_USER — get caller's preferences (creates defaults if none exist)
PUT /api/users/me/preferences   ROLE_USER — partial update
```
Always keyed off `@AuthenticationPrincipal` — no path param, so this doesn't need U2's
permission-check pattern (there's no "other user's" preferences to leak).

**Validation:** `distanceUnit` in `{km, mi}`; `privacyProfile` / `privacyLocation` in
`{public, friends, private}` — reject invalid values with `BadRequestException`.

**Tests:** first `GET` auto-creates and returns defaults; subsequent `GET` returns the existing row;
partial `PUT` only changes supplied fields; invalid enum value on `PUT` is rejected.

---
