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
| 1 | [INFRA-16](MVP/INFRA-16_DISTROLESS_SERVER_AND_CLIENT_IMAGES.md) | Evaluate distroless base images for the server image (and the client image, which needs a delivery-contract change first); after INFRA-6's run-flag hardening | `TODO` |
| 2 | [INFRA-17](MVP/INFRA-17_DOWN_VERSION_DEPLOY_AND_SCHEMA_MIGRATION.md) | Down-version deploy and the database schema: make going back to an older release safe (expand/contract rule, backup before deploy, opt-in schema rollback, migration lint); until done, INFRA-6 blocks promoting a lower version | `TODO` |
| 3 | [INFRA-18](MVP/INFRA-18_DEPLOY_FOLLOW_UPS_DEFERRED_FROM_INFRA_6.md) | Deploy follow-ups deferred from INFRA-6 (zero-downtime deploys, deploy notifications and a status view, Promote starting CI by itself); one collecting ticket, split when picked up | `TODO` |
| 4 | [INFRA-20](MVP/INFRA-20_ORACLE_HOSTING_FOLLOW_UPS.md) | Oracle hosting follow-ups left open by the INFRA-12 spike: latency and the Cloudflare test, authenticated load (feed, Discover, WebSocket, Keycloak logins), idle reclamation and the current A1 allowance; measured on the A1 box after INFRA-12's move | `TODO` |
| 5 | [INFRA-21](MVP/INFRA-21_PRODUCTION_NAMES_THAT_STILL_SAY_DEV.md) | Production names that still say `dev`: the Compose project `sportconnect-dev` (containers, network, volumes) and the `_dev` database names; options costed, none chosen; depends on INFRA-14 | `TODO` |
| 6 | [INFRA-22](MVP/INFRA-22_ONE_VAULT_SECRET_PER_CREDENTIAL_AND_ENV_FILE_TEMPLATES.md) | One Vault secret per credential and env files built from repository templates by `fetch-secrets.sh` (no whole-file secrets, no duplicated values, non-secret settings in git); depends on INFRA-14, related to INFRA-19 | `TODO` |
| 7 | [INFRA-23](MVP/INFRA-23_FULL_RESTORE_ON_A_FRESH_BOX.md) | Full restore on a fresh box: rebuild the production box on a new A1 instance from the bucket backup (restore with the new roles, the post-restore realm steps, outside checks); split out of INFRA-14 item 3, also closes INFRA-19's unproven realm-steps-and-restore; depends on INFRA-14 and INFRA-19 | `TODO` |
| 8 | [INFRA-24](MVP/INFRA-24_RELEASE_NOTES_PER_COMPONENT_CHECKED_BY_RELEASE.md) | Release notes per component (server, client, chat, box) in `documentation/release-notes/`, checked and cleaned by `/release`, enforced by the `*-version.sh check` commands and shown in the promote summary | `IN PROGRESS` |
| 9 | [INFRA-25](MVP/INFRA-25_PRODUCTION_REALM_ROLES_STEP_AND_BACKFILL.md) | Production realm: a `roles` step in `apply-realm-production.sh` (realm roles USER and ADMIN, USER as default role) and the backfill of existing users; ships in a box release; for A37 | `IN PROGRESS` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [INFRA-14](MVP/INFRA-14_PRODUCTION_KEYCLOAK_ON_ORACLE.md) | Production Keycloak and credentials on the A1 box: production-mode Keycloak behind Caddy with the committed realm and both JARs; secrets in OCI Vault fetched to tmpfs by `fetch-secrets.sh` (the plain files shredded); least-privilege Postgres roles, a RabbitMQ user and a Redis password (`rotate-credentials.sh postgres` and `rabbitmq`); the live realm brought to the production values by `apply-realm-production.sh`; one command per outside credential, `smtp`, `keycloak-admin`, `google` and `ghcr`, and `all` (six steps), each testing the new value at its source first; proven on the live box as no-change re-checks (Google, Brevo, GitHub's expiry, the reset mail), with backups and `restore-test.sh` after the rotation and Keycloak at 945.8 MiB at rest and about 2.4 GiB under a 400-user ramp. Not proven (written in the ticket): a real rotation of each value (the GHCR token expires 2026-12-02), the full restore on a fresh box (INFRA-23) | `DONE` (2026-11-06) |
| 2 | [INFRA-19](MVP/INFRA-19_BOX_CONFIG_IMAGE_FOR_A_FULLY_PULL_BASED_BOX.md) | A "box" config image and `sportconnect-setup`: a fourth image (`ghcr.io/mr-mittt/sportconnect-box`, private, built in CI from an allow-list with both Keycloak JARs built inside, checked by `verify-box-image.sh` before any push) holds the box's non-secret files; `sportconnect-setup` pulls and installs it with validation (`caddy validate`, `docker compose config`), a fixed install order and a restore on failure, and never restarts Keycloak; released `0.1.0` and `0.1.1`, promoted with `promote.yml` (component `box`); proven on the live box and on a fresh A1 (box-prepare with the OCI CLI, fetch-secrets, setup, rotation, deploy, a real failure and restore); two defects found and fixed (`start-stack.sh` waited forever for Keycloak on a new box; `CADDY_PROBE_URL=""` never skipped the probe). Not proven (written in the ticket): a Compose change that recreates a container, retention deleting a version, the realm steps and the restore on a fresh box; the manual `tar` bundle stays as the fallback (guide section 3) | `DONE` |
| 3 | [INFRA-15](MVP/INFRA-15_VERIFY_SERVER_IMAGE_WORKFLOW_ON_GITHUB.md) | Verify the image workflows on GitHub and the box: pull-request runs, version and path filters, master-only refusal, the rebuild-a-release procedure (chat, one then both platforms), the PostGIS workflow, the promote refusals, the failure path with restore on the A1 box; only the retention deletion, a failed-CI refusal and a Go bump are not provable yet (written down in the ticket) | `DONE` |
| 4 | [INFRA-12](MVP/INFRA-12_SPIKE_ORACLE_ALWAYS_FREE_HOSTING.md) | Oracle hosting spike and the move to the Always Free A1 box (arm64): GO decided 2026-10-27; since 2026-11-02 production runs on the A1 box (2 OCPU / 12 GB, arm64). A release builds amd64 and arm64 into one tag (an ordinary merge builds nothing), our own PostGIS 3.6 image replaces the amd64-only official one, the data was restored from the bucket (PostGIS 3.4.3 into 3.6.4), the same release was deployed on both architectures, the load test and the standard box switch (guide section 17, quick variant) ran, and the backups moved to A1; the x86 box is stopped (terminating it, the Brevo key and INFRA-20 stay open) | `DONE` (2026-11-02) |
| 5 | [INFRA-11](MVP/INFRA-11_EMAIL_CONFIGURATION_IN_DEPLOYED_ENVIRONMENTS.md) | Email in the deployed environment: the ticket was rewritten around the box (`~/web/server.env` and `set-smtp.sh`, not GitHub Environments); the `prod` profile keeps mail out of `/actuator/health` (`management.health.mail.enabled: false`) so a mail outage cannot mark the server down or roll back a deploy; welcome and reset emails arrived and the reset link works (owner's word); the setting reaches the box with the next server release | `DONE` (2026-11-02) |
| 6 | [INFRA-10](MVP/INFRA-10_SWAGGER_AND_OAUTH_TOKEN_EXPOSURE_IN_DEPLOYED_ENVIRONMENTS.md) | Swagger UI and `/api-docs` in deployed environments: the `prod` profile no longer serves them (`springdoc.*.enabled=false`) and `SecurityConfig` names them as public only while they are on, so an anonymous call gets the filter chain's 401; `oauth-token` was already removed by A28; tested with scoped integration tests and mutation checks; shipped as server `0.1.1` and checked on the box (`401`, owner's paste) | `DONE` (2026-11-01) |
| 7 | [INFRA-9](MVP/INFRA-9_INTERNAL_NETWORK_ISOLATION.md) | `/internal/**` network isolation: the Caddyfile now refuses `/internal/*` with a 404 as its first rule (before, it was unreachable only because no rule matched and it fell through to the client); the application's shared-secret check stays as the second layer; `verify-internal-isolation.sh` checks from outside (the `/internal` variants, paths not exposed, closed ports), 25 of 25 passed on the live site; first documented run of the Caddyfile change procedure on the box (the box steps: owner's word) | `DONE` (2026-11-01) |
| 8 | [INFRA-7](MVP/INFRA-7_REVERSE_PROXY_PATH_ROUTING_FOR_SERVICES_CHAT.md) | Reverse proxy for chat: `infra/oracle/Caddyfile` adopted as the production proxy config (comments only: production header, no access log for the `?token=` chat socket); chat and STOMP WebSockets proven through Caddy (handshakes from outside; live push, 2 minutes idle, RabbitMQ relay, origins on the box: owner's word); chat path in the ticket corrected to `/api/chat/conversations/{id}/ws` | `DONE` (2026-10-30) |
| 9 | [INFRA-6](MVP/INFRA-6_DEPLOYMENT_PIPELINE.md) | Deployment pipeline: pull-based and manual. `promote.yml` (component + version, checks, CI result, no older version, `production` Environment approval, then retags `prod`), the box command `sportconnect-deploy` (plan, pull, server then chat then client files, health probes, restore-everything on failure, log), `run-containers.sh` became `start-stack.sh`, `server.Dockerfile` deleted, image `description` labels, hardened run flags; the GitHub and box runs are INFRA-15 conditionals; follow-ups INFRA-17, INFRA-18, CHAT-22 | `DONE` |
| 10 | [INFRA-8](MVP/INFRA-8_SERVICES_CHAT_DOCKERFILE_PUBLISH_WORKFLOW.md) | Chat image: `services/chat/Dockerfile` fixed (Go version from `go.mod`, distroless `nonroot`, stamped version, OCI labels), the chat version in `services/chat/VERSION` (`chat-version.sh`, tags `chat-vX.Y.Z`), `chat-image.yml` (same release and retention rules as the server and client images), chat in `/release`; the GitHub-side checks are INFRA-15 | `DONE` |
| 11 | [INFRA-5](MVP/INFRA-5_CLIENT_STATIC_BUILD_S3_CLOUDFRONT_DEPLOY.md) | Client image: `client/Dockerfile` (the static build, Keycloak URL baked in, served by the box's Caddy), the client's own version in `client/package.json` (`client-version.sh`, tags `client-vX.Y.Z`), `client-image.yml` (same release and retention rules as the server image), the client in `/release`; the GitHub-side checks are INFRA-15 | `DONE` |
| 12 | [INFRA-4](MVP/INFRA-4_SERVER_DOCKERFILE_GHCR_PUBLISH_WORKFLOW.md) | Server Dockerfile + GHCR publish workflow with versioning: `server/Dockerfile`, one monolith version in `gradle.properties`, `server-version.sh` and `server-image.yml` (merging a version bump releases `X.Y.Z`/`latest`, any other merge pushes `sha-`/`edge`), retention; the GitHub-side checks are INFRA-15 | `DONE` |
| 13 | [INFRA-13](MVP/INFRA-13_KEYCLOAK_IN_COMPOSE_AND_REALM_AS_CODE.md) | Keycloak 26 in the dev Compose stack with the realm as a committed import (5-min access token, audience mapper, optional email/names, en/vi, no secrets), Mailpit mail sink, idempotent `keycloak_dev` bootstrap script | `DONE` |
| 14 | [INFRA-1](MVP/INFRA-1_BACKEND_CI_WORKFLOW.md) | Backend CI workflow (`server-ci.yml`) | `DONE` |
| 15 | [INFRA-2](MVP/INFRA-2_DEV_DOCKER_COMPOSE.md) | Dev environment docker-compose | `DONE` |
| 16 | [INFRA-3](MVP/INFRA-3_HOSTING_DECISION.md) | Oracle foundation: the production VM built from the runbook and serving `yoursport.vn`, nightly backups to Object Storage (the AWS plan was superseded 2026-10-27); resources in `INFRA-3_ORACLE_RESOURCES.md` | `DONE` |

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
