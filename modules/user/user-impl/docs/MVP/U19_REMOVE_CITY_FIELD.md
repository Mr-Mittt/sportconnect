# U19 · Remove `city` field entirely from the backend

**Status:** `TODO`
**Type:** Enhancement (Architecture — schema/DTO removal)
**Depends on:** CLIENT-REF-3 (client, sequenced after) — ships first so no live client still sends/reads `city`
**Filed:** 2026-09-29, found + scope-decided during CLIENT-REF-3's pickup: `EditProfileModal`'s free-text City
input is being replaced by the structured `GeoLocaleRegionField` (Region), and the user decided to retire
`city` entirely rather than leave it an orphaned, unused column.

## What

Removes `users.city` and every backend reference to it — a plain, unrelated free-text column (V001) with no
link to the `reference` domain's `regions` table (unlike `country`, which U16 gave a real `countryId` link +
backfill). No backfill into `regionId` is planned or possible here: matching arbitrary free-text city strings
to a `regions` row is a materially fuzzier problem than U16's ~250-country name match, and out of proportion
for what is otherwise a pure removal. Existing `city` data is simply dropped with the column — accepted,
explicit data loss, not a migration.

**Entry point:** `PUT /api/users/{userId}/profile` (request no longer accepts `city`), `GET` responses that
return `UserResponse`/`UserSearchResponse` (both lose the field).

**Scope:**
- `V076` migration: `ALTER TABLE users DROP COLUMN city`
- Remove `city` from `User` entity, `UpdateProfileRequest`, `UserResponse`, `UserSearchResponse`
- Remove the two `.city(user.getCity())` builder lines in `UserServiceImpl` (single-user read + search mapper)
- Update `UserSpec`, `UserServiceImplSpec` (several `.city(...)` fixture builders and `result.city == ...`
  assertions currently reference it)
- Update `server/src/test/resources/schema.sql` (drop the H2-mirrored column)
- Re-run the consumer census at pickup (this ticket was filed from a client-side discussion, not a backend
  grep pass) — confirm nothing else (e.g. `UserSearchResponse` consumers, admin tooling) reads `city` before
  removing it there too.

**Out of scope:** any backfill/migration of existing `city` text into `regionId`; removing/renaming
`UserResponse.regionName` or any other field U16 added.

**Tests:** Spock (`user-impl`) updated for the removed field; `:server:test` full run (schema change); no new
IT needed (pure removal, no new access-control surface).
