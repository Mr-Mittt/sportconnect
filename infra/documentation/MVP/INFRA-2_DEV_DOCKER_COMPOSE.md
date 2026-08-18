# INFRA-2 · Dev environment docker-compose

**Status:** `DONE`
**Type:** Infrastructure (dev env)
**Date:** 2026-07-08

## Design

Today, local dev's PostgreSQL+PostGIS and Redis setup is manual. Spec: `INFRASTRUCTURE_LAYOUT_AND_CICD.md`
§1 + §4-2, ticket `infra/documentation/BACKLOG_MVP.md` INFRA-2.

**Scope decision (discussed with user):** deps-only, not server/client containers too. Weighed
both:
- Deps-only — fast native edit-reload loop (`./gradlew :server:bootRun`, `pnpm dev`), nothing new
  to build (`server/Dockerfile`/`client/Dockerfile` don't exist yet), matches the ticket's own
  recommendation.
- Server+client as compose profiles — a true one-command full-stack-up, but would require writing
  two production-shaped Dockerfiles from scratch (out of this ticket's scope), slower iteration
  (rebuild-on-change instead of hot reload), and risks pulling INFRA-3 (deployment, explicitly
  blocked on an undecided hosting choice) forward before that decision is made.

Went with deps-only.

Config values were read directly from `server/src/main/resources/application-dev.yml`, not
guessed: Postgres `sportconnect_dev` / `postgres` / `sa` on `5432`; Redis no password on `6379`.
Confirmed via `server/src/main/resources/db/changelog/changes/V001__create_users_and_roles.sql`
that Liquibase's own `CREATE EXTENSION IF NOT EXISTS "postgis"` handles extension setup on first
migration run — no custom init SQL needed in the compose file, just the `postgis/postgis` image.

## What was built

`infra/docker-compose.dev.yml` — two services, named project (`sportconnect-dev`, avoiding the
default project-name-from-directory ambiguity), named volumes for persistence across restarts:

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment: {POSTGRES_DB: sportconnect_dev, POSTGRES_USER: postgres, POSTGRES_PASSWORD: sa}
    ports: ["5432:5432"]
    volumes: [sportconnect_dev_postgres:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [sportconnect_dev_redis:/data]
```

`redis:7-alpine` matches the image already used by `BaseIT`'s Testcontainers-managed Redis (A8) —
one fewer image to pull/cache differently across the repo's Docker-touching surfaces.

Documented usage in root `CLAUDE.md`'s new "Dev environment" command section (no root `README.md`
exists yet to reference instead, per the ticket's fallback).

## Verification

Everything below ran locally against the real containers, not just `docker compose config`:

1. `docker compose -f infra/docker-compose.dev.yml config` — resolves cleanly.
2. `docker compose -f infra/docker-compose.dev.yml up -d` — both containers start.
3. `docker exec ... psql -c "SELECT extname FROM pg_extension;"` — confirms `postgis`,
   `postgis_topology`, `fuzzystrmatch`, `postgis_tiger_geocoder` all present.
4. `docker exec ... redis-cli ping` — `PONG`.
5. **Full end-to-end app boot**: `./gradlew :server:bootRun` against this exact compose stack —
   Liquibase ran all 24 changesets successfully (63 rows affected) including the PostGIS-dependent
   ones, Hibernate initialized with `hibernate-spatial`/PostGIS dialect support, app reported
   `Started SportConnectApplication`, and `GET /api/sports` returned `200`. This is stronger
   verification than the ticket strictly required (it only asked for `docker compose up`), but
   confirms the compose file's values genuinely match what the app expects, not just that the
   containers start.

No GitHub-only conditional here — unlike INFRA-1, this ticket has no CI/required-check surface;
"done" is fully verifiable locally, and was.

## Notes

- A pre-existing, unrelated stopped container (`postgis_container`, port `5432`, from someone's
  prior manual setup — exactly the "today it's manual" gap this ticket closes) was found via
  `docker ps -a` before starting; it wasn't running, so no port conflict, and it wasn't touched.
- Hit one unrelated snag during verification: an earlier malformed background-process invocation
  left an orphaned `java.exe` holding port 8080, which made the *second* `bootRun` attempt fail
  with "Port 8080 was already in use." Not a compose-file issue — the first (orphaned) attempt had
  actually already proven full connectivity via its own successful Liquibase run before being
  detected. Killed the orphaned process, retried cleanly, got a normal `Started
  SportConnectApplication` + `200` response.

---

**Status:** `DONE` — see `infra/documentation/MVP/INFRA-2_DEV_DOCKER_COMPOSE.md` · **Type:** Infrastructure (dev env) · **Dependency:** none ·
**Spec:** `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1 + §4-2

One-command local dev dependencies — today the PostgreSQL+PostGIS/Redis setup is manual.
Deliver `infra/docker-compose.dev.yml`:

- Services: `postgis/postgis` (database `sportconnect_dev` — verify name/port/credentials
  against `server/src/main/resources/application-dev.yml`, don't guess) and `redis`
- Volumes for DB persistence across restarts
- Optional (decide in Phase 1): profiles for running server/client in containers too, vs
  deps-only (recommendation: deps-only — devs run the apps natively via gradlew/pnpm)
- Documented usage (`docker compose -f infra/docker-compose.dev.yml up -d`) in the infra docs
  and referenced from the root README/CLAUDE.md dev setup section
