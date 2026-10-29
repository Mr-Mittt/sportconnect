# Infra — Backlog

**Version:** MVP v1
**Module:** `infra` (repo-level infrastructure: CI/CD, environments, deployment)
**Last updated:** 2026-10-14

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

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [INFRA-12](MVP/INFRA-12_SPIKE_ORACLE_ALWAYS_FREE_HOSTING.md) | Spike: can the whole stack (and Keycloak) run on Oracle Cloud Always Free? Gates INFRA-3..6 — see the amendment in the hosting decision (2026-10-13) | `IN PROGRESS` |
| 2 | [INFRA-15](MVP/INFRA-15_VERIFY_SERVER_IMAGE_WORKFLOW_ON_GITHUB.md) | Verify the server-image, client-image and chat-image workflows on GitHub after INFRA-4, INFRA-5 and INFRA-8 merge (first push, release dispatch and tag, tag fallback, retention, package visibility) | `TODO` |
| 3 | [INFRA-6](MVP/INFRA-6_DEPLOYMENT_PIPELINE.md) | Deployment pipeline: pull-based through GHCR (see the Delta 2026-10-27) | `TODO` |
| 4 | [INFRA-7](MVP/INFRA-7_REVERSE_PROXY_PATH_ROUTING_FOR_SERVICES_CHAT.md) | Reverse-proxy path-routing for `services/chat` | `TODO` |
| 5 | [INFRA-9](MVP/INFRA-9_INTERNAL_NETWORK_ISOLATION.md) | `/internal/**` network isolation | `TODO` |
| 6 | [INFRA-10](MVP/INFRA-10_SWAGGER_AND_OAUTH_TOKEN_EXPOSURE_IN_DEPLOYED_ENVIRONMENTS.md) | Swagger UI, `/api-docs` and `oauth-token` are public in every profile — decide what a deployed environment exposes; found during auth A7 | `TODO` |
| 7 | [INFRA-11](MVP/INFRA-11_EMAIL_CONFIGURATION_IN_DEPLOYED_ENVIRONMENTS.md) | Email configuration (`MAIL_*`, `EMAIL_FROM`, link URLs) per environment; nothing sets them today | `TODO` |
| 8 | [INFRA-14](MVP/INFRA-14_PRODUCTION_KEYCLOAK_ON_ORACLE.md) | Production Keycloak on Oracle Always Free (production mode, theme and extension JARs, backups, real provider secrets); waits for INFRA-12 and INFRA-13 | `TODO` |
| 9 | [INFRA-16](MVP/INFRA-16_DISTROLESS_SERVER_AND_CLIENT_IMAGES.md) | Evaluate distroless base images for the server image (and the client image, which needs a delivery-contract change first); after INFRA-6's run-flag hardening | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [INFRA-8](MVP/INFRA-8_SERVICES_CHAT_DOCKERFILE_PUBLISH_WORKFLOW.md) | Chat image: `services/chat/Dockerfile` fixed (Go version from `go.mod`, distroless `nonroot`, stamped version, OCI labels), the chat version in `services/chat/VERSION` (`chat-version.sh`, tags `chat-vX.Y.Z`), `chat-image.yml` (same release and retention rules as the server and client images), chat in `/release`; the GitHub-side checks are INFRA-15 | `DONE` |
| 2 | [INFRA-5](MVP/INFRA-5_CLIENT_STATIC_BUILD_S3_CLOUDFRONT_DEPLOY.md) | Client image: `client/Dockerfile` (the static build, Keycloak URL baked in, served by the box's Caddy), the client's own version in `client/package.json` (`client-version.sh`, tags `client-vX.Y.Z`), `client-image.yml` (same release and retention rules as the server image), the client in `/release`; the GitHub-side checks are INFRA-15 | `DONE` |
| 3 | [INFRA-4](MVP/INFRA-4_SERVER_DOCKERFILE_GHCR_PUBLISH_WORKFLOW.md) | Server Dockerfile + GHCR publish workflow with versioning: `server/Dockerfile`, one monolith version in `gradle.properties`, `server-version.sh` and `server-image.yml` (merging a version bump releases `X.Y.Z`/`latest`, any other merge pushes `sha-`/`edge`), retention; the GitHub-side checks are INFRA-15 | `DONE` |
| 4 | [INFRA-13](MVP/INFRA-13_KEYCLOAK_IN_COMPOSE_AND_REALM_AS_CODE.md) | Keycloak 26 in the dev Compose stack with the realm as a committed import (5-min access token, audience mapper, optional email/names, en/vi, no secrets), Mailpit mail sink, idempotent `keycloak_dev` bootstrap script | `DONE` |
| 5 | [INFRA-1](MVP/INFRA-1_BACKEND_CI_WORKFLOW.md) | Backend CI workflow (`server-ci.yml`) | `DONE` |
| 6 | [INFRA-2](MVP/INFRA-2_DEV_DOCKER_COMPOSE.md) | Dev environment docker-compose | `DONE` |
| 7 | [INFRA-3](MVP/INFRA-3_HOSTING_DECISION.md) | Oracle foundation: the production VM built from the runbook and serving `yoursport.vn`, nightly backups to Object Storage (the AWS plan was superseded 2026-10-27); resources in `INFRA-3_ORACLE_RESOURCES.md` | `DONE` |

---

**Dependencies:**
```
INFRA-1 ∥ INFRA-2 (independent)
INFRA-12 → decided 2026-10-27: GO on Oracle x86 (A1 later). INFRA-3..6 are rewritten for Oracle (Deltas on
           INFRA-4/5/6/7/8/9/14 and INFRA-3's own body); INFRA-12 closes when INFRA-3's decision is merged.
INFRA-3 → hosting decision made (Oracle, see INFRA-3_HOSTING_DECISION.md); also wants INFRA-1 done
          (deploying untested builds is pointless)
INFRA-4 → INFRA-3 (needs the VM and the GHCR pull token the foundation sets up)
INFRA-5 → INFRA-3 (needs the VM and its Caddy)
INFRA-6 → INFRA-3, INFRA-4, INFRA-5 (orchestrates all three)
INFRA-7 → INFRA-3 (needs the VM + Caddy foundation already provisioned there)
INFRA-8 → INFRA-3 (same GHCR pieces INFRA-4 needs, mirrored for services/chat's own image)
INFRA-9 → INFRA-3 at minimum (VCN security list); may additionally depend on INFRA-7 if
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

The hosting decision is recorded in `infra/documentation/MVP/INFRA-3_HOSTING_DECISION.md`: since
2026-10-27 **Oracle Cloud, one x86 VM** running Docker Compose (Caddy, server, chat, Postgres+PostGIS,
Redis, RabbitMQ, Keycloak), GHCR for images, pull-based deploys, nightly backups to Object Storage;
Always Free A1 (arm64) is reconsidered when capacity appears. The original AWS decision (2026-07-08)
is superseded. Only `production` is hosted — `dev`/`staging` stay local-only via
`docker-compose.dev.yml` (INFRA-2).
