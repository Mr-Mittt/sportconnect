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

**The same error, but *intermittent* — most runs pass, then one run fails ~54 tests at once.**
Different problem from the one above, despite the identical message. Symptoms: a full
`:server:test` run fails across `PostAccessGateIntegrationTest`,
`SessionPostAccessGateIntegrationTest`, `InternalServiceFilterScopeIT` and others that have nothing
to do with whatever you changed, and nearly all of them report
`NoClassDefFoundError: Could not initialize class SharedRedisContainer` (or a RabbitMQ equivalent)
rather than anything about Docker. `Could not find a valid Docker environment` appears exactly
once, in whichever test loaded the container class first.

That cascade is a red herring worth understanding before you debug it: the container holders start
their container from a `static` initializer, and when that throws, the JVM marks the class
permanently erroneous — every later reference fails with `NoClassDefFoundError` and the real cause
is nowhere near the failures you're reading. **Always scroll to the *first* failure in the run.**

Things that look like fixes and are not:

- **Retrying the container start.** Testcontainers latches the failure in a static
  `FAIL_FAST_ALWAYS` flag; every later attempt returns instantly with `Previous attempts to find a
  Docker environment failed. Will not retry.` Verified — a retrying wrapper burned its full backoff
  and failed anyway.
- **Unpinning `docker.client.strategy`** or **raising `client.ping.timeout`** in
  `~/.testcontainers.properties`. Both were tried; the suite still failed with both in place.
- **Checking whether Docker is healthy.** It looks fine *while broken* — `docker version` answered
  15/15 times at a steady ~190ms during the period the suite was failing. "But `docker ps` works"
  proves nothing here.

**What actually fixed it: restarting Rancher Desktop.** The daemon had been up 12+ days. Before the
restart the suite failed roughly 1 run in 3; after it, 6 consecutive clean runs. The working theory
is the daemon degrading under uptime, showing up only under full-suite load (three Testcontainers
plus several Spring contexts booting at once) — every Docker API call crosses a Windows named pipe
into a WSL VM, ~190ms even when idle.

So: if the failure is intermittent and hits container-backed ITs *en masse*, restart Rancher first
rather than investigating the tests. Note that a single green run proves nothing at a ~1-in-3 rate —
loop the suite several times before concluding anything. CI is unaffected (Linux runners, no named
pipe involved), so a green `server-ci` does not rule this out locally.

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

**STOMP broker relay fails at startup: `TCP connection failure in session _system_: ... Connection
refused: localhost/127.0.0.1:61613`, but RabbitMQ is up and `docker ps` shows `61613` published.**
Windows-only, and the misleading part is that every check you'd naturally run comes back healthy.

`61613` is RabbitMQ's STOMP port (NTF-3's broker relay). What's actually happening: **Windows has
reserved the port, so Docker cannot bind the host side of the mapping** — `docker ps` still prints
`0.0.0.0:61613->61613/tcp` because that's the *requested* mapping, not proof it was established.

Confirm it in one command (PowerShell) — if 61613 is missing while 5672 is present, this is your
problem:
```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5672,61613 } |
  Select-Object LocalAddress,LocalPort
```
And to see the reservation itself:
```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```
`61613` falling inside one of those ranges is the root cause. The ranges are Hyper-V/WSL *dynamic*
reservations (no `*` marker = auto-assigned, not administered) and they **shift on reboot**, which
is why this appears out of nowhere on a machine where STOMP worked yesterday. The default TCP
dynamic port range is `49152–65535`, and 61613 sits inside it, so it is permanently eligible to be
grabbed again.

Things that look like fixes and are not:

- **Restarting or recreating the RabbitMQ container** (`docker compose ... up -d --force-recreate
  rabbitmq`). The port is unavailable to Docker at the host level; recreating the container cannot
  change that. Verified — a full recreate left 61613 with no host listener.
- **Checking the plugin.** `rabbitmq-plugins list` shows `[E*] rabbitmq_stomp` and the log says
  `started STOMP TCP listener on [::]:61613`. Both are true and neither is the problem — the
  listener is fine *inside* the container.
- **Blaming the IPv6 bind.** `netstat` inside the container shows `:::61613` rather than
  `0.0.0.0:61613`, which looks suspicious. It isn't: `5672` binds exactly the same way and works,
  and `bindv6only` is `0`.
- **Trusting `docker ps`.** It reports the mapping whether or not the host bind succeeded. This is
  the single most misleading signal in the whole diagnosis.

**The fix (elevated PowerShell).** Stop the NAT service to release the dynamic ranges, then reserve
61613 permanently so Hyper-V can never take it again:
```powershell
net stop winnat
netsh int ipv4 add excludedportrange protocol=tcp startport=61613 numberofports=1 store=persistent
net start winnat
```
Then `docker compose -f infra/docker-compose.dev.yml up -d --force-recreate rabbitmq`.

Two caveats learned the hard way:

- **The `add excludedportrange` step can still fail** with "The process cannot access the file
  because it is being used by another process" even after stopping `winnat`. That failure is not
  fatal to *unblocking today* — stopping `winnat` already releases the range, so the port becomes
  usable immediately and a container recreate will pick it up. But without the persistent
  reservation the problem **will** recur on a future reboot. Retry the `netsh` line on its own
  (elevated, without stopping `winnat`) once the port is free; it tends to succeed then.
- **A plain `docker compose up -d` will not re-establish the mapping** once the container already
  exists — use `--force-recreate`.

Verify the whole path end to end rather than just the socket, since a TCP connect proves less than
a real handshake:
```powershell
$c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 61613); $s = $c.GetStream()
$f = "CONNECT`naccept-version:1.2`nhost:/`nlogin:guest`npasscode:guest`n`n" + [char]0
$b = [Text.Encoding]::ASCII.GetBytes($f); $s.Write($b,0,$b.Length); $s.Flush()
Start-Sleep -Milliseconds 700
$buf = New-Object byte[] 1024; $n = $s.Read($buf,0,1024)
[Text.Encoding]::ASCII.GetString($buf,0,$n); $c.Close()
```
A healthy broker answers `CONNECTED ... server:RabbitMQ/...`.

**The permanent alternative, if this keeps biting:** publish STOMP on a host port *below* 49152
(e.g. `31613:61613` in `infra/docker-compose.dev.yml`) and set `STOMP_RELAY_PORT=31613`.
`application.yml` already reads `${STOMP_RELAY_PORT:61613}`, so no committed config change is
required beyond the compose mapping. Hyper-V's dynamic range never reaches below 49152, so the
conflict becomes structurally impossible rather than merely reserved-against. CI is unaffected
either way (Linux runners, no Hyper-V port reservations).
