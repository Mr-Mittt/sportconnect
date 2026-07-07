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
| 1 | INFRA-1 | Backend CI workflow (`server-ci.yml`) | `TODO` |
| 2 | INFRA-2 | Dev environment docker-compose | `TODO` |
| 3 | INFRA-3 | Deployment pipeline (`deploy.yml`) | `TODO` — **blocked on the hosting decision** |

**Dependencies:**
```
INFRA-1 ∥ INFRA-2 (independent)
INFRA-3 → blocked on a hosting decision (provider, runtime shape); also wants INFRA-1 done
          (deploying untested builds is pointless)
```

---

## Tickets

### INFRA-1 · Backend CI workflow (`server-ci.yml`)
**Status:** `TODO` · **Type:** Infrastructure (CI) · **Dependency:** none ·
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
**Status:** `TODO` · **Type:** Infrastructure (dev env) · **Dependency:** none ·
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

### INFRA-3 · Deployment pipeline (`deploy.yml`)
**Status:** `TODO` — **BLOCKED: needs a hosting decision first** (provider + runtime shape:
container host? k8s? PaaS?) · **Type:** Infrastructure (CD) · **Dependency:** INFRA-1, hosting
decision · **Spec:** `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2

When unblocked: build server image (+ client static build), push to GHCR, deploy per
environment using GitHub Environments (`dev`/`staging`/`production`), required-reviewer
approval on production, OIDC to the chosen cloud (no long-lived secrets). Do not start this
ticket to "prepare" — the hosting decision changes its content materially; a `/vision` or
`/feature` pass on hosting comes first.
