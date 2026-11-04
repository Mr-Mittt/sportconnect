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

**Not run yet** (updated 2026-11-04; the live results are under "Live rotation" below): the production-mode memory measurement, the restore drill with the new roles, the backup after the rotation, step 9 (retire the plain files) and the real Google provider if its app exists. The ticket stays `IN PROGRESS` until those results are recorded.

## Box results (2026-11-03, source: the owner's pasted outputs unless marked otherwise)

**Done on the A1 box**
- **Secrets store: OCI Vault.** A default vault with a software-protected AES key, the policy `sportconnect-box-secrets` (`Allow dynamic-group sportconnect-box to read secret-bundles in tenancy`), four secrets `sportconnect-prod-server-env`, `-chat-env`, `-stack-env`, `-kc-admin-pw` (Base64 template). The form shows no price; the Cost Analysis check (a Vault line of 0.00) is **not done yet** (owner, 2026-11-04).
- **`fetch-secrets.sh` round trip:** four `written` lines and four byte-identical files (`cmp`) against the staged originals. Its first real run found a bug (`PIPESTATUS[1]: unbound variable` under `set -u`, in the Vault branch that no earlier test reached); fixed and tested with a fake `oci` (ok, failing, invalid base64).
- **Rehearsal on the newest backup in a throwaway Postgres:** `rotate-credentials.sh postgres` twice (no error), `check` all 9 Postgres lines ok (the two RabbitMQ lines failed as expected: the live RabbitMQ was not rotated), ownership counts as designed (43 tables, 163 indexes and 36 sequences with `sc_app`; PostGIS objects left to the extension; chat 8 tables; Keycloak 89 tables), a second run changed nothing (new read-only `rotate-credentials.sh owners`, diff empty), and `ALTER TABLE` add and drop as `sc_app`, `sc_chat` and `sc_keycloak` on their own databases ok.
- **Chat 0.2.2** released (both platforms), promoted and deployed: `schema is up to date`, `chat service listening` 0.2.2, `deploy.log` OK, healthz 200.
- **Scheduled backup:** the timer's own run of 2026-11-02 19:03 UTC ended `backup 20261102T190302Z ok (4 files)`; the 7-day deletion is not due yet (check 2026-11-04).

**Still not run when this section was written (the live rotation followed the same day, see "Live rotation" below):** the live rotation, the Keycloak admin password, `apply-realm-production.sh` on the live realm, the sign-in, chat and reset-mail checks, the memory measurement, the restore drill with the new roles, the real Google provider if its app exists, step 9 (retire the plain files).

## Follow-up inside this ticket (agreed 2026-11-03, built after the live rotation)

