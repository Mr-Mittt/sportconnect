# INFRA-14 · Production Keycloak on Oracle Always Free

**Status:** `IN PROGRESS` · **Type:** Infrastructure · **Depends on:** **INFRA-12** (go decision and the rewritten INFRA-3..6), INFRA-13 · **Gates:** the social-login feature reaching production

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
- **The realm file carries a dev-only client, `sportconnect-swagger`** (redirect `http://localhost:8080/swagger-ui/oauth2-redirect.html`). Decide whether Swagger is served in production at all (INFRA-10); if not, drop the client from the production realm, if so add its origin to the client's redirect URIs and web origins. **Answered by INFRA-10 (2026-11-01): the prod profile does not serve Swagger, so the client is dead weight in the production realm; drop it there.**
- **The realm file carries a dev secret for the backend client `sportconnect-credentials` (U24)** (`dev-credentials-client-secret`, a client that can run the password grant and, through its service account, set any user's password). Production must never keep it: run `infra/scripts/apply-realm-credentials-client.sh` with a real `KEYCLOAK_CREDENTIALS_CLIENT_SECRET` against the production realm, give the backend the same value (`KEYCLOAK_CREDENTIALS_CLIENT_SECRET`, plus `KEYCLOAK_ADMIN_URI`, both required by `application-prod.yml`), and check with `node infra/scripts/verify-credentials-client.mjs`.
- **The realm must allow username changes (U26).** `editUsernameAllowed: true` (set by `infra/scripts/realm-edit-username.mjs`, mirrored in the realm file, so a production realm that imports the file already has it; an existing realm needs `infra/scripts/apply-realm-edit-username.sh`). Without it the backend's email change fails with a 503, because Keycloak refuses to move a username even for its admin API. Check with `infra/scripts/verify-email-change.mjs` against a backend of the same release.
- **Reset link life** is 1 hour (realm attribute `actionTokenGeneratedByUserLifespan.reset-credentials` = 3600, set by `infra/scripts/realm-email-theme.mjs`).

## Production notes added 2026-10-16 (A27)

Ship `sportconnect-keycloak-extensions.jar` in the Keycloak image next to the theme JAR: the realm file will not import without it (flows, validators and the listener name its providers). The extension uses Keycloak-internal SPIs and is pinned to the 26.4 line (`keycloakVersion` in `infra/keycloak-extensions/build.gradle` moves with the image tag). Run `node infra/scripts/verify-phone-rules.mjs` against a production-like stack once (it creates and deletes its own `a27-*` users).

## Delta 2026-10-27 (INFRA-12): secrets approach, and what the sandbox left undone

Decision (owner, 2026-10-27), in two steps:

1. **Now (with INFRA-3..6):** app secrets live on the box only, in root-owned `chmod 600` env files under `/etc/sportconnect/` (`server.env`, `chat.env`, `keycloak.env`, `postgres.env`, GHCR token), read by Compose through `env_file`. CI never holds them (deploys are pull-based, INFRA-6). Add a `SECRETS.md` inventory (name, purpose, location, how to rotate; no values) and keep an encrypted copy of the values in the owner's password manager.
2. **In this ticket:** move them to **OCI Vault** with an instance principal (dynamic group + IAM policy), a fetch script that writes a tmpfs env file before the containers start, rotation by new secret version. The Vault free allowance was **not confirmed**; check it before committing to it. Fallback if it is billed or too fiddly: SOPS + age.

What the INFRA-12 sandbox left at dev grade, to be fixed here: Postgres password `sa` and one superuser shared by the app, chat and Keycloak; RabbitMQ `guest/guest`; Redis without a password; the Brevo SMTP key and the Keycloak admin password were pasted in a chat and must be rotated; the production redirect URIs, credentials-client secret, SMTP settings and the master realm `frontendUrl` were applied to the live realm through the admin API only (scripts in `infra/oracle/scripts/set-*.sh`, not in `sportconnect-realm.json`); no backups of the database, Keycloak or the Caddy certificates (`caddy_data`); registration is open. Reference material: `infra/oracle/`, `INFRA-12_ORACLE_SANDBOX_RUNBOOK.md`.

## Delta 2026-10-30 (INFRA-6 box checks): the GHCR token is a Docker login, not an env file

The "GHCR token" named in the 2026-10-27 delta above is, as built by INFRA-6, a **`docker login ghcr.io`** done once by hand on the box with a classic token that has only `read:packages` (guide section 16, "Once: the box"). It lives in `~/.docker/config.json` (mode 600), is read by `sportconnect-deploy` (`docker buildx imagetools inspect`, `docker pull`), and is not read by any container or `env_file`. The env files are in `~/web`, not `/etc/sportconnect/` as step 1 of that delta planned.

For this ticket, when the secrets move to OCI Vault (or SOPS + age):
- Include this token. The fetch step has to end in a `docker login` (stdin, no command line), so it runs before `sportconnect-deploy` and again after a rotation; it is not a tmpfs env file like the others.
- The classic token has an expiry. Until it is automated, an expired token makes `sportconnect-deploy` fail on the registry read or the pull; add its expiry date to `SECRETS.md` and say how to rotate it (new token, same login command).
- Alternative that removes the token: make the three GHCR packages public (they hold no secrets, the env files stay on the box). That exposes the compiled server, chat and client, so it is a decision for the owner, not assumed here.
- Until then the manual login stays; no `set-ghcr-login.sh` is planned (owner decision, 2026-10-30): it would be thrown away when this ticket lands.

## Scope locked 2026-11-03 (picked up with /workon)

Owner decisions: one ticket, not split; secrets store = OCI Vault if the free allowance is confirmed in the console, else SOPS+age; Google is the only provider in scope (Facebook and Zalo wait for their apps); registration stays open (recorded in the guide, section 13); a Redis password is included, which needs a small chat change (chat 0.2.2); the app's Postgres role owns its database with the extensions created once by an admin.

**Already true when the ticket was picked up** (INFRA-12/13): Keycloak runs in production `start` mode behind Caddy at `auth.yoursport.vn`; the nightly backup and the restore already cover `sportconnect_dev`, `sportconnect_chat_dev` and `keycloak_dev` together; the box reaches OCI with an instance principal. **Found while exploring:** chat had no Redis password setting (`redis.Options{Addr}` only), so a Redis password needs a chat release; the app's first migration runs `CREATE EXTENSION postgis`, which a non-superuser cannot do; the realm file is also what the dev Keycloak imports, so the production values cannot go in it.

**Out of scope:** Facebook and Zalo providers, closing registration, rotating the Brevo key (owner's decision, INFRA-3 row 23), a config image (INFRA-19), monitoring, AWS.

**Consumer census:** `server.env` and `chat.env` (updated here, examples too); `backup-postgres.sh` (compatible as-is: it reaches `postgres` through the container's local socket); `restore-from-bucket.sh` (updated: re-applies the roles after a restore); `sportconnect-deploy` (updated: `ENV_DIR`, `--recreate=`); `start-stack.sh` (updated: `stack.env`); chat `config.go` (updated: `REDIS_PASSWORD`); client, MSW and every API shape (not touched). No error code, enum or client string changes.

## Build record (2026-11-03, branch `docs/infra-14-production-keycloak`)

Built and checked locally: chat `REDIS_PASSWORD` (go build, vet, config tests); `rotate-credentials.sh` (against a throwaway Postgres with real-shaped objects and a throwaway RabbitMQ: ownership moved, PostGIS tables left to the extension, the app role runs DDL without being a superuser, cross-database `CONNECT` refused, idempotent); `apply-realm-production.sh` (throwaway Keycloak with the committed realm file: `check` failed everywhere, `apply` fixed it, `check` passed, second `apply` idempotent); `fetch-secrets.sh` (Linux container, stand-in `sops`); `docker compose config` of the production override with and without the passwords; `bash -n` on every script. Docs: guide sections 4, 5, 6, 13, new 18 and a change-history row, `SECRETS.md`, chat README and CLAUDE.md rows.

**Not run yet** (all of it needs the box, and the order is in guide section 18): the Vault price and policy (or SOPS), the rehearsal on a restored copy, chat 0.2.2 (`/release chat patch`, promote), the live rotation with `sportconnect-deploy --recreate=server,chat`, `apply-realm-production.sh` on the live realm, the Keycloak admin password rotation, the sign-in/chat/reset-mail checks, the production-mode memory measurement, the restore drill with the new roles, and the real Google provider if its app exists. The ticket stays `IN PROGRESS` until those results are recorded.
