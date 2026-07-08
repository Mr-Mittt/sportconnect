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

**Dependencies:**
```
INFRA-1 ∥ INFRA-2 (independent)
INFRA-3 → hosting decision made (see INFRA-3_HOSTING_DECISION.md); also wants INFRA-1 done
          (deploying untested builds is pointless)
INFRA-4 → INFRA-3 (needs the GHCR/OIDC pieces the foundation sets up)
INFRA-5 → INFRA-3 (needs the S3/CloudFront resources)
INFRA-6 → INFRA-3, INFRA-4, INFRA-5 (orchestrates all three)
```

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

### INFRA-6 · Deployment pipeline (`deploy.yml`)
**Status:** `TODO` · **Type:** Infrastructure (CD) · **Dependency:** INFRA-3, INFRA-4, INFRA-5 ·
**Spec:** `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2, `INFRA-3_HOSTING_DECISION.md`

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
