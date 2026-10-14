# U23 · `users` schema: nullable email, unique E.164 phone, and null-safe consumers

**Status:** `TODO` · **Type:** Schema + refactor · **Depends on:** none (independent of Keycloak) · **Gates:** auth A25, A26; unblocks auth A22

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md`).

## What

1. Liquibase migration: `users.email` nullable (keep the unique index; nulls do not collide), `users.phone_number` normalised to E.164 and made **unique and nullable**, a check `email IS NOT NULL OR phone_number IS NOT NULL`. Existing dev phone values are normalised or cleared first; the migration must not fail on free-text data. `password_hash` is already nullable.
2. Make every consumer null-safe (census, 2026-10-14): `User.getDisplayName()` (falls back to email), `UserRepository.findByEmail*` / `existsByEmail`, `UserService.getUserByEmail` / `findUserIdByEmail` / `verifyCredentials` / `reactivateUserByEmail`, `GET /api/users/email/{email}`, `GET /api/users/check/email`, `RegisterRequest` / `UpdateProfileRequest` phone validation (E.164), `UserResponse`, the `AuthServiceImpl` response map.
3. `phone_number` uniqueness is a business rule with a stable `errorCode` (C12): `PHONE_ALREADY_USED`. Add its en and vi `errors:codes` entry in the client in this change or file the client ticket straight away.
4. Check that no existing dev `users.id` can collide with a Keycloak `sub` (both UUIDs; note the result here).

## Out of scope

Provisioning from a token (A26); the Keycloak-side rules (A27); what a user without email can do (A22).

## Done when

The migration applies on a populated dev database; the H2 `schema.sql` mirror is updated; an integration test proves the unique phone and the check constraint reject through a real write; every consumer above is marked updated.
