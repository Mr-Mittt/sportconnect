# Hosting decision — AWS free tier, single EC2 + RDS

**Date:** 2026-07-08
**Status:** Agreed (discussion between repo owner + Claude, unblocking INFRA-3)
**Supersedes:** the "blocked on a hosting decision" note on INFRA-3 in `BACKLOG_MVP.md`

---

## Decision

**Provider:** AWS, free-tier-first (this is a solo/learning project — cost avoidance drives every
choice below, not scalability).

**Runtime shape:** one EC2 instance running Docker directly (no ECS/Fargate, no Kubernetes):

| Component | Where it runs |
|---|---|
| Spring Boot server (image from GHCR) | Docker container on the EC2 instance |
| Redis | Docker container on the same EC2 instance (self-hosted, not ElastiCache) |
| Nginx or Caddy | Reverse proxy on the EC2 instance — TLS via Let's Encrypt, replaces an ALB |
| PostgreSQL + PostGIS | **RDS PostgreSQL** (managed) — PostGIS extension is supported on RDS |
| Client static build | **S3 + CloudFront** — build artifact from `client/`, not served off the EC2 box |
| Container registry | **GHCR** (already free/unlimited for this repo) — no ECR |
| Deploy credentials | **GitHub OIDC → AWS IAM role** — no long-lived AWS keys in repo secrets |

**Environments:** only **production** is deployed to AWS for now. `dev` and `staging` stay
local-only via `infra/docker-compose.dev.yml` (INFRA-2) — standing up multiple AWS environments
would immediately blow the free tier (see below), and there's no team/QA need for a hosted
staging environment yet. The `dev`/`staging`/`production` GitHub Environments concept from
`INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2 is deferred to just `production` until that changes.

## Why this shape (what free tier actually covers)

AWS Free Tier (12 months from account creation, new account):

- **EC2** — 750 hrs/mo t2/t3.micro (1 vCPU, 1GB RAM). Enough for one instance running the server
  + Redis containers full-time.
- **RDS PostgreSQL** — 750 hrs/mo db.t3.micro, 20GB, single-AZ. PostGIS extension installable.
  750 hrs/mo ≈ one instance running continuously — **not** enough for three separate RDS
  instances (dev/staging/prod), which is the main reason multi-environment AWS hosting is out of
  scope for now.
- **S3** — 5GB storage; **CloudFront** — 1TB egress + 10M requests/mo. Comfortably covers the
  client static build at this traffic level.

## Explicit exclusions (things that would silently cost money)

- **ALB** — not free (~$16+/mo minimum). Using Nginx/Caddy on the EC2 box for TLS instead.
- **ElastiCache** — free-tier availability for Redis has been inconsistent/mostly withdrawn.
  Self-hosting Redis as a container avoids this entirely.
- **NAT Gateway** — not free (~$32+/mo). Avoided by not requiring the DB to route through one.
- **ECS Fargate compute** — never free regardless of tier. If containers are orchestrated at all,
  it's plain `docker run`/compose on the EC2 instance, not Fargate.
- **Multi-AZ RDS, autoscaling, k8s** — all out of scope; revisit only if real traffic demands it.

## Known limit

The 12-month free tier is a **per-account clock starting at account creation**, not indefinite.
After it lapses, this same shape reverts to standard pricing (roughly $15–20/mo for the EC2 +
RDS pair). Revisit the hosting decision before/at that point rather than being surprised by a
bill — no action needed now, just noting it so it isn't forgotten.

## Alternatives considered (and passed on)

Surveyed after the AWS decision, to record why they weren't picked instead — so this doesn't get
re-litigated from scratch later:

| Option | Why not |
|---|---|
| **Oracle Cloud "Always Free"** | The closest AWS equivalent — permanently free ARM compute (4 OCPUs/24GB RAM) generous enough to self-host the server, Postgres+PostGIS, and Redis together, no 12-month clock. Real blocker: ARM capacity is frequently unavailable for new signups ("out of host capacity" errors) since the free pool is a limited, oversubscribed physical allocation, not elastic cloud capacity. Worth revisiting if AWS's 12-month clock becomes a real cost concern. |
| **Azure** | Same shape as AWS (12-month free VM), plus a free Postgres Flexible Server SKU — but three separate free-tier clocks to track across services instead of one. No clear advantage over AWS. |
| **Google Cloud** | Cloud Run compute is genuinely always-free, but Cloud SQL (managed Postgres) has **no free tier at all** — billed from day one. The database is the one piece this app can't skip, so GCP doesn't actually solve the problem. |
| **Render** | Free web service + free Postgres, but the free Postgres is **auto-deleted after 30 days** — fine for a demo, not for anything meant to stay up. |
| **Supabase (DB) + Vercel (client)** | Supabase ships PostGIS enabled by default on its free tier — best-in-class free Postgres+PostGIS fit — and Vercel's free static hosting is excellent. Neither hosts a long-running JVM process, though, so this only solves 2 of 3 pieces; would still need a separate compute host. |
| **Fly.io / Railway** | Both commonly recommended, both no longer offer a real free tier: Fly.io ended no-card free allowances for new orgs in 2024 (now requires a payment method); Railway retired its unlimited free plan in 2023 (one-time trial credit only, then usage-based). |
| **Self-host on a personal laptop** | Genuinely $0 and technically workable (Cloudflare Tunnel solves the CGNAT/no-public-IP problem most home ISPs create), but the risk profile is different in kind, not degree: a compromised laptop has your actual files on it (vs. a disposable cloud VM), uptime depends on the machine never sleeping/rebooting, and there's no failover. Reasonable for a dedicated spare machine hosting a low-stakes demo; not something to point real users' trust at. |

## What this unblocks

INFRA-3 (as originally scoped, "deployment pipeline") is split into four tickets on
`BACKLOG_MVP.md` following the artifact-scoped vs. environment-scoped placement rule from
`INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1:

- **INFRA-3** — AWS foundation (EC2 + RDS + S3/CloudFront + IAM OIDC role), environment-scoped,
  provisioning docs/scripts in `infra/`
- **INFRA-4** — server Dockerfile + GHCR publish workflow, artifact-scoped in `server/`
- **INFRA-5** — client static build + S3/CloudFront deploy, artifact-scoped in `client/`
- **INFRA-6** — `deploy.yml` orchestration workflow tying the above together (pull image onto
  EC2, run Liquibase migrations, restart container, invalidate CloudFront cache), in
  `.github/workflows/` with logic in `infra/scripts/`

---

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
