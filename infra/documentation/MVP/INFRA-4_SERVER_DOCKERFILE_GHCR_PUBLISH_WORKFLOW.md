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

## Delta 2026-10-27 (INFRA-3 / INFRA-12): target is the Oracle VM, x86 now

Hosting is Oracle Cloud (`INFRA-3_HOSTING_DECISION.md`), not AWS. Consequences for this ticket:
- The image runs on an **x86** VM now; Always Free A1 (arm64) is reconsidered when capacity appears, so build with `buildx` for `linux/amd64` and keep `linux/arm64` addable (INFRA-12 points 2 and 3 are untested).
- `infra/oracle/server.Dockerfile` (`eclipse-temurin:21-jre` plus a pre-built jar) is a **throwaway measuring tool** from the INFRA-12 sandbox, not this ticket's deliverable.
- Publishing to GHCR needs no cloud credentials (the workflow's `GITHUB_TOKEN`). The VM pulls the image itself (pull-based deploy, INFRA-6); it needs one read-only GHCR token for a private image, kept in a root-owned file on the box.
- Run the server with the `prod` profile (the `dev` profile hard-codes `app.internal-service-secret`; INFRA-12 findings).
