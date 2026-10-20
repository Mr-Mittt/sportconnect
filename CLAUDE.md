# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is SportConnect

SportConnect is a social sports community platform — think Instagram + Meetup + booking marketplace, but for sports. Users can share game moments, find playing partners by skill/location, join or create sport groups, and (in future phases) discover and book facilities and equipment.

**User types:** Normal User · Group Owner · Vendor (facility/equipment) · Admin

**Current state:** Social core is implemented (auth, user profiles, sports, social feed, groups). Facility booking, partner matching, payments, and mobile app are planned next phases. See `PROGRESS.md` for the full roadmap.

**Tech stack:** Java 21 / Spring Boot 3.2.0 backend · React 18 frontend · Go chat service · PostgreSQL + PostGIS · Redis · Liquibase · Spock (Groovy) tests

## Current App Version

**Current app version:** `MVP`

This is the fallback version for any slash command that takes a `<version>` argument (`/workon`,
`/ticket`, `/list`) — `/workon client` resolves to `client/docs/BACKLOG_MVP.md` without the version
being typed. It is a declared value, not a derived one: when the app moves on, change it here and
every command follows.

Commands must not treat it as an unconditional default — the full resolution ladder (and why an
explicit argument, a per-scope single backlog, and asking all still matter) is in
`documentation/md/BACKLOG_STRUCTURE_CONVENTION.md` § **Version resolution**.

## Documentation Convention

Every new architecture discussion, design decision, implementation summary, or plan must be:
1. Written as a separate MD file named by topic (e.g. `PARTNER_FINDING_DESIGN.md`)
2. Summarized into the relevant section of `PROGRESS.md`

**Where to put the MD file — hybrid rule:**

| File belongs in | When |
|---|---|
| `documentation/md/` | Cross-cutting concerns: architecture decisions, product vision, phase roadmaps, DB strategy, payment/booking plans, competitive analysis, testing guides |
| `modules/<domain>/docs/` | Module-specific: implementation details, design decisions, test summaries, fix write-ups scoped to one module (e.g. `modules/auth/docs/`, `modules/social/docs/`) |

**Notification use cases:** there is no notification feature (push or in-app) built yet. Any "should
this event notify someone?" question that comes up anywhere — a ticket, a `/vision` session, a
`/feature` scoping pass, a bug write-up — and isn't resolved on the spot must also be logged in
`documentation/md/NOTIFICATION_USE_CASES.md`, not just left as an unresolved bullet in that one
doc. This keeps every candidate trigger in one place so the notification feature, once it's
eventually scoped, starts from a real list instead of a blank page.

## Git Workflow

Work happens on a branch and lands via a pull request. **Direct push to `master` is denied by
policy** — never attempt it. The user opens and merges PRs themselves (`gh` CLI is not installed);
your job ends at pushing the branch and handing over the PR link.

1. **Branch first.** On `master`, create `feature/<ticket-id>-<slug>` (code) or `docs/<slug>`
   (doc-only). If already on some other branch, **stop and ask** which branch to use — do not
   assume the current one is right and do not silently branch off it. (`/workon` Phase 0 states
   this same rule for its own flow; keep the two in sync.)
2. **Commit and push only when asked.** Finishing the work is not permission to commit it.
3. **Stage deliberately.** Add the files this task touched by name — never `git add -A`. This repo
   normally carries unrelated untracked files (session logs, scratch notes) that must not ride
   along.

### When the user says a ticket/PR is merged

Treat "merged" as the trigger for this cleanup, and run it without being asked again:

1. **`git fetch origin --prune`** — updates `origin/master` and drops the remote-tracking ref for
   the branch GitHub deleted on merge.
2. **Verify the merge actually landed before deleting anything**:
   `git branch -r --contains <commit-sha>` must list `origin/master`. Do not skip this because the
   user said it was merged — they may have merged a different PR, or the merge may have failed.
   If it is not there, say so and stop; do not delete the branch.
