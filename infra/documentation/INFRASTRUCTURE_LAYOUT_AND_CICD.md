# Infrastructure — layout convention & CI/CD platform decision

**Date:** 2026-07-08
**Status:** Agreed (discussion between repo owner + Claude during the HF-9/HF-12 closeout)
**Location note:** infrastructure decisions live here (`infra/documentation/`), not in
`documentation/md/` — deliberate amendment to the repo's docs-placement rule: product and
architecture decisions stay in `documentation/md/`, ops/infra decisions live with the infra.

---

## 1. Decision: where infrastructure files live

**Hybrid layout** — the same split the repo already uses for documentation (central for
cross-cutting, module-local for module-specific):

| Kind | Lives in | Examples | Why |
|---|---|---|---|
| **Artifact-scoped** (builds/runs ONE deployable) | `client/`, `server/` | future `server/Dockerfile`, `client/Dockerfile` or nginx config, `application*.yml`, Liquibase migrations, Vite/Playwright configs | Versions atomically with the code it packages; honors "monolith-first, microservice-ready" — an extracted service takes its build/runtime definition with it as a unit |
| **Environment-scoped** (spans deployables) | `infra/` | `docker-compose.dev.yml` (PostGIS + Redis + server + client), reverse-proxy config, k8s manifests / Terraform when hosting is scoped, monitoring, seed/backup scripts, `infra/scripts/` called by workflows | No single app owns "the environment"; one reviewable place (+ future `CODEOWNERS` line) for anything that can take production down |
| **Workflows** (GitHub constraint) | `.github/workflows/` | `client-ci.yml` (exists), future `server-ci.yml`, `deploy.yml` | GitHub only reads this exact path — cannot move. Keep YAML thin; put logic in `infra/scripts/` |

**Rule of thumb:** don't pre-create empty structure. `infra/` starts earning residents with the
first cross-cutting artifact (the dev docker-compose is the natural first one — the
PostgreSQL+PostGIS/Redis dev setup is currently manual).

## 2. Decision: GitHub Actions for CI/CD — no Jenkins

For this project's scale, GitHub Actions covers the entire build-and-deploy pipeline:

- **CI** — `client-ci.yml` already runs lint/typecheck/unit/e2e/visual on PRs touching
  `client/**`. Backend equivalent: `./gradlew build` on JDK 21 with Gradle caching
  (`actions/setup-java`) and **service containers** (`postgis/postgis`, `redis`) if/where
  integration tests need real infrastructure.
- **Artifacts/registry** — build the Boot jar or Docker image in the workflow, push to **GHCR**
  (free with the repo, same credentials). No Nexus/Artifactory to operate.
- **CD** — GitHub Environments (`dev`/`staging`/`production`) with per-environment secrets and
  **required-reviewer approval gates** for prod; **OIDC federation** to AWS/GCP/Azure so deploy
  jobs get short-lived cloud credentials (no long-lived secrets stored); triggers on tag/release/
  merge/`workflow_dispatch`; rollback = re-run an older tag's workflow.
- **Cost** — private-repo free tier is 2,000 min/month; ample here. Escape hatch if ever needed:
  a self-hosted runner (also the answer for deploy targets inside a private network) — still no
  Jenkins server to patch, secure, and babysit.

**When Jenkins would be reconsidered** (none apply today): years of bespoke plugin-based pipeline
logic, or a hard on-prem/air-gapped CI requirement.

**What GitHub does NOT provide:** the hosting itself. The hosting decision (and its
Terraform/compose) is what eventually populates `infra/` for real.

## 3. Current state & gaps (as of 2026-07-08)

| Piece | Status |
|---|---|
| `client-ci.yml` | ✅ Exists (HF-10b) and **live/green** — bootstrap closed out via client backlog **HF-12** (Linux baselines committed; red checks block merges by convention only, since branch protection is unavailable on this repo) |
| PR template | ✅ `.github/PULL_REQUEST_TEMPLATE.md` (HF-10b) |
| Backend CI | ✅ `server-ci.yml` exists (INFRA-1, 2026-07-08) and **green on its first run** (PR #4) — no baseline-bootstrap step needed, unlike `client-ci`. No service containers: all integration tests run against H2, and `BaseIT`'s Testcontainers-managed Redis (A8) self-provisions via the Docker daemon already on `ubuntu-latest` runners |
| Dev environment compose | ❌ Manual DB/Redis setup; `infra/docker-compose.dev.yml` proposed |
| Deployment workflow / hosting | ❌ Not scoped; blocked on a hosting decision |

## 4. Tickets

Tracked in `infra/documentation/BACKLOG_MVP.md` (pick up via `/workon infra mvp`):
**INFRA-1** backend CI workflow · **INFRA-2** dev docker-compose · **INFRA-3** deployment
pipeline (blocked on the hosting decision). The client-ci bootstrap remains client backlog
**HF-12**.
