# Infra — Backlog

**Version:** MVP v1
**Module:** `infra` (repo-level infrastructure: CI/CD, environments, deployment)
**Last updated:** 2026-07-08

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session, `DONE` when implemented + verified
- Use `/workon infra mvp` to resume

Decisions these tickets implement live in `INFRASTRUCTURE_LAYOUT_AND_CICD.md` (same folder) —
that doc is the spec unless a ticket entry overrides it. Conventions: artifact-scoped files stay
in `client/`/`server/`; environment-scoped files in `infra/`; workflows only in
`.github/workflows/` (GitHub constraint) with logic in `infra/scripts/`; GitHub Actions is the
platform — no Jenkins, no second CI system.

**Related but tracked elsewhere:** client backlog **HF-12** (client-ci bootstrap: first run,
Linux baselines artifact swap, required-check setting) — a mostly-manual GitHub-side ticket that
INFRA-1 does not depend on, but shares the same "verify on GitHub, record as conditional until a
green run exists" pattern.

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | INFRA-1 | Backend CI workflow (`server-ci.yml`) | `DONE` |
| 2 | INFRA-2 | Dev environment docker-compose | `DONE` |
| 3 | INFRA-3 | AWS foundation (EC2 + RDS + S3/CloudFront + OIDC role) | `TODO` |
| 4 | INFRA-4 | Server Dockerfile + GHCR publish workflow | `TODO` |
| 5 | INFRA-5 | Client static build + S3/CloudFront deploy | `TODO` |
| 6 | INFRA-6 | Deployment pipeline (`deploy.yml`) | `TODO` |
| 7 | INFRA-7 | Reverse-proxy path-routing for `services/chat` | `TODO` |
| 8 | INFRA-8 | `services/chat` Dockerfile publish workflow | `TODO` |
| 9 | INFRA-9 | `/internal/**` network isolation | `TODO` |

**Dependencies:**
```
INFRA-1 ∥ INFRA-2 (independent)
INFRA-3 → hosting decision made (see INFRA-3_HOSTING_DECISION.md); also wants INFRA-1 done
          (deploying untested builds is pointless)
INFRA-4 → INFRA-3 (needs the GHCR/OIDC pieces the foundation sets up)
INFRA-5 → INFRA-3 (needs the S3/CloudFront resources)
INFRA-6 → INFRA-3, INFRA-4, INFRA-5 (orchestrates all three)
INFRA-7 → INFRA-3 (needs the EC2 + Nginx/Caddy foundation already provisioned there)
INFRA-8 → INFRA-3 (same GHCR/OIDC pieces INFRA-4 needs, mirrored for services/chat's own image)
INFRA-9 → INFRA-3 at minimum (EC2 security group); may additionally depend on INFRA-7 if
           implemented via the reverse proxy rather than (or in addition to) the security group —
           see INFRA-9's ticket body
INFRA-6's orchestration should be revisited once INFRA-7/8/9 exist, to also restart the chat
  container alongside server/client — not re-scoped here, flagged on INFRA-6 below.
```

**Filed 2026-07-27** (alongside `services/chat/docs/BACKLOG_MVP.md`): INFRA-7/8/9 close the three
infra gaps identified while live-verifying the chat service's monolith-side integration — none of
them block running the chat service locally (dev routes around all three: the Vite proxy talks to
chat directly, no Docker image is needed to `go run` it, and there's no network boundary to isolate
on a single dev machine). They only matter once `services/chat` needs to actually run in
production.

The hosting decision that unblocked this split is recorded in
`infra/documentation/INFRA-3_HOSTING_DECISION.md`: AWS free tier, single EC2 instance (Docker +
Nginx/Caddy + self-hosted Redis) + RDS PostgreSQL/PostGIS + S3/CloudFront for the client, GHCR
for images, OIDC for deploy credentials. Only `production` is deployed to AWS for now — `dev`/
`staging` stay local-only via `docker-compose.dev.yml` (INFRA-2).

---

## Tickets

