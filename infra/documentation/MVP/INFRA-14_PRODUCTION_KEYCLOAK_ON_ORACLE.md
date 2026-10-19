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

## Notes from A28 (2026-10-16)

- **The email theme has to ship with the production Keycloak.** Dev mounts the directory `infra/keycloak/themes/` into the Compose Keycloak; production bakes it into the image (or mounts it) beside the login theme JAR, and the realm sets `emailTheme: sportconnect` (already in `sportconnect-realm.json`). Without it Keycloak falls back to its stock English messages.
- **Keycloak needs real SMTP in production** (reset and verification mails): `smtpServer` in the realm file points at the dev Mailpit; set the real host, port and credentials through the admin API or env, never in the file. The backend sends the welcome email through its own `spring.mail` settings (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `EMAIL_FROM`); the dev profile points those at Mailpit, production must set them.
- **`JWT_SECRET` is gone** from the backend (`application-prod.yml` no longer reads it); remove it from any deployment config. Chat dropped it in CHAT-17.
- **The realm file carries a dev-only client, `sportconnect-swagger`** (redirect `http://localhost:8080/swagger-ui/oauth2-redirect.html`). Decide whether Swagger is served in production at all (INFRA-10); if not, drop the client from the production realm, if so add its origin to the client's redirect URIs and web origins.
- **The realm file carries a dev secret for the backend client `sportconnect-credentials` (U24)** (`dev-credentials-client-secret`, a client that can run the password grant and, through its service account, set any user's password). Production must never keep it: run `infra/scripts/apply-realm-credentials-client.sh` with a real `KEYCLOAK_CREDENTIALS_CLIENT_SECRET` against the production realm, give the backend the same value (`KEYCLOAK_CREDENTIALS_CLIENT_SECRET`, plus `KEYCLOAK_ADMIN_URI`, both required by `application-prod.yml`), and check with `node infra/scripts/verify-credentials-client.mjs`.
- **Reset link life** is 1 hour (realm attribute `actionTokenGeneratedByUserLifespan.reset-credentials` = 3600, set by `infra/scripts/realm-email-theme.mjs`).

## Production notes added 2026-10-16 (A27)

Ship `sportconnect-keycloak-extensions.jar` in the Keycloak image next to the theme JAR: the realm file will not import without it (flows, validators and the listener name its providers). The extension uses Keycloak-internal SPIs and is pinned to the 26.4 line (`keycloakVersion` in `infra/keycloak-extensions/build.gradle` moves with the image tag). Run `node infra/scripts/verify-phone-rules.mjs` against a production-like stack once (it creates and deletes its own `a27-*` users).