3. **`git checkout master` + `git merge --ff-only origin/master`.** Fast-forward only — if it
   refuses, local `master` has commits of its own and that is a real situation to report, not to
   force past.
4. **`git branch -d <branch>`** — lowercase `-d`, never `-D`. `-d` refuses to delete a branch that
   is not fully merged, which is exactly the safety check wanted here; `-D` throws that check away.
5. **Leave unrelated branches alone.** Delete only the branch that was just merged. Other local
   branches are not yours to clean up unless the user asks.
6. **Report** the new `master` SHA, that the branch was deleted, and confirm the working tree is
   otherwise untouched.

## Commands

### Dev environment (Postgres+PostGIS, Redis)
```bash
# Start local dev dependencies (one-time or after a reboot)
docker compose -f infra/docker-compose.dev.yml up -d

# Stop them (data persists in named volumes)
docker compose -f infra/docker-compose.dev.yml down
```
**Redis keys:** every key the repo reads or writes (owner, TTL, cache or state, what an outage does) is listed in `documentation/md/REDIS_KEYS.md`. Add the row in the same change that adds a key.
**Ports:** every port the repo uses (dev, test harnesses, containers) is listed in `infra/documentation/PORTS.md`. Check it before a new service, container or dev server picks a port, and add the new row in the same change.

Deps-only — the server and client still run natively (`./gradlew :server:bootRun`, `pnpm dev`) for a fast edit-reload loop. Details: `infra/documentation/MVP/INFRA-2_DEV_DOCKER_COMPOSE.md`.

Keycloak (identity for the social-login work, :8081, admin/admin) and the Mailpit mail sink (UI :8025) are part of the same `up -d`, so the stack now also needs about 800 MB for Keycloak; start or stop just those two with `docker compose -f infra/docker-compose.dev.yml up -d keycloak mailpit` / `stop keycloak mailpit`. Mailpit catches both Keycloak's emails (reset and verification, themed en/vi by `infra/keycloak/themes/sportconnect/email`, mounted into the Compose Keycloak; recreate it with `up -d keycloak` after changing the theme) and the backend's welcome email (the dev profile points `spring.mail` at it).
On an existing Postgres volume run `infra/scripts/create-keycloak-db.sh` once first; realm reset and the rest: `infra/documentation/MVP/INFRA-13_KEYCLOAK_IN_COMPOSE_AND_REALM_AS_CODE.md`.
The login pages are the Keycloakify theme in `client/keycloak-theme/` (AUTH-15): `infra/scripts/build-keycloak-theme.sh` builds the JAR into `infra/keycloak/providers/` (needs JDK + Maven; restart Keycloak after), `infra/scripts/dev-keycloak-theme.sh` does the whole local loop (build, restart the Compose Keycloak, set the realm login theme), and `infra/scripts/run-keycloak-e2e.sh` runs the redirect e2e against a throwaway Keycloak with the theme. The phone rules (A27) are a second provider JAR, `infra/keycloak-extensions` (Gradle project `:infra:keycloak-extensions`): `infra/scripts/build-keycloak-extensions.sh` builds it into `infra/keycloak/providers/`, then restart Keycloak and run `infra/scripts/apply-realm-phone-rules.sh` once; the committed realm file names its providers, so a Keycloak that imports it needs this JAR loaded (the e2e script builds and mounts it). `infra/scripts/verify-phone-rules.mjs` is the live check. The normalized email (A35: one Gmail mailbox, one account, whatever the dots, `+tag` or `googlemail.com`) lives in the same JAR: run `infra/scripts/apply-realm-email-normalized.sh` once after the restart (it also backfills existing users), live check `infra/scripts/verify-email-normalized.mjs`. Google sign-in (A29) is a realm provider, not code: `infra/scripts/apply-realm-google-provider.sh` creates it from the Google OAuth client (env vars or the git-ignored `infra/keycloak/providers/client_secret_*.json`; setup in `modules/auth/docs/GOOGLE_OAUTH_CLIENT_SETUP.md`), live check `infra/scripts/verify-google-provider.mjs`. A Google sign-in that matches an existing account is proven on one page (password or emailed link) by the extensions JAR step `sc-link-existing-account`: run `infra/scripts/apply-realm-link-existing-account.sh` once after the JAR restart (after the A35 one). The Google picture (A36: the first Google sign-in may use it as the avatar) is a realm attribute plus two mappers: `infra/scripts/apply-realm-google-picture.sh` after the Google provider exists, live check `infra/scripts/verify-google-picture.mjs`. The backend confirms a current password and sets a new one through Keycloak (U24: the local `password_hash` is gone) with a backend-only confidential client: `infra/scripts/apply-realm-credentials-client.sh`, live check `infra/scripts/verify-credentials-client.mjs`; the realm file carries a dev secret that production must replace (INFRA-14). Email verification is an optional step, not a gate (A33): no `verifyEmail` setting, a new Google account starts verified through a provider mapper in the same JAR (run `infra/scripts/apply-realm-google-email-verified.sh` once after the A29 provider script), the flag is Keycloak's `emailVerified` (copied to `users.is_email_verified` at every sign-in and refresh), the backend asks for the mail (`POST /api/users/me/email-verification`), and the extensions JAR removes the password of an account that was never verified when an emailed link proves a Google sign-in to it; live checks `infra/scripts/verify-email-verification.mjs` and `verify-google-provider.mjs`.

