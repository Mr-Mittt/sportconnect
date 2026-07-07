# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is SportConnect

SportConnect is a social sports community platform — think Instagram + Meetup + booking marketplace, but for sports. Users can share game moments, find playing partners by skill/location, join or create sport groups, and (in future phases) discover and book facilities and equipment.

**User types:** Normal User · Group Owner · Vendor (facility/equipment) · Admin

**Current state:** Social core is implemented (auth, user profiles, sports, social feed, groups). Facility booking, partner matching, payments, and mobile app are planned next phases. See `PROGRESS.md` for the full roadmap.

**Tech stack:** Java 21 / Spring Boot 3.2.0 backend · React 18 frontend · PostgreSQL + PostGIS · Redis · Liquibase · Spock (Groovy) tests

## Documentation Convention

Every new architecture discussion, design decision, implementation summary, or plan must be:
1. Written as a separate MD file named by topic (e.g. `PARTNER_FINDING_DESIGN.md`)
2. Summarized into the relevant section of `PROGRESS.md`

**Where to put the MD file — hybrid rule:**

| File belongs in | When |
|---|---|
| `documentation/md/` | Cross-cutting concerns: architecture decisions, product vision, phase roadmaps, DB strategy, payment/booking plans, competitive analysis, testing guides |
| `modules/<domain>/docs/` | Module-specific: implementation details, design decisions, test summaries, fix write-ups scoped to one module (e.g. `modules/auth/docs/`, `modules/social/docs/`) |

## Commands

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
```

The `server` module is the Spring Boot assembly point — it holds `SportConnectApplication.java`, `application.yml`, and all Liquibase migration scripts. It imports all `*-impl` modules; the `@SpringBootApplication` scan covers `com.sportconnect` globally.

### API conventions

All REST responses use `ApiResponse<T>` from `modules/common` (`common/src/main/java/com/sportconnect/common/dto/ApiResponse.java`). Use `ApiResponse.success(message, data)` or `ApiResponse.error(message)`.

Base API path is `/api`. Public endpoints: `/api/auth/**`, `/api/sports/**`, `GET /api/users/**`. All others require a Bearer JWT.

### Auth flow

Stateless JWT (JJWT 0.12.x). Access token + refresh token pair. The new client keeps the access token in memory only and expects the refresh token in an httpOnly cookie — the cookie contract is backend ticket A2 in `modules/auth/docs/BACKLOG_MVP.md` (until it ships, the API still returns `refreshToken` in the response body). The old client's localStorage token storage was an XSS exposure and must not be reintroduced.

### Database

PostgreSQL with Liquibase migrations. Migration scripts live in `server/src/main/resources/db/changelog/changes/` and are registered in `db.changelog-master.xml`. Dev database name: `sportconnect_dev` (configured in `application-dev.yml`).

The `User` entity uses PostGIS geography (`geography(Point, 4326)`) for the `location` field, mapped via Hibernate Spatial and JTS `Point`. Always use `GeometryFactory(new PrecisionModel(), 4326)` to create points.

### Testing

Tests are written with the **Spock Framework** (Groovy), not JUnit. Test files live in `src/test/groovy/` within each module. Use `Mock()` for dependencies and `@Subject` on the class under test. Run tests via `useJUnitPlatform()` (Spock runs on the JUnit platform).

### Frontend

The old CRA client (AuthContext/GroupContext, localStorage tokens) was removed on 2026-07-06 for a from-scratch rebuild. The new client's stack (Vite, React 18 + TS strict, Tailwind, shadcn/ui, Zustand + TanStack Query, Vitest, Storybook, Playwright + MSW) and all conventions are defined in `client/CLAUDE.md`; the build order is `client/docs/BACKLOG_MVP.md`.
