# SportConnect server

The Spring Boot backend (Gradle multi-module monorepo assembly point). Conventions live in the
root [`CLAUDE.md`](../CLAUDE.md) (source of truth for architecture rules, module layout, and code
style) — this file is just the practical "how do I get this running" guide, focused on Windows.

**Stack:** Java 21 · Spring Boot 3.2.0 · PostgreSQL + PostGIS · Redis · Liquibase · Spock (Groovy)
tests · Gradle (wrapper-managed, no separate install needed)

## Prerequisites

- **JDK 21** — [Eclipse Temurin](https://adoptium.net/) recommended (same distribution `server-ci.yml`
  uses in CI, so local and CI behavior match). Confirm with `java -version`.
- **Docker** — [Docker Desktop](https://www.docker.com/products/docker-desktop/) or
  [Rancher Desktop](https://rancherdesktop.io/). If using Rancher Desktop, select **moby (dockerd)**
  as the container engine (not containerd) — Testcontainers (used by the test suite) needs the
  Docker API specifically. See [Troubleshooting](#troubleshooting) if Docker isn't detected.
- Gradle itself: **not required** — `gradlew.bat` downloads the pinned version (8.5) automatically
  on first run.

## First-time setup

1. Clone the repo and open a terminal at the repo root (PowerShell, CMD, or Git Bash all work —
   examples below show PowerShell; swap `.\gradlew.bat` for `./gradlew.bat` in Git Bash).
2. Start local dev dependencies (Postgres+PostGIS, Redis) — see
   [`infra/documentation/MVP/INFRA-2_DEV_DOCKER_COMPOSE.md`](../infra/documentation/MVP/INFRA-2_DEV_DOCKER_COMPOSE.md)
   for what this actually spins up:
   ```powershell
   docker compose -f infra/docker-compose.dev.yml up -d
   ```
3. Run the server:
   ```powershell
   .\gradlew.bat :server:bootRun
   ```
   First run downloads Gradle + all dependencies — expect it to take a minute or two. On startup,
   Liquibase applies all migrations automatically (nothing to run by hand). Look for
   `Started SportConnectApplication` in the console — that means it's up.
4. Verify it's actually serving requests:
   - `http://localhost:8080/api/sports` — should return an `ApiResponse` JSON body (`200`)
   - `http://localhost:8080/swagger-ui.html` — interactive API docs (all endpoints, request/response
     shapes)
   - `http://localhost:8080/actuator/health` — should report `{"status":"UP"}`

No `.env` file or manual config needed — the `dev` Spring profile (`application-dev.yml`) is active
by default and already points at the exact Postgres/Redis credentials the docker-compose file sets
up (db `sportconnect_dev`, user `postgres`, password `sa`, no Redis password).

## Day-to-day commands

| Command | What it does |
|---|---|
| `.\gradlew.bat :server:bootRun` | Run the server (port `8080`) |
| `.\gradlew.bat build` | Compile + run every backend module's tests + package (backend-only — never touches `client/`) |
| `.\gradlew.bat test` | Run every backend module's tests without packaging |
| `.\gradlew.bat :modules:auth:auth-impl:test` | Run one module's tests only (swap the path for any other module) |
| `.\gradlew.bat :server:test --tests "*PostControllerIntegrationTest*"` | Run one test class |
| `docker compose -f infra/docker-compose.dev.yml up -d` | Start Postgres+PostGIS/Redis |
| `docker compose -f infra/docker-compose.dev.yml down` | Stop them (data persists in named volumes — `down -v` wipes it) |

Full module list and architecture rules: root [`CLAUDE.md`](../CLAUDE.md). Per-module specifics
(key classes, endpoints, gotchas) live in each module's own `CLAUDE.md`, e.g.
[`modules/social/post-impl/CLAUDE.md`](../modules/social/post-impl/CLAUDE.md).

## Running tests

`.\gradlew.bat test` runs every module's Spock suite, including the integration tests under
`server/src/test/java/com/sportconnect/integration/` (`BaseIT` subclasses). Those integration
tests use H2 for the database (no need for the docker-compose Postgres to be running just to test)
but do need a real Redis — `BaseIT` spins up its own throwaway one automatically via
**Testcontainers**, using whatever Docker daemon it can find. This needs Docker running (Desktop or
Rancher Desktop), but *not* the docker-compose stack from setup — Testcontainers manages its own
container independently and tears it down when the JVM exits.

If Testcontainers can't find Docker, see [Troubleshooting](#troubleshooting) below.

## Troubleshooting

**`Could not find a valid Docker environment` when running tests, but `docker ps` works fine in your
terminal.** Known issue with Rancher Desktop on Windows — Testcontainers doesn't always
auto-detect the named pipe. Fix: set `DOCKER_HOST` explicitly before running tests.
```powershell
# PowerShell
$env:DOCKER_HOST = "npipe:////./pipe/docker_engine"
.\gradlew.bat test
```
```bash
# Git Bash
export DOCKER_HOST="npipe:////./pipe/docker_engine"
./gradlew.bat test
```
Not needed with Docker Desktop, and not needed in CI (`server-ci.yml` runs on Linux runners, which
don't have this quirk).

**`Web server failed to start. Port 8080 was already in use.`** Something's already listening —
often a previous `bootRun` that didn't shut down cleanly. Find and stop it:
```powershell
netstat -ano | findstr :8080
Stop-Process -Id <PID from the output above> -Force
```

**App fails to connect to Postgres/Redis on startup (`Connection refused`).** The docker-compose
dev stack isn't running — `docker compose -f infra/docker-compose.dev.yml up -d`, then confirm
both containers are `Up`: `docker compose -f infra/docker-compose.dev.yml ps`.

**Port `5432` or `6379` already in use by something else.** Usually a native Postgres/Redis install
or an old manually-created container running locally. Check with
`docker ps -a` (for a stray container) or stop whatever local service owns that port, or change the
published port on the left side of the `ports:` mapping in `infra/docker-compose.dev.yml` (and
update `application-dev.yml` to match if you do).