**Realm changes (Keycloak).** Every change to the `sportconnect` realm is made through the Keycloak admin API during implementation (a script under `infra/scripts/`, never by hand in the console), and the same change is mirrored in `infra/keycloak/realm/sportconnect-realm.json` in the same change, so a re-deployed realm is always up to date. The realm import is `IGNORE_EXISTING`: the file only seeds a new realm (it holds settings and one service-account user, no people), so an existing realm needs the API call. Rebuilding users after a realm reset is A31 (auth V1). Example: the register page's country / region / location attributes and token mappers (A32) are defined once in `infra/scripts/registration-geo-attributes.mjs`, applied to a running realm by `infra/scripts/apply-registration-geo-attributes.sh` and to the realm file by `node infra/scripts/registration-geo-attributes.mjs file`; the password policy (`length(8)`, the old app's rule) works the same way through `infra/scripts/realm-password-policy.mjs` and `apply-realm-password-policy.sh`; so do the email theme and reset-link lifetime (`realm-email-theme.mjs`, A28) the Swagger UI client (`realm-swagger-client.mjs`, A28) and the phone rules (`realm-phone-rules.mjs`, A27: validators, the phone-login and registration flow copies, `registrationEmailAsUsername: false`; its `file` mode copies the flows from the running Keycloak because a flows list in an import replaces all built-in flows) and the normalized email (`realm-email-normalized.mjs`, A35: the `email_normalized` attribute, its validator and listener, the `sportconnect first broker login` flow; run its `file` mode after the phone one; the Google provider and the link-email lifetime, `realm-google-provider.mjs`, A29: the realm file keeps `google` disabled with placeholder credentials; the link step, `realm-link-existing-account.mjs`, A29: its `file` mode copies the flows from the running Keycloak, run it after the email-normalized one; the Google picture, `realm-google-picture.mjs`, A36; a new Google account starting email-verified, `realm-google-email-verified.mjs`, A33; the backend credentials client, `realm-credentials-client.mjs`, U24: its `file` mode also adds the service-account user).

### Backend (Gradle)
```bash
# Run the server
./gradlew :server:bootRun

# Build the backend (all modules + server; does not touch client — its build is separate, see client/README.md)
./gradlew build

# Run all tests
./gradlew test

# Run tests for a specific module
./gradlew :modules:auth:auth-impl:test
./gradlew :modules:user:user-impl:test
./gradlew :modules:social:group-impl:test

# Run a single test class
./gradlew :modules:auth:auth-impl:test --tests "com.sportconnect.auth.service.AuthServiceImplSpec"
```
First-time setup (Windows-focused, Docker/Testcontainers troubleshooting): `server/README.md`.

