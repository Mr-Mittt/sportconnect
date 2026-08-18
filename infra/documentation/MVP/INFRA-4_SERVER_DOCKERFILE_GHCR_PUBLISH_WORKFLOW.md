# INFRA-4 · Server Dockerfile + GHCR publish workflow

**Status:** `TODO` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** `INFRA-3_HOSTING_DECISION.md`, `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1

- `server/Dockerfile` (artifact-scoped — lives with the code it packages, not in `infra/`):
  multi-stage build (Gradle build stage → slim JRE 21 runtime stage), non-root user
- Workflow step (extending `server-ci.yml` or a new job) that builds the image and pushes to
  `ghcr.io/<org>/sportconnect-server` on merge to `master` (or on tag — decide in Phase 1),
  tagged with the commit SHA
- Done when: a real image is pushed to GHCR and can be pulled + run locally against
  `docker-compose.dev.yml`'s Postgres/Redis to confirm it boots
