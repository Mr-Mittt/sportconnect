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

## Commands

### Dev environment (Postgres+PostGIS, Redis)
```bash
# Start local dev dependencies (one-time or after a reboot)
docker compose -f infra/docker-compose.dev.yml up -d

# Stop them (data persists in named volumes)
docker compose -f infra/docker-compose.dev.yml down
```
Deps-only — the server and client still run natively (`./gradlew :server:bootRun`, `pnpm dev`) for a fast edit-reload loop. Details: `infra/documentation/MVP/INFRA-2_DEV_DOCKER_COMPOSE.md`.

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
    auth-impl/     # JWT logic, SecurityConfig, email verification, password reset
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

Base API path is `/api`. Public endpoints: `/api/auth/**`, `/api/sports/**`, `GET /api/users/**`. All others require a Bearer JWT.

### Auth flow

Stateless JWT (JJWT 0.12.x). Access token + refresh token pair. The new client keeps the access token in memory only and expects the refresh token in an httpOnly cookie — the cookie contract is backend ticket A2 in `modules/auth/docs/BACKLOG_MVP.md` (until it ships, the API still returns `refreshToken` in the response body). The old client's localStorage token storage was an XSS exposure and must not be reintroduced.

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

### Frontend

The old CRA client (AuthContext/GroupContext, localStorage tokens) was removed on 2026-07-06 for a from-scratch rebuild. The new client's stack (Vite, React 18 + TS strict, Tailwind, shadcn/ui, Zustand + TanStack Query, Vitest, Storybook, Playwright + MSW) and all conventions are defined in `client/CLAUDE.md`; the build order is `client/docs/BACKLOG_MVP.md`.
