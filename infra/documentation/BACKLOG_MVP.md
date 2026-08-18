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

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [INFRA-3](MVP/INFRA-3_HOSTING_DECISION.md) | AWS foundation (EC2 + RDS + S3/CloudFront + OIDC role) | `TODO` |
| 2 | [INFRA-4](MVP/INFRA-4_SERVER_DOCKERFILE_GHCR_PUBLISH_WORKFLOW.md) | Server Dockerfile + GHCR publish workflow | `TODO` |
| 3 | [INFRA-5](MVP/INFRA-5_CLIENT_STATIC_BUILD_S3_CLOUDFRONT_DEPLOY.md) | Client static build + S3/CloudFront deploy | `TODO` |
| 4 | [INFRA-6](MVP/INFRA-6_DEPLOYMENT_PIPELINE.md) | Deployment pipeline (`deploy.yml`) | `TODO` |
| 5 | [INFRA-7](MVP/INFRA-7_REVERSE_PROXY_PATH_ROUTING_FOR_SERVICES_CHAT.md) | Reverse-proxy path-routing for `services/chat` | `TODO` |
| 6 | [INFRA-8](MVP/INFRA-8_SERVICES_CHAT_DOCKERFILE_PUBLISH_WORKFLOW.md) | `services/chat` Dockerfile publish workflow | `TODO` |
| 7 | [INFRA-9](MVP/INFRA-9_INTERNAL_NETWORK_ISOLATION.md) | `/internal/**` network isolation | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [INFRA-1](MVP/INFRA-1_BACKEND_CI_WORKFLOW.md) | Backend CI workflow (`server-ci.yml`) | `DONE` |
| 2 | [INFRA-2](MVP/INFRA-2_DEV_DOCKER_COMPOSE.md) | Dev environment docker-compose | `DONE` |

---

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
`infra/documentation/MVP/INFRA-3_HOSTING_DECISION.md`: AWS free tier, single EC2 instance (Docker +
Nginx/Caddy + self-hosted Redis) + RDS PostgreSQL/PostGIS + S3/CloudFront for the client, GHCR
for images, OIDC for deploy credentials. Only `production` is deployed to AWS for now — `dev`/
`staging` stay local-only via `docker-compose.dev.yml` (INFRA-2).
