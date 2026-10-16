# INFRA-13 · Keycloak in the dev Compose stack, with the realm as code

**Status:** `DONE` (2026-10-14) · **Type:** Infrastructure · **Depends on:** none · **Gates:** auth A25, A26, A27, A29; chat CHAT-17

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md`).

## What

- A `keycloak` service in `infra/docker-compose.dev.yml` (Keycloak 26.4, its schema in the existing Postgres, a host port that does not collide with 8080), with the providers directory mountable for the A23/A27 JARs.
- The realm as a committed import (`infra/keycloak/`): public client for the web app (PKCE S256, redirect URIs), access-token lifetime **5 min**, an audience mapper for our API, optional `email` / `firstName` / `lastName` in the user profile, en and vi enabled, SMTP pointed at the dev mail sink, Apple and GitHub not configured. **No secrets in the repo**: provider client secrets come from the environment.
- CI: Java and Maven available for the theme and extension builds (A23 measured: Maven must be on PATH).
- Document the commands in `infra/documentation/` and the root CLAUDE.md Commands section.

## Findings to reuse (A23)

Keycloak started in 12 s, about 810 MiB idle in dev mode. In Compose, a provider's back-channel URLs must use the container-internal host, and a pinned `KC_HOSTNAME` keeps issuers consistent.

## Out of scope

Production Keycloak (**INFRA-14**), provider credentials, the extension (A27), the theme (AUTH-15).

## Done when

`docker compose up` brings Keycloak up with the realm imported; the realm file contains no secret; the docs are updated; verified locally with `docker compose config` and a real `up`.

## Scope decisions (2026-10-14, at pickup)

Mail sink: Mailpit added (the stack had none). Host port 8081. Separate `keycloak_dev` database on the existing Postgres. Realm `sportconnect`, public client `sportconnect-web`, no seeded users. Admin console `admin`/`admin` (dev-only). The CI item ("Java and Maven available") is **not built here**: no workflow builds a theme or extension yet, so the Maven requirement is documented below and the workflow change belongs to AUTH-15 (theme) and A27 (extension). Added at the owner's request: the database bootstrap is an idempotent script usable on dev and production, not a typed command (see Database below).

## What was built

- `infra/docker-compose.dev.yml`:
  - `keycloak` (`quay.io/keycloak/keycloak:26.4`, `start-dev --import-realm`, host port **8081**, schema in `keycloak_dev` on the existing Postgres, `KC_HOSTNAME=http://localhost:8081` plus `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`, admin `admin`/`admin`).
  - `mailpit` (SMTP 1025, UI http://localhost:8025).
  - `postgres` gained a `pg_isready` healthcheck; `keycloak` waits on it (it fails at boot if the database is not up).
- `infra/keycloak/realm/sportconnect-realm.json` (no secrets):
  - Realm `sportconnect`: access token **300 s**, SSO session idle 1 day and max 7 days (the idle value is what `refresh_expires_in` reports; tune with A26), registration and reset-password on, `verifyEmail` off until A28, `registrationEmailAsUsername` off, `duplicateEmailsAllowed` off, locales **en** (default) and **vi**, SMTP to `mailpit:1025`.
  - Client `sportconnect-web`: public, standard flow only, **PKCE S256 required**, direct-access grant off, redirect and web origin `http://localhost:5173`, an audience mapper adding **`sportconnect-api`** to the access token.
  - Declarative user profile: `email`, `firstName`, `lastName` optional, `username` required.
  - No identity providers (Apple and GitHub are out of scope; Google, Facebook and Zalo arrive with A29).
- `infra/keycloak/providers/` is mounted read-only at `/opt/keycloak/providers` for the A27 extension and AUTH-15 theme JARs; `*.jar` there is git-ignored.
- `infra/scripts/create-keycloak-db.sh` (LF via `.gitattributes`): see Database.

### Commands

```bash
docker compose -f infra/docker-compose.dev.yml up -d keycloak mailpit   # Keycloak http://localhost:8081 (admin/admin), mail http://localhost:8025
docker compose -f infra/docker-compose.dev.yml stop keycloak mailpit
```

Realm discovery: `http://localhost:8081/realms/sportconnect/.well-known/openid-configuration`; JWKS at `.../protocol/openid-connect/certs`.

### Database

Keycloak creates its own tables but never the database or the role. `create-keycloak-db.sh` creates the database (default `keycloak_dev`), and a login role that owns it when `KEYCLOAK_DB_USER`/`KEYCLOAK_DB_PASSWORD` are set; running it again changes nothing.
- **Fresh dev volume:** mounted into `docker-entrypoint-initdb.d`, so `docker compose down -v` then `up` recreates `keycloak_dev` and Keycloak re-imports the realm.
- **Existing dev volume (once):** `docker compose -f infra/docker-compose.dev.yml exec -T postgres sh /docker-entrypoint-initdb.d/10-create-keycloak-db.sh`. In Git Bash on Windows prefix the command with `MSYS_NO_PATHCONV=1`, or Git Bash rewrites the container path.
- **Production:** INFRA-14 runs the same script once against the production Postgres with an admin connection and the `KEYCLOAK_DB_*` variables, so Keycloak gets its own least-privilege role.

### Changing the realm file

Keycloak imports with strategy IGNORE_EXISTING: editing the JSON does nothing to a realm that already exists. To re-import in dev: `docker compose -f infra/docker-compose.dev.yml rm -sf keycloak`, then drop the database (`exec -T postgres psql -U postgres -c "DROP DATABASE keycloak_dev WITH (FORCE)"`), run the script above, `up -d keycloak`. This also deletes every Keycloak user. **Keycloak and the app database are coupled by `users.id` = Keycloak `sub`**: wipe both together (`down -v`) or neither, otherwise `users` rows point at a `sub` that no longer exists.

### Theme and extension builds

`keycloakify build` and the A27 extension need a JDK and **Apache Maven on PATH** (A23: it does not download one). Local machines need Maven installed; the CI job that builds the theme is **done by AUTH-15** (`client-ci.yml`: the `test` job builds the theme Storybook, the `keycloak-e2e` job builds the JAR with `infra/scripts/build-keycloak-theme.sh` and runs it in a throwaway Keycloak through `infra/scripts/run-keycloak-e2e.sh`); the A27 extension build is still to come.

## Verification (run locally, 2026-10-14)

- `docker compose config` clean; `up` brought Keycloak 26.4.7 up in about 18 s (771 MiB in dev mode; Mailpit 7 MiB), logs show "Realm 'sportconnect' imported".
- Script: creates on an existing volume, creates on a fresh volume through `initdb.d`, no-op on the second run, creates the role plus an owned database when `KEYCLOAK_DB_USER` is set, and fails with a clear message (exit 1) when the password is missing.
- Headless Playwright against the real container (`tmp/a23-spike/infra13-verify.mjs`, not committed): a user with **no email and no names** was created and logged in; a request without a PKCE challenge is refused (`Missing parameter: code_challenge_method`); a wrong `code_verifier` is refused; the right one yields an RS256 token with `iss` `http://localhost:8081/realms/sportconnect`, `aud` `["sportconnect-api","account"]`, `azp` `sportconnect-web`, lifetime **300 s**, no `email` claim; the password grant is refused (`unauthorized_client`); the register page shows email, first name and last name; SMTP `mailpit:1025`; 0 identity providers; locales vi and en.
- The reset flow in the section above was run end to end (database dropped, script, `up`, realm re-imported).
- Not exercised: a real email through Mailpit (no flow sends one until A28), and production mode (INFRA-14).

## Notes for the next tickets

- **AUTH-15 (2026-10-15) added to the realm file:** `"loginTheme": "sportconnect"`. An existing dev realm keeps its old theme (the import is `IGNORE_EXISTING`): set Login theme to `sportconnect` in the admin console (Realm settings > Themes) or re-import with the procedure above. Without the JAR in `providers/`, Keycloak falls back to its stock theme.

- **A26 (2026-10-14) added to the realm file:** the `identity_provider` user-session-note mapper (present only for a brokered login), `locale` and `phone_number` attribute mappers on `sportconnect-web`, and an optional `phoneNumber` user-profile attribute (length only; A27 adds the phone rules). Re-import with the procedure above. The realm keeps Keycloak's default of **not** revoking a refresh token on use.

- `aud` also contains `account` (Keycloak's default role audience). A25 must require `sportconnect-api` in `aud`, not just any audience.
- Keycloak's built-in Vietnamese strings do not exist (A23); `vi` is enabled but the pages render English until the theme (AUTH-15) carries the translations.
- Unmanaged user attributes (a `phone` attribute) are not enabled yet; A27 adds the phone attribute and its rules.

## Delta (A28, 2026-10-16)

The Compose Keycloak also mounts `infra/keycloak/themes` read-only at `/opt/keycloak/themes` (the email theme `sportconnect`, en and vi; a plain theme directory, no build step). After changing a template or message there, recreate the container (`docker compose -f infra/docker-compose.dev.yml up -d keycloak`); the realm picks the theme through `emailTheme` (`infra/scripts/apply-realm-email-theme.sh` on a running realm). A second script adds the Swagger UI client (`apply-realm-swagger-client.sh`). Mailpit now also receives the backend's welcome email (dev profile).