One command per rotation, so no secret is moved by hand: `rotate-credentials.sh keycloak-admin` (set the admin password to the value in `$ENV_DIR/kc-admin-pw`, log in with the old one, verify the new one), `rotate-credentials.sh smtp` (the Brevo SMTP key: check the new login against Brevo, apply the SMTP settings of `server.env` to the realm, the SMTP step of `apply-realm-production.sh`, and tell the owner to recreate the server), `rotate-credentials.sh ghcr` (the GHCR token: log in with the new token, check that the box can still read the images, and print the token's expiry date so it is recorded in `SECRETS.md`) and perhaps `rotate-credentials.sh all` (postgres, rabbitmq, smtp, keycloak-admin in order, printing what no script can do). **Decision 2026-11-04 (owner):** the credentials-client secret and the internal service secret are system-to-system values, set once and kept; no rotation support for them, they are replaced by hand only if one ever leaks (steps in `SECRETS.md`). The Brevo key and the GHCR token are the two outside credentials that expire or leak, so those get the commands. **Design answers 2026-11-04 (owner):** `smtp` aborts, changing nothing, when the login check against Brevo fails; the GHCR token lives in the Vault item `sportconnect-prod-ghcr-token` (created by the owner in the console from the token now in `~/.docker/config.json`) and `fetch-secrets.sh` logs in with it like it writes the env files (the item is one line `<github user>:<token>`, so no `GHCR_USER` setting is needed; a bare token still works with `GHCR_USER`); the box never writes to the Vault (its policy stays read-only), so a rotation is: new token on GitHub, a new secret version in the console, then `rotate-credentials.sh ghcr`, which runs the fetch and login, checks that the box can read the images and prints the token's expiry. **Usernames (owner agreed 2026-11-04):** `smtp` also covers a new Brevo SMTP login, because it reads `MAIL_USERNAME` and `MAIL_PASSWORD` together from `server.env` for the login check and the realm settings; a new GitHub user is just a new Vault version with the new `<user>:<token>` line (owner's question 2026-11-04: why not keep the user in the secret; no good reason against it, and it saves editing the root-owned `secrets.conf`), so `ghcr` needs no user handling of its own. Two limits stay: a new Brevo key is issued in Brevo's console, and the box's Vault policy is read-only, so the Vault edit is the owner's. To be tested on a throwaway Keycloak like `apply-realm-production.sh`, with the guide and `SECRETS.md` updated in the same change. Reason for waiting: the live rotation already runs a lot of new code; nothing more is added before it.

## Live rotation (2026-11-03 and 2026-11-04, source: the owner's pasted outputs unless marked otherwise)

**Part 0 (2026-11-03):** the installed `sportconnect-deploy --version` hash equals the repo file's (`61e9104b...69df1`, CR stripped); 0 scripts with CRLF; the four secrets fetched into tmpfs; the override `diff` against the box's showed only the intended changes and no literal secret (every password a `${VAR:?...}`); `docker compose config` ok; a fresh backup `20261103T143139Z ok (4 files)`.

**The window (2026-11-03):** `rotate-credentials.sh postgres` and `rabbitmq` ran clean; `start-stack.sh` recreated Postgres, Redis, RabbitMQ and Keycloak ("keycloak realm is up", so Keycloak connected as `sc_keycloak`); `sportconnect-deploy --recreate=server,chat --yes` ended `deployed: server 0.1.2; chat 0.2.2;`. Four minutes later `sc-server` was healthy, `sportconnect-deploy --plan` said everything was unchanged, and `rotate-credentials.sh check` passed all 9 Postgres lines (each role connects to its own database and is refused on the other two) with only `sc_mq` left in RabbitMQ. No rollback was needed.

**`apply-realm-production.sh` on the live realm:** `check` first failed on one line (`sportconnect-swagger still exists`); `apply` set the web client URIs, the credentials-client secret (read-back matched), the SMTP settings and the master `frontendUrl`, deleted the dev Swagger client and set `editUsernameAllowed`; the second `check` passed (registration open by decision; the Google provider already enabled).

**Outside checks (owner's word):** password sign-in, Google sign-in, a chat message, a password-reset email and `docker logs` free of errors all ok.

**A gap found by the first try of the register page (2026-11-04):** the country list did not load. `kc-prod.override.yml` never set `SPORTCONNECT_API_BASE_URL` (the theme then called `http://localhost:8080/api` from the browser) and `CORS_ORIGINS` allowed only `https://yoursport.vn`; the note of 2026-10-15 above had asked for both, but no step or check carried it. Fixed in the repository (the override, `server.env.example`, the guide's section 10 check) and applied on the box: the origin added to the Vault secret (a new version), `start-stack.sh`, `sportconnect-deploy --recreate=server --yes`; `printenv` in the Keycloak container gave `https://yoursport.vn/api`, the API answered the `auth.yoursport.vn` origin with `Access-Control-Allow-Origin`, and the register page, the new account, the welcome email and the reset email all worked.

**Keycloak admin password (2026-11-04):** `set-admin-pw.sh` ran twice. The first time the same password was re-entered (nothing changed, and the Vault copy matched the file); the second time a new one was set and the Vault secret `sportconnect-prod-kc-admin-pw` updated; `cmp` of the fetched file with `~/.kc-admin-pw` printed `vault-matches` and `apply-realm-production.sh check` (which logs in with the Vault copy) passed. Reading the script found a flaw: the command chain inside the container ended with `rm`, so a failed login or password change still exited 0 and the script overwrote `~/.kc-admin-pw`. Fixed (the status is kept); not yet exercised on a failing run.

**Other results:** the Vault cost check on 2026-11-04 shows no Vault line in Cost Analysis (Nov 1 to Nov 3; look again in about a week). The 7-day backup deletion is observed: the set `20261027T170239Z` is gone and the oldest is `20261028T190038Z`. `start-stack.sh` no longer tells a running box to rotate credentials.

**Still to do before this ticket closes (five items, collected 2026-11-04 for 2026-11-05):**
1. The backup after the rotation: the timer runs at 19:00 UTC; check `journalctl -u sportconnect-backup -n 5` for `ok (4 files)`. Then guide section 18 step 9 (retire the plain files and the dot-files, after `apply-realm-production.sh check` is clean).
2. The production-mode Keycloak memory measurement (guide step 7): `docker stats --no-stream` at rest and during the read-only k6 run; record both here.
3. The restore drill with the new roles (guide step 6 and 8), best on a post-rotation backup set: `restore-test.sh`, and the whole restore on a throwaway box or rehearsal.
4. The real Google provider, if its Google app exists; if not, file a ticket.
5. The follow-up above: `rotate-credentials.sh keycloak-admin`, `smtp`, `ghcr` and perhaps `all`, tested on a throwaway Keycloak, with the guide and `SECRETS.md` updated.

Credential actions that are not on this list are in `infra/oracle/SECRETS.md`, section "Rotation status" (the Brevo key stays deferred by the owner's decision; the GHCR token's expiry date and the credentials-client and internal secrets' exposure are for the owner to record).
