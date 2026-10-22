# INFRA-14 · Production Keycloak on Oracle Always Free

**Status:** `TODO` · **Type:** Infrastructure · **Depends on:** **INFRA-12** (go decision and the rewritten INFRA-3..6), INFRA-13 · **Gates:** the social-login feature reaching production

**Filed:** 2026-10-14, from the social-login `/feature`.

## What

Run Keycloak (Postgres schema, production `start` mode, the theme and extension JARs, the realm import) on the Oracle host chosen by INFRA-12, behind the same Caddy as the app with its own hostname and HTTPS. Measure memory in production mode (A23 measured only dev mode), set the real Google, Facebook and Zalo redirect URIs and secrets as environment secrets, and back up its schema with the app's `pg_dump`.

## Database (decided at INFRA-13, 2026-10-14)

Keycloak creates its tables but not its database or role. The deploy runs `infra/scripts/create-keycloak-db.sh` once against the production Postgres (admin `PGHOST`/`PGUSER`/`PGPASSWORD`, plus `KEYCLOAK_DB_NAME`, `KEYCLOAK_DB_USER` and `KEYCLOAK_DB_PASSWORD` from environment secrets) so Keycloak gets a least-privilege role that owns its own database instead of the superuser. It is idempotent, so it can run on every deploy. Preferred layout: the same Postgres instance as the app, a separate database (a dedicated Keycloak container is the alternative, about 100-200 MB more memory, for independent backup and upgrade; decide with the INFRA-12 measurements).

**Back up and restore Keycloak's database together with the app's.** `users.id` equals the Keycloak `sub`, so restoring only one side leaves app users pointing at an identity that does not exist, or the reverse. The backup and the restore drill must cover both.

> **Added 2026-10-15 (client AUTH-16):** the Keycloak register page reads the public `/api/reference` lists from the browser.
> Production therefore needs (1) the Keycloak origin in the API's `CORS_ORIGINS`, and (2) the Keycloak environment variable
> `SPORTCONNECT_API_BASE_URL` set to the API's public `/api` URL (the theme's default is the local one). Both are checked by the
> same smoke test as the theme itself: open `/register` on the production Keycloak and see the country list load.
## Out of scope

The dev Compose service (INFRA-13); any AWS plan.

## Done when

The production realm runs from the committed import, Keycloak survives a restart, backups include its schema, and the measured production-mode memory is recorded here.
