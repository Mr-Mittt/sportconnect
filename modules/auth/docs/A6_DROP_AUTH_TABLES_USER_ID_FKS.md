# A6 · Drop DB-level FKs on auth tables' `user_id` columns

**Status:** DONE (2026-08-10)
**Type:** Enhancement (Architecture)
**Migration:** `V044__drop_auth_tables_user_id_fks.sql`

## Context

Filed 2026-08-10 in a repo-wide sweep for cross-domain DB-level FKs (see `aac6e6b`), following
the precedent set by `post-impl`'s A13 (`posts.sport_id`). Three `auth-impl` tables carried a real
Postgres FK across into `users`, owned by the `user-impl` domain — a hard schema coupling that
works against "monolith-first, microservice-ready" (root `CLAUDE.md`: "cross-domain references
use IDs only", added 2026-07-07). `V002__create_auth_tables.sql` predates that rule (initial
commit, 2026-03-03) and was never retrofitted.

## What was verified before implementing

1. **Constraint names**, via `\d <table>` against the live `sportconnect_dev` database (not
   assumed from the migration file):
   - `email_verifications_user_id_fkey`
   - `password_reset_tokens_user_id_fkey`
   - `refresh_tokens_user_id_fkey`

   All matched the ticket's guessed (conventional) names exactly.

2. **No code path relies on `ON DELETE CASCADE`.** Grepped `user-impl` for a hard-delete-user
   path: `UserServiceImpl.deleteUser()` (`modules/user/user-impl/.../UserServiceImpl.java:213-221`)
   is a **soft delete** — it sets `isActive = false` and saves, never issues a row `DELETE`. No
   other caller deletes a `User` row. The three token tables (`email_verifications`,
   `password_reset_tokens`, `refresh_tokens`) already have their own expiry/revocation logic
   independent of user deletion, so dropping the cascade has no behavioral effect today.

## What was built

One Liquibase changeset, `V044__drop_auth_tables_user_id_fks.sql`, registered in
`db.changelog-master.xml`:

```sql
ALTER TABLE email_verifications DROP CONSTRAINT email_verifications_user_id_fkey;
ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_user_id_fkey;
ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_user_id_fkey;
```

Purely schema-level — no entity, repository, service, or DTO change. All three JPA entities
(`EmailVerification`, `PasswordResetToken`, `RefreshToken`) already stored `userId` as a plain
`UUID` field with no `@ManyToOne`, so the application layer was already compliant; only the
schema constraint wasn't.

## Verification

- Applied against the running dev DB via `:server:bootRun` (Liquibase auto-runs on context
  init) — changeset ran successfully in 91ms, recorded in `databasechangelog`.
- Confirmed via `\d <table>` post-migration: all three FKs gone; every other constraint/index
  (`_pkey`, `_token_key` unique constraints, `idx_*_user_id` btree indexes) untouched.
- `./gradlew :modules:auth:auth-impl:test` — pass.
- `./gradlew :server:test` — pass (includes `*IntegrationTest`/`*IT` classes touching the auth
  module; confirms the H2 test-profile schema and Spring context are unaffected).

## Out of scope (unchanged)

`users`/`roles`/`user_roles` (owned by `user-impl` itself, self-referential — no FK to remove).
Any change to `EmailVerification`/`PasswordResetToken`/`RefreshToken`'s JPA entities or the
services that use them.
