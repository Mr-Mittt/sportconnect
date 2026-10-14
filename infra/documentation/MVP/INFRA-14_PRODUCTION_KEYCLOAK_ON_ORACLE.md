# INFRA-14 · Production Keycloak on Oracle Always Free

**Status:** `TODO` · **Type:** Infrastructure · **Depends on:** **INFRA-12** (go decision and the rewritten INFRA-3..6), INFRA-13 · **Gates:** the social-login feature reaching production

**Filed:** 2026-10-14, from the social-login `/feature`.

## What

Run Keycloak (Postgres schema, production `start` mode, the theme and extension JARs, the realm import) on the Oracle host chosen by INFRA-12, behind the same Caddy as the app with its own hostname and HTTPS. Measure memory in production mode (A23 measured only dev mode), set the real Google, Facebook and Zalo redirect URIs and secrets as environment secrets, and back up its schema with the app's `pg_dump`.

## Out of scope

The dev Compose service (INFRA-13); any AWS plan.

## Done when

The production realm runs from the committed import, Keycloak survives a restart, backups include its schema, and the measured production-mode memory is recorded here.