### Frontend (React — new SportHub client, Vite + pnpm)
```bash
cd client
pnpm install
pnpm dev          # Vite dev server on :5173, /api proxied to :8080
pnpm test         # Vitest unit/component tests
pnpm lint         # ESLint (incl. jsx-a11y)
pnpm build        # tsc -b + production build
pnpm storybook    # Storybook on :6006
pnpm e2e          # Playwright functional flows
```
Gradle equivalents: `./gradlew :client:buildClient`, `:client:testClient`, `:client:start`.
Full command + design-token reference: `client/README.md`. Conventions: `client/CLAUDE.md`.

## Architecture

### Philosophy: Monolith-first, microservice-ready

The current MVP is a monolith. All decisions prioritize simplicity for this monolith, but domain boundaries must stay clean enough to extract into microservices later. Every design discussion and implementation must honor these rules:

- **Cross-domain communication through `-api` interfaces only** — never import a concrete class from another domain's `-impl` module
- **Cross-domain references use IDs only** — no JPA `@ManyToOne` across domain boundaries (e.g. `Post` stores `userId: Long`, not `User user`)
- **No shared mutable state between domains**
- **Service interfaces as contracts** — injecting an interface means a future network transport (Feign, gRPC) is a drop-in swap

### Java code style

- **No wildcard imports** — every import must name the exact class (e.g. `import java.util.List;` not `import java.util.*;`). This applies to all Java files in every module.
- **Domain-scoped tables** — each domain owns its tables so they can be extracted to a separate schema/service later
- **No N+1 queries** — never call a repository/service method inside `.map()` over a `Page`/`List`, or inside a `for` loop, to resolve a per-item field. Collect all ids first and batch the lookup (e.g. a `getXByIds(List<UUID>)` returning a `Map<UUID, X>`), then resolve each item from the map. This applies across domain boundaries too — a batch method on a cross-domain `-api` interface is preferred over N calls to its single-item method.

This is a multi-module Gradle monorepo with a Spring Boot backend and React frontend.

**Java version:** 21. **Spring Boot:** 3.2.0.

### Module structure

Each domain is split into `-api` (interfaces and DTOs only) and `-impl` (entities, repositories, services, controllers):

```
modules/
  common/          # ApiResponse<T> wrapper, shared exceptions
  auth/
    auth-api/      # AuthService interface, request/response DTOs
    auth-impl/     # Keycloak resource server (JWKS verification, active gate), SecurityConfig, sign-in callback, refresh/logout, welcome email
  user/
    user-api/      # UserService interface, user DTOs
    user-impl/     # User entity (with PostGIS Point for location), UserController
  sport/
    sport-api/
    sport-impl/    # Sport entity, UserSportProfile entity
  social/
    post-api/
    post-impl/     # Post, Comment, PostLike, UserFollow entities
    group-api/
    group-impl/    # Group, GroupMember, GroupRole, GroupSettings entities
  reference/
    reference-api/   # ReferenceService interface, Language/Country/Region DTOs
    reference-impl/  # Language, Country, Region entities (public, read-only reference data; depends on common only)
  email/
    email-api/       # EmailSender interface + EmailMessage (plain text; the caller writes subject and body)
    email-impl/      # Async SMTP sender; knows nothing about languages or templates (depends on its own api only)
infra/keycloak-extensions/  # Keycloak provider JAR (A27): unique phone, email-or-phone, phone sign-in; Gradle project, not part of the Spring app
server/            # Main application entry point; depends on all *-impl modules
client/            # New SportHub client — Vite + React 18 + TS + Tailwind v4 + pnpm (scaffolded by HF-00; old CRA app removed 2026-07-06)
services/
  chat/            # Chat service (Go + Postgres) — the first service that is NOT a Java Gradle
                   # module or part of the React client; talks to the client directly (its own
                   # reverse-proxy path, not through Spring), and to the monolith only via
                   # independent JWT verification + an async, one-directional data sync. See
                   # services/chat/CLAUDE.md (conventions) and services/chat/docs/SYNC_DESIGN.md
                   # (the integration contract) before touching either side of that boundary.
```

