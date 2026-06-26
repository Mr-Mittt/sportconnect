# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is SportConnect

SportConnect is a social sports community platform — think Instagram + Meetup + booking marketplace, but for sports. Users can share game moments, find playing partners by skill/location, join or create sport groups, and (in future phases) discover and book facilities and equipment.

**User types:** Normal User · Group Owner · Vendor (facility/equipment) · Admin

**Current state:** Social core is implemented (auth, user profiles, sports, social feed, groups). Facility booking, partner matching, payments, and mobile app are planned next phases. See `PROGRESS.md` for the full roadmap.

**Tech stack:** Java 21 / Spring Boot 3.2.0 backend · React 18 frontend · PostgreSQL + PostGIS · Redis · Liquibase · Spock (Groovy) tests

## Documentation Convention

Every new architecture discussion, design decision, implementation summary, or plan must be:
1. Written as a separate MD file in `documentation/md/` named by topic (e.g. `PARTNER_FINDING_DESIGN.md`)
2. Summarized into the relevant section of `PROGRESS.md`

## Commands

### Backend (Gradle)
```bash
# Run the server
./gradlew :server:bootRun

# Build everything
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

### Frontend (React)
```bash
cd client
npm start       # dev server on :3000, proxied to :8080
npm test
npm run build
```

## Architecture

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
client/            # React 18 CRA app (Tailwind CSS)
```

The `server` module is the Spring Boot assembly point — it holds `SportConnectApplication.java`, `application.yml`, and all Liquibase migration scripts. It imports all `*-impl` modules; the `@SpringBootApplication` scan covers `com.sportconnect` globally.

### API conventions

All REST responses use `ApiResponse<T>` from `modules/common` (`common/src/main/java/com/sportconnect/common/dto/ApiResponse.java`). Use `ApiResponse.success(message, data)` or `ApiResponse.error(message)`.

Base API path is `/api`. Public endpoints: `/api/auth/**`, `/api/sports/**`, `GET /api/users/**`. All others require a Bearer JWT.

### Auth flow

Stateless JWT (JJWT 0.12.x). Access token + refresh token pair. Tokens are stored in localStorage on the client (`accessToken`, `refreshToken`). `client/src/utils/api.js` handles automatic token refresh on 401. Redis is used to store refresh tokens and invalidate them on logout.

### Database

PostgreSQL with Liquibase migrations. Migration scripts live in `server/src/main/resources/db/changelog/changes/` and are registered in `db.changelog-master.xml`. Dev database name: `sportconnect_dev` (configured in `application-dev.yml`).

The `User` entity uses PostGIS geography (`geography(Point, 4326)`) for the `location` field, mapped via Hibernate Spatial and JTS `Point`. Always use `GeometryFactory(new PrecisionModel(), 4326)` to create points.

### Testing

Tests are written with the **Spock Framework** (Groovy), not JUnit. Test files live in `src/test/groovy/` within each module. Use `Mock()` for dependencies and `@Subject` on the class under test. Run tests via `useJUnitPlatform()` (Spock runs on the JUnit platform).

### Frontend

React 18 with React Router v6. `AuthContext` manages auth state. `GroupContext` manages group state. `client/src/utils/api.js` is the central axios instance — always import it instead of using axios directly. The `proxy` in `package.json` forwards all `/api` calls to `http://localhost:8080`.