### INFRA-1 · Backend CI workflow (`server-ci.yml`)
**Status:** `DONE` — see `infra/documentation/INFRA-1_BACKEND_CI_WORKFLOW.md` · **Type:** Infrastructure (CI) · **Dependency:** none ·
**Spec:** `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2 + §3

The backend currently has **zero CI** — nothing builds or runs the Spock suites on push.
Deliver `.github/workflows/server-ci.yml`:

- Triggers: PRs/pushes touching `modules/**`, `server/**`, `*.gradle`, the workflow file
- JDK 21 (`actions/setup-java`, temurin) with Gradle caching; `./gradlew build`
- **First implementation step is an inventory**: check whether any Spock tests actually need
  real PostgreSQL/PostGIS or Redis (integration tests) vs pure `Mock()` unit tests. Add
  service containers (`postgis/postgis`, `redis`) ONLY if the inventory demands them —
  don't cargo-cult infrastructure the tests don't use.
- Upload test reports as an artifact on failure
- Done when: workflow file merged + a green run on a backend-touching PR + marked as a
  required check (the GitHub-settings step is manual — record as conditional if not yet done,
  same pattern as HF-12)

### INFRA-2 · Dev environment docker-compose
**Status:** `DONE` — see `infra/documentation/INFRA-2_DEV_DOCKER_COMPOSE.md` · **Type:** Infrastructure (dev env) · **Dependency:** none ·
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

### INFRA-3 · AWS foundation (EC2 + RDS + S3/CloudFront + OIDC role)
**Status:** `TODO` · **Type:** Infrastructure (cloud provisioning) · **Dependency:** INFRA-1 ·
**Spec:** `INFRA-3_HOSTING_DECISION.md`

Provision the AWS resources the deploy pipeline needs, for a single `production` environment:

- EC2 instance (t2/t3.micro, free tier), Docker installed, security group allowing 80/443 (and
  22 or SSM for deploy access — prefer AWS Systems Manager Session Manager over open SSH)
- RDS PostgreSQL instance (db.t3.micro, free tier) with the PostGIS extension enabled; verify
  reachability from the EC2 instance's security group only (no public DB access)
- S3 bucket + CloudFront distribution for the client static build
- IAM role trusting GitHub's OIDC provider, scoped to only what the deploy workflow needs
  (push to the S3 bucket, invalidate the CloudFront distribution, deploy to the EC2 instance —
  not broad admin access)
- Nginx or Caddy config on the EC2 instance for TLS termination (Let's Encrypt) — no ALB
- Document exact resource names/regions/IDs in `infra/documentation/` (not secrets — those go in
  GitHub Environment secrets) so INFRA-4/5/6 have concrete values to target
- Done when: resources exist and are reachable, OIDC role can be assumed from a test GitHub
  Actions run, documented in `infra/documentation/`

### INFRA-4 · Server Dockerfile + GHCR publish workflow
**Status:** `TODO` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** `INFRA-3_HOSTING_DECISION.md`, `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1

- `server/Dockerfile` (artifact-scoped — lives with the code it packages, not in `infra/`):
  multi-stage build (Gradle build stage → slim JRE 21 runtime stage), non-root user
- Workflow step (extending `server-ci.yml` or a new job) that builds the image and pushes to
  `ghcr.io/<org>/sportconnect-server` on merge to `master` (or on tag — decide in Phase 1),
  tagged with the commit SHA
- Done when: a real image is pushed to GHCR and can be pulled + run locally against
  `docker-compose.dev.yml`'s Postgres/Redis to confirm it boots

### INFRA-5 · Client static build + S3/CloudFront deploy
**Status:** `TODO` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** `INFRA-3_HOSTING_DECISION.md`, `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1

- Workflow step that runs `pnpm build` in `client/`, syncs the output to the INFRA-3 S3 bucket,
  and invalidates the CloudFront distribution
- Confirm the built client's `/api` calls target the real production server URL (env-specific
  Vite build config), not `localhost`
- Done when: a real build is deployed and reachable through the CloudFront URL

**Delta (2026-08-15, filed while implementing client SPORT-4):** the `/api` origin problem above
isn't unique to API calls — `SportIcon` (SPORT-4) renders `Sport.iconUrl`, a real backend-served
static asset (`sport-impl`'s `WebConfig`, `/images/**` → `classpath:/images/`) returned by
`GET /api/sports` as a **server-relative path** (e.g. `/images/sports/badminton.png`). A relative
`<img src>` only resolves against the page's own origin, so once the client is genuinely on
CloudFront and the backend is on EC2 (this ticket's whole premise), that image 404s exactly the
same way an unconfigured relative `/api` call would. Dev-mode is unaffected (client SPORT-4 added
a `/images` entry to `vite.config.ts`'s dev proxy, mirroring the existing `/api` one — real local
`pnpm dev` and the e2e mock server both resolve it correctly today); this delta is scoped to
**production only**. Whatever this ticket's env-specific Vite build config ends up being for `/api`
(an absolute prod server URL baked in at build time, most likely) needs to cover `/images/**` too —
either the same absolute-origin prefix applied to both, or a CloudFront distribution behavior that
path-routes `/images/**` to the EC2 origin (mirrors INFRA-7's reverse-proxy path-routing precedent,
just client-origin-side instead of server-side). Decide which at pickup; either closes this gap.
Not blocking SPORT-4's own client-side ship — that ticket's scope is explicitly client-only,
dev-verified, with this production gap called out rather than silently assumed fixed.

### INFRA-6 · Deployment pipeline (`deploy.yml`)
**Status:** `TODO` · **Type:** Infrastructure (CD) · **Dependency:** INFRA-3, INFRA-4, INFRA-5 ·
**Spec:** `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2, `INFRA-3_HOSTING_DECISION.md`

**Amended 2026-07-27** (filed alongside INFRA-7/8/9): once `services/chat` has its own image
(INFRA-8) and proxy routing (INFRA-7), this pipeline's "pull the image onto the EC2 instance and
restart the container" step needs to cover the chat container too, not just the server — a third
`docker run`/restart alongside the two below. Not re-scoped in detail here; the implementer should
just not assume "server + client" is still the complete deploy surface by the time this is picked
up.

Orchestrates the pieces above into one deploy: `.github/workflows/deploy.yml`, thin YAML calling
scripts in `infra/scripts/`:

- Trigger: merge to `master` (or manual `workflow_dispatch` — decide in Phase 1)
- Uses the INFRA-3 OIDC role to authenticate to AWS
- Pulls the INFRA-4 image onto the EC2 instance (via SSM, not SSH) and restarts the container
- Runs pending Liquibase migrations before/as part of the restart
- Triggers the INFRA-5 client deploy (or depends on it having already run)
- Uses a GitHub Environment (`production`) with a required-reviewer approval gate
- Rollback = re-run the workflow against an older commit SHA's image tag
- Done when: a full merge-to-master run deploys server + client and both are reachable; record
  as conditional if the required-reviewer GitHub setting can't be verified without a real PR
  merge (same HF-12/INFRA-1 pattern)

### INFRA-7 · Reverse-proxy path-routing for `services/chat`
**Status:** `TODO` · **Type:** Infrastructure (networking) · **Dependency:** INFRA-3 ·
**Spec:** `services/chat/docs/SYNC_DESIGN.md`, `services/chat/README.md` §6

**Origin:** the chat service's client-facing routing decision (client reaches it directly, no
Spring gateway — see `services/chat/CLAUDE.md`) already assumes a reverse proxy path-routes
`/api/chat/**` to the chat container and everything else to the server container. INFRA-3 only
scopes "Nginx or Caddy config on the EC2 instance for TLS termination" for a single origin — it
doesn't yet describe routing between two backend containers, since `services/chat` didn't exist
when INFRA-3 was written.

**What ships:**
- Nginx or Caddy config (whichever INFRA-3 actually provisioned) with two `location`/route blocks
  on the single EC2 instance: `/api/chat/**` → the chat container's port (`8081` locally; confirm
  the prod container port matches `CHAT_HTTP_ADDR`), everything else → the server container's port.
- Confirm the WebSocket upgrade (`GET /conversations/{id}/ws`) actually proxies correctly — Nginx
  in particular needs explicit `Upgrade`/`Connection` header passthrough config for this path,
  it's not automatic the way a plain HTTP proxy pass is.
- Done when: a real request to `/api/chat/healthz` through the production domain reaches the chat
  container, a real request to `/api/auth/**` still reaches the server container, and a real
  WebSocket connection through the proxy stays open and receives a pushed message (not just that
  the HTTP upgrade handshake succeeds).

### INFRA-8 · `services/chat` Dockerfile publish workflow
**Status:** `TODO` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** mirrors INFRA-4's shape, for `services/chat` instead of `server`

**Origin:** `services/chat/Dockerfile` already exists (multi-stage Go build → distroless runtime,
see `services/chat/CLAUDE.md`) but nothing builds or publishes it — there's no CI workflow for this
module at all yet, unlike `server-ci.yml` (INFRA-1).

**What ships:**
- A CI workflow (new `chat-ci.yml`, or a job appended to an existing one — decide in Phase 1)
  triggered on changes under `services/chat/**`: `go build ./...`, `go vet ./...`, `go test ./...`
  (mirrors INFRA-1's server-CI shape, Go-flavored).
- A publish step (extending that workflow or a separate one, matching INFRA-4's split) that builds
  `services/chat/Dockerfile` and pushes to `ghcr.io/<org>/sportconnect-chat` on merge to `master`,
  tagged with the commit SHA.
- Done when: a real image is pushed to GHCR and can be pulled + run locally against the dev compose
  stack's Postgres/Redis to confirm it boots (same bar INFRA-4 already holds itself to).

### INFRA-9 · `/internal/**` network isolation
**Status:** `TODO` · **Type:** Infrastructure (security) · **Dependency:** INFRA-3 (at minimum);
possibly INFRA-7
**Spec:** `services/chat/docs/SYNC_DESIGN.md`'s cold-start bootstrap section

**Origin:** `/internal/sync/**` (the server's endpoints the chat service's cold-start bootstrap
pulls from) is gated by a shared-secret header at the application layer
(`InternalServiceAuthFilter`), but nothing today prevents an external caller from reaching that
path at all — the secret is the only thing standing between the public internet and a full data
dump of group memberships/friendships/user profiles. Application-layer auth was always meant to be
the second layer, not the only one — see the explicit call-out in `SYNC_DESIGN.md`.

**What ships:**
- Either (or both, decide in Phase 1): an EC2 security-group rule that simply never exposes the
  server container's port to anything but the reverse proxy and other containers on the same
  Docker network: or an explicit `location /internal/ { deny all; }`-style block in the INFRA-7
  reverse-proxy config, so even if the security group is ever loosened, the proxy itself refuses to
  forward the path externally.
- Verify from *outside* the VPC/security group (not just "the app returns 403 for a bad secret,"
  which is a different, already-covered case) that `/internal/**` is genuinely unreachable — e.g.
  attempt a real external request against the production domain's `/internal/sync/group-members`
  and confirm it never even reaches the application (connection refused/timeout, not a 403 from the
  app).
- Done when: that external-reachability check is performed and documented, not just assumed from
  the security-group rule existing.