The `server` module is the Spring Boot assembly point — it holds `SportConnectApplication.java`, `application.yml`, and all Liquibase migration scripts. It imports all `*-impl` modules; the `@SpringBootApplication` scan covers `com.sportconnect` globally.

### API conventions

All REST responses use `ApiResponse<T>` from `modules/common` (`common/src/main/java/com/sportconnect/common/dto/ApiResponse.java`). Use `ApiResponse.success(message, data)` or `ApiResponse.error(message)`.

Base API path is `/api`. Public endpoints (an explicit list in `SecurityConfig`, since A7 — nothing is public by path prefix any more): `POST /api/auth/{callback,reactivate,reactivate/cancel,refresh,logout}` (A26 added `callback`, `reactivate/cancel`, and made `logout` cookie-driven; A28 removed `register`, `login`, `verify-email`, `forgot-password`, `reset-password` and `oauth-token`, which are Keycloak's pages and emails now), `GET /api/reference/**`, and the one exact `POST /api/reference/resolve` (REF-2); plus infrastructure paths (`/images/**`, `/ws/**`, Swagger/`api-docs`, `/actuator/health`). A new endpoint under `/api/auth` or anywhere else is authenticated unless it is added to that list on purpose. All others require a Bearer JWT — including `/api/sports/**`, the hashtag reads, and every `GET /api/users/**` endpoint (U11 removed the earlier blanket permit-all for this path; lookups by id/email/username now return a PII-free `UserInfoResponse` rather than being closed off).

**User-facing errors are codes, not prose.** A new or changed error the client can show carries a stable `errorCode` (C12 contract, `documentation/md/ERROR_HANDLING_DESIGN.md`); the client owns the en/vi copy (`errors:codes`). Add that en/vi entry in the same change or file a client ticket straight away — never rely on the English `message` being rendered as-is. Same for a new value in a client-mirrored enum (I18N-5). See `client/CLAUDE.md` § i18n.

### API Change Discipline

**Whenever a change touches an existing contract, do a consumer census *before* writing the change
— and again if the change grows.** This is a hard rule, not a nicety: a monorepo change that alters
a shape other code already depends on is the single most common way to ship a silent break here
(A20 caught `SessionServiceImpl.discoverSessions` and `GroupServiceImpl.getGroupIdsBySportProfiles`
both relying on `getUserProfiles(UUID)` being active-only — a census found them; a `grep` for
compile errors would not have, since the signature was unchanged).

**What counts as "an existing contract" (any of these triggers the census):**

- a **REST endpoint** — path, HTTP method, query/path params, request body shape, response body
  shape, status codes, **or auth/visibility** (making one owner-only, adding `@PreAuthorize`, etc.);
- a **cross-module `-api` interface** — a method signature, its return/parameter types, its
  documented semantics (e.g. "active-only") even when the signature is untouched;
- a **shared DTO** — any field the client or another module reads or writes (rename, type change,
  removal, nullability change, a new value in a mirrored enum);
- a **DB column or migration** — a dropped/renamed column, a changed constraint or type, a new
  `NOT NULL`, anything a Liquibase changelog does to an existing table.

**How to run the census:**

1. `grep` every caller across **all backend modules** — for an `-api` method, its interface name
   and method name; for a REST endpoint, its path string; for a DTO field, the getter/field name.
2. Check the **client** (`client/src`, `client/e2e/mocks` MSW handlers, `*.test.tsx`) for the
   endpoint path and any mirrored type — the client hand-mirrors backend shapes and nothing links
   them.
3. For a **DB** change, also check entities, repositories, and JPQL/`@Query` strings that name the
   column.
4. List what you found, and for **each** consumer state one of: **compatible as-is** /
   **updated in this change** / **deferred with a filed follow-up ticket**. "Probably fine" is not
   one of the three.

**File any follow-up ticket the moment it comes out — before the next step, in any phase.** This
applies wherever a follow-up is identified, not just the census: a consumer marked "deferred", a
gap found while exploring, a scope cut, a "we should also…" raised mid-implementation. "Deferred
with a filed follow-up ticket" means the ticket **exists as a real, linkable backlog entry**
(thin-index row + `<VERSION>/` detail file, or inline section for a flat backlog) in the right
module's backlog — *including a different module than the one you're working in* (e.g. a `client/`
ticket filed from a backend `/workon`). Naming a follow-up in prose, in a summary doc, or "to be
filed by the user" does **not** count and must not be relied on by a later ticket. Concrete miss
this rule exists to prevent: backend A20 named two client follow-ups as "filed by the user, not in
this PR"; they were never filed; A21 and A22 were then both written citing "A20 already filed 2
client tickets" without re-checking `client/docs/BACKLOG_MVP.md` — the gap survived two more
tickets until A22's pickup census caught it and filed client `SPORT-10`/`SPORT-11`.

A `PostToolUse` hook (`.claude/settings.json`) prints a reminder when a controller, `-api` file,
entity/repository, changelog, or `.sql` file is edited — the reminder is a prompt to do the census,
not a substitute for it. `/workon` Phase 2 folds the census into its exploration step.

### Auth flow

Keycloak issues the tokens (A25, A26): the client signs in at Keycloak (Authorization Code + PKCE), posts `{code, codeVerifier}` to `POST /api/auth/callback`, and the backend finishes the exchange, provisions the `users` row on first sight (`users.id` = the token `sub`) and sets the cookie; `refresh` and `logout` proxy Keycloak. Access tokens are Keycloak's 5-minute RS256 tokens, verified against its JWKS. The client keeps the access token in memory only and the refresh token (Keycloak's) in an httpOnly cookie that the backend sets (`SameSite=Strict`, `Path=/api/auth`); the response body never carries it. The old client's localStorage token storage was an XSS exposure and must not be reintroduced. Registration, password sign-in, password reset and email verification are Keycloak's pages and emails (the login theme `client/keycloak-theme`, the email theme `infra/keycloak/themes/sportconnect/email`, en and vi); the backend only sends the one welcome email, at a user's first sign-in. There is no pre-Keycloak token code left (A28 removed the HS256 mint, `JWT_SECRET` and the `refresh_tokens`, `password_reset_tokens` and `email_verifications` tables). Swagger UI's Authorize signs in at Keycloak through the realm client `sportconnect-swagger`.

