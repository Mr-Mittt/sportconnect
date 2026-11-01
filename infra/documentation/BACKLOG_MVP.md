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
| 3 | [INFRA-11](MVP/INFRA-11_EMAIL_CONFIGURATION_IN_DEPLOYED_ENVIRONMENTS.md) | Email configuration (`MAIL_*`, `EMAIL_FROM`, link URLs) per environment; nothing sets them today | `TODO` |
| 4 | [INFRA-14](MVP/INFRA-14_PRODUCTION_KEYCLOAK_ON_ORACLE.md) | Production Keycloak on Oracle Always Free (production mode, theme and extension JARs, backups, real provider secrets); waits for INFRA-12 and INFRA-13 | `TODO` |
| 5 | [INFRA-19](MVP/INFRA-19_BOX_CONFIG_IMAGE_FOR_A_FULLY_PULL_BASED_BOX.md) | A "box" config image: ship the box's non-secret files (Caddyfile, Compose files, init SQL, RabbitMQ config, realm, themes, Keycloak JARs built in CI) by pull through the same promote and deploy flow, so a fresh or changed box needs no manual file copying; estimated 2 to 3 days, cloud-init / Ansible / Terraform costed but not chosen; best done with or after INFRA-14 | `TODO` |
| 6 | [INFRA-16](MVP/INFRA-16_DISTROLESS_SERVER_AND_CLIENT_IMAGES.md) | Evaluate distroless base images for the server image (and the client image, which needs a delivery-contract change first); after INFRA-6's run-flag hardening | `TODO` |
| 7 | [INFRA-17](MVP/INFRA-17_DOWN_VERSION_DEPLOY_AND_SCHEMA_MIGRATION.md) | Down-version deploy and the database schema: make going back to an older release safe (expand/contract rule, backup before deploy, opt-in schema rollback, migration lint); until done, INFRA-6 blocks promoting a lower version | `TODO` |
| 8 | [INFRA-18](MVP/INFRA-18_DEPLOY_FOLLOW_UPS_DEFERRED_FROM_INFRA_6.md) | Deploy follow-ups deferred from INFRA-6 (zero-downtime deploys, deploy notifications and a status view, Promote starting CI by itself); one collecting ticket, split when picked up | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [INFRA-10](MVP/INFRA-10_SWAGGER_AND_OAUTH_TOKEN_EXPOSURE_IN_DEPLOYED_ENVIRONMENTS.md) | Swagger UI and `/api-docs` in deployed environments: the `prod` profile no longer serves them (`springdoc.*.enabled=false`) and `SecurityConfig` names them as public only while they are on, so an anonymous call gets the filter chain's 401; `oauth-token` was already removed by A28; tested with scoped integration tests and mutation checks; the box check waits for the next server release, promote and deploy | `DONE` (2026-11-01) |
| 2 | [INFRA-9](MVP/INFRA-9_INTERNAL_NETWORK_ISOLATION.md) | `/internal/**` network isolation: the Caddyfile now refuses `/internal/*` with a 404 as its first rule (before, it was unreachable only because no rule matched and it fell through to the client); the application's shared-secret check stays as the second layer; `verify-internal-isolation.sh` checks from outside (the `/internal` variants, paths not exposed, closed ports), 25 of 25 passed on the live site; first documented run of the Caddyfile change procedure on the box (the box steps: owner's word) | `DONE` (2026-11-01) |
| 3 | [INFRA-7](MVP/INFRA-7_REVERSE_PROXY_PATH_ROUTING_FOR_SERVICES_CHAT.md) | Reverse proxy for chat: `infra/oracle/Caddyfile` adopted as the production proxy config (comments only: production header, no access log for the `?token=` chat socket); chat and STOMP WebSockets proven through Caddy (handshakes from outside; live push, 2 minutes idle, RabbitMQ relay, origins on the box: owner's word); chat path in the ticket corrected to `/api/chat/conversations/{id}/ws` | `DONE` (2026-10-30) |
| 4 | [INFRA-6](MVP/INFRA-6_DEPLOYMENT_PIPELINE.md) | Deployment pipeline: pull-based and manual. `promote.yml` (component + version, checks, CI result, no older version, `production` Environment approval, then retags `prod`), the box command `sportconnect-deploy` (plan, pull, server then chat then client files, health probes, restore-everything on failure, log), `run-containers.sh` became `start-stack.sh`, `server.Dockerfile` deleted, image `description` labels, hardened run flags; the GitHub and box runs are INFRA-15 conditionals; follow-ups INFRA-17, INFRA-18, CHAT-22 | `DONE` |
| 5 | [INFRA-8](MVP/INFRA-8_SERVICES_CHAT_DOCKERFILE_PUBLISH_WORKFLOW.md) | Chat image: `services/chat/Dockerfile` fixed (Go version from `go.mod`, distroless `nonroot`, stamped version, OCI labels), the chat version in `services/chat/VERSION` (`chat-version.sh`, tags `chat-vX.Y.Z`), `chat-image.yml` (same release and retention rules as the server and client images), chat in `/release`; the GitHub-side checks are INFRA-15 | `DONE` |
| 6 | [INFRA-5](MVP/INFRA-5_CLIENT_STATIC_BUILD_S3_CLOUDFRONT_DEPLOY.md) | Client image: `client/Dockerfile` (the static build, Keycloak URL baked in, served by the box's Caddy), the client's own version in `client/package.json` (`client-version.sh`, tags `client-vX.Y.Z`), `client-image.yml` (same release and retention rules as the server image), the client in `/release`; the GitHub-side checks are INFRA-15 | `DONE` |
| 7 | [INFRA-4](MVP/INFRA-4_SERVER_DOCKERFILE_GHCR_PUBLISH_WORKFLOW.md) | Server Dockerfile + GHCR publish workflow with versioning: `server/Dockerfile`, one monolith version in `gradle.properties`, `server-version.sh` and `server-image.yml` (merging a version bump releases `X.Y.Z`/`latest`, any other merge pushes `sha-`/`edge`), retention; the GitHub-side checks are INFRA-15 | `DONE` |
| 8 | [INFRA-13](MVP/INFRA-13_KEYCLOAK_IN_COMPOSE_AND_REALM_AS_CODE.md) | Keycloak 26 in the dev Compose stack with the realm as a committed import (5-min access token, audience mapper, optional email/names, en/vi, no secrets), Mailpit mail sink, idempotent `keycloak_dev` bootstrap script | `DONE` |
| 9 | [INFRA-1](MVP/INFRA-1_BACKEND_CI_WORKFLOW.md) | Backend CI workflow (`server-ci.yml`) | `DONE` |
| 10 | [INFRA-2](MVP/INFRA-2_DEV_DOCKER_COMPOSE.md) | Dev environment docker-compose | `DONE` |
| 11 | [INFRA-3](MVP/INFRA-3_HOSTING_DECISION.md) | Oracle foundation: the production VM built from the runbook and serving `yoursport.vn`, nightly backups to Object Storage (the AWS plan was superseded 2026-10-27); resources in `INFRA-3_ORACLE_RESOURCES.md` | `DONE` |

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
INFRA-6 → INFRA-3, INFRA-4, INFRA-5 (orchestrates all three); also CHAT-22 (chat applies its own schema at startup)
INFRA-7 → INFRA-3 (needs the VM + Caddy foundation already provisioned there)
INFRA-8 → INFRA-3 (same GHCR pieces INFRA-4 needs, mirrored for services/chat's own image)
INFRA-9 → INFRA-3 at minimum (VCN security list); may additionally depend on INFRA-7 if
           implemented via the reverse proxy rather than (or in addition to) the security group —
           see INFRA-9's ticket body
INFRA-17 -> INFRA-6 (extends its promote workflow and deploy command; lifts the down-version block)
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