### Account lifecycle

**A deactivated user (`isActive = false`) must not be able to perform any further interaction with
the app.** This is a non-negotiable, cross-cutting constraint on the same footing as the
cross-domain rules above — every new feature that adds an authenticated endpoint, background job,
or cross-domain call triggered by a user must explicitly consider whether a deactivated caller can
still reach it. Do not assume this is enforced somewhere else in the request pipeline; today it
mostly isn't (see gaps below), so a new feature that relies on that assumption inherits the gap
instead of closing it.

**Known gaps as of 2026-08-10** (tracked in
`modules/user/user-impl/docs/BACKLOG_MVP.md`'s **U12**, `TODO`, not yet fixed):
- `UserServiceImpl.deleteUser()` (the only deactivation path — admin-only today) does not revoke
  the user's refresh tokens or access token.
- `JwtAuthenticationFilter` validates signature + expiry only — no per-request `isActive` recheck.
  An already-issued access token keeps authenticating a deactivated user until it naturally expires
  (`app.jwt.expiration`, currently 1 hour).
- Only `/api/auth/refresh` currently rejects a deactivated user (`AuthServiceImpl.refreshToken()`,
  `"Account is deactivated"`), and only reactively — checked when the token is next used, not
  proactively at deactivation time.

Until U12 closes these gaps, treat the access-token window as a known, accepted risk — but don't
compound it. Any new security-sensitive feature should check the caller's `isActive` status
explicitly (via `UserService`) in its own service method rather than assuming the JWT filter or
`SecurityConfig` already guarantees it.

**Update (A25, 2026-10-14):** the filter half of those gaps is closed. `JwtAuthenticationFilter` now verifies a
Keycloak token and checks `UserService.getAccessState(sub)` on every request, so a deactivated (or unprovisioned) user
is refused on every authenticated path from the next request on (cache evicted on deactivate/reactivate, 60 s TTL as
the bound). Access tokens last 5 minutes and logout no longer invalidates one by itself. The paragraphs above describe
the state before that change.

**Update (A26, 2026-10-14):** the sign-in side is closed too. A deactivated user who signs in with a **password** gets `ACCOUNT_DEACTIVATED` and a one-time ticket instead of a session (confirmed through `POST /api/auth/reactivate`); one who signs in through a social provider is re-activated automatically; a refresh for a deactivated user is refused and ends the Keycloak session. See `modules/auth/docs/MVP/A26_CALLBACK_PROVISIONING_REFRESH_AND_REACTIVATION_TICKET.md`.

**Update (A28, 2026-10-16):** deactivation makes no auth call any more (the legacy refresh-token store is gone; the gate and a refresh do the work). The STOMP `CONNECT` in notification runs the same gate as REST, so a deactivated or unprovisioned user cannot open a socket (an already-open one stays until it reconnects: NTF-6). The chat service keeps its accepted 5-minute window (CHAT-17, A20).

### Resource access: availability vs. visibility

Any domain with per-item read/write rules on a resource (a `Post`, a `Session`, a `SessionComment`)
must answer two **separate** questions before a caller touches it, in this order:

1. **Is it available?** — existence/lifecycle: not soft-deleted, and its parent chain (if any) is
   also still available (e.g. a group-scoped `Post` also requires its `Group` to still be active).
   Unavailable → `NotFoundException`.
2. **Is it visible to *this* caller?** — authorization, evaluated only once (1) is true (e.g. group
   membership for a `GROUP_POST`, participant status for a session comment thread). Not visible →
   `ForbiddenException`.

These are genuinely independent — conflating them is exactly what let a real bug hide (see
`documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` §5.1: `GroupServiceImpl.isGroupMember()`
implicitly assumed "...and the group still exists," which silently broke once groups became
soft-deletable). Every new resource with this shape implements
`com.sportconnect.common.access.ResourceGate<T>` (two boolean methods + a `require()` default that
throws the right exception) — service-impl layer, gating single-item paths *after* fetching the
entity, list endpoints gating the known scope *before* querying (unchanged from existing precedent
like `getGroupPosts`'s membership check). This is a shared **shape** in `common`, never shared
**logic** — each domain's `isAvailable`/`isVisibleTo` implementation is its own, using its own
`-api` cross-domain calls, same as every other cross-domain interaction in this codebase. See the
ADR for the full design discussion, rejected alternatives (including why a session's discussion
thread is a domain-scoped `SessionComment`, never a reused `Post`), and open items.

### Database

PostgreSQL with Liquibase migrations. Migration scripts live in `server/src/main/resources/db/changelog/changes/` and are registered in `db.changelog-master.xml`. Dev database name: `sportconnect_dev` (configured in `application-dev.yml`).

The `User` entity uses PostGIS geography (`geography(Point, 4326)`) for the `location` field, mapped via Hibernate Spatial and JTS `Point`. Always use `GeometryFactory(new PrecisionModel(), 4326)` to create points.

### Testing

Tests are written with the **Spock Framework** (Groovy), not JUnit. Test files live in `src/test/groovy/` within each module. Use `Mock()` for dependencies and `@Subject` on the class under test. Run tests via `useJUnitPlatform()` (Spock runs on the JUnit platform).

**Integration tests for authorization boundaries.** Any endpoint that enforces authorization or
visibility — a new access-control check, or a change to an existing one (e.g. a new
`ResourceGate<T>` implementation, an ownership/membership check, a role gate) — needs coverage in
`server/src/test/java/com/sportconnect/integration/` (real `MockMvc` request through real Spring
wiring and a real DB round-trip), not just a Spock unit test with the check's own collaborators
mocked out. A unit test proves a service *calls* the check correctly; only an IT test proves the
check actually rejects/accepts through the real request pipeline — real cross-domain service
wiring, and real exception-to-HTTP-status mapping (`GlobalExceptionHandler`). This is deliberately
scoped to the boundary, not the whole API surface: a routine CRUD/read endpoint with no
access-control logic of its own doesn't need one. The `:server:test` H2 schema
(`server/src/test/resources/schema.sql`) is a hand-maintained mirror of the real Postgres
migrations, built up lazily — a table/column only gets added the first time some test needs it —
so a new IT test may need to add missing schema there first; that's expected, not a sign something
is wrong.

**Integration tests beyond authorization — the same "mocks can't prove this" test applies more
broadly.** A green Spock suite (every collaborator mocked) is not sufficient evidence a feature
actually works whenever the feature depends on real Spring/transaction/database behavior a mock
can't reproduce. Concretely, plan for real IT coverage (same `server/src/test/java/com/sportconnect/
integration/` shape as above) whenever a change involves any of: a **new cross-domain bean
dependency**, especially a bidirectional one needing `@Lazy` (a misconfigured cycle only breaks at
real `ApplicationContext` startup, never in a test that hand-constructs both services with mocks); a
**new or changed entity write path** (a new required/`NOT NULL` column, a new constraint — a mocked
`repository.save()` can't reject anything a real schema would); or a **transaction-boundary/
propagation design meant to isolate a failure** (whether a caught exception actually protects the
caller's own transaction is a real `PlatformTransactionManager` question, not a mocked one). Found
2026-09-21 during SESSION-38 (`modules/session/docs/MVP/SESSION-38_EVENT_DRIVEN_GROUP_SESSION_GENERATION.md`):
every Spock spec for the new event-driven generation triggers stayed green throughout, yet the
feature had two real, live bugs a mocked test structurally cannot catch — auto-generated sessions
never created their required companion `SESSION_POST` (a NOT NULL violation silently masked as a
benign race by an overly-broad catch block, failing since V051/SESSION-10 shipped), and a caught
exception inside a Spring *participating* transaction still marked it rollback-only, so the original
try/catch-only failure-isolation design never actually isolated anything. A new IT test
(`GroupSessionGenerationIntegrationTest`) was also the only way to prove that ticket's new `@Lazy`
bidirectional dependency didn't break real context startup. Treat this as the working bar for any
new feature's test plan, not just something to add reactively once a bug is suspected.

**If a local `./gradlew :server:test` run seems to hang or take an unreasonably long time (tens of
minutes with zero output), try `./gradlew --stop` first, then re-run — do not immediately assume
the suite itself is slow and abandon it in favor of `server-ci`.** Investigated 2026-09-14
(`documentation/md/IT_OVERVIEW.md` has the full write-up): neither individual containers, nor
several IT classes run together, nor eventually the full 19-class suite showed any real slowness
once stale local Gradle-daemon/locked-file state was cleared — the full suite completed in `1m 41s`
once clean, comparable to CI. A genuine multi-40-minute local stall (first documented in
`documentation/sessions/103_log.md`) is most likely leftover daemon/process/file-lock state on the
machine, not a real performance problem with the suite, Testcontainers, or Windows itself.

### Frontend

The old CRA client (AuthContext/GroupContext, localStorage tokens) was removed on 2026-07-06 for a from-scratch rebuild. The new client's stack (Vite, React 18 + TS strict, Tailwind, shadcn/ui, Zustand + TanStack Query, Vitest, Storybook, Playwright + MSW) and all conventions are defined in `client/CLAUDE.md`; the build order is `client/docs/BACKLOG_MVP.md`.
