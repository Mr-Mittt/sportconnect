# Hosting decision — Oracle Cloud, one x86 instance (Always Free A1 later)

**Date:** 2026-07-08 (first decision: AWS) · **Amended 2026-10-27:** Oracle Cloud, after the INFRA-12 spike
**Status:** Agreed (repo owner + Claude). The AWS shape of 2026-07-08 is superseded; its record is kept below.
**Evidence:** `INFRA-12_SPIKE_ORACLE_ALWAYS_FREE_HOSTING.md` (findings and decision), `INFRA-12_ORACLE_INSTANCE_SETUP_LOG.md` (every step), `INFRA-12_ORACLE_SANDBOX_RUNBOOK.md` (how to rebuild)

---

## Decision

**Provider:** Oracle Cloud Infrastructure, region `ap-melbourne-1` (the account's home region, one availability domain).

**Runtime shape:** one VM running Docker Compose (no managed database, no Kubernetes). **x86 now** (`VM.Standard.E3.Flex`, 2 OCPU / 12 GB, Ubuntu 24.04). The Always Free Ampere A1 (arm64) shape is the preferred home but had **no host capacity** during the spike, so it is reconsidered when capacity appears: the scripts and runbook make that a rebuild plus the same load test.

| Component | Where it runs |
|---|---|
| Caddy | Container on the VM, ports 80/443, automatic Let's Encrypt, serves the static client and proxies `/api`, `/api/chat`, `/ws`, `/images`; Keycloak on its own host name with the admin paths blocked |
| Spring Boot server (`prod` profile), chat (Go) | Containers on the VM (images from GHCR once INFRA-4/8 exist) |
| PostgreSQL + PostGIS, Redis, RabbitMQ | Containers on the VM, published on `127.0.0.1` only |
| Keycloak (production mode) | Container on the VM (INFRA-14 hardens it) |
| Client static build | Served by Caddy from the VM (no CDN for now; Cloudflare in front is an option if latency needs it) |
| Container registry | **GHCR** |
| Deploy | **Pull-based**: the VM pulls new images from GHCR (INFRA-6), no inbound deploy path and no cloud credentials in GitHub |
| Email | Brevo free plan over SMTP (Oracle blocks outbound port 25) |
| Backups | Nightly `pg_dump` of the three databases and an archive of the Caddy certificates to an Object Storage bucket, 7 days kept (this ticket) |
| Secrets | Root-owned files on the VM now; OCI Vault in INFRA-14 |

**Environments:** only **production** is hosted. `dev` and `staging` stay local via `infra/docker-compose.dev.yml` (INFRA-2).

## Cost and known limits

- The x86 shape is **paid**. It runs on the trial credit until about **2026-11-25**, then bills: roughly **$50 a month** at 2 OCPU / 12 GB (list-price estimate from memory, to be confirmed). Set a budget alert. Always Free A1 (up to 4 OCPU / 24 GB) costs nothing when it can be had; the tenancy's A1 core limit is 16, so capacity is the only blocker.
- Single VM: no redundancy, no managed database. Backups are ours (this ticket).
- Measured on the sandbox (x86, 2 OCPU): idle stack about 1.5 GiB of containers; 400 concurrent read-only users answered with CPU, not memory, as the limit. Authenticated traffic, Discover/feed load and ARM are not measured (see the INFRA-12 decision).
- Idle reclamation applies to Always Free instances only (relevant when A1 is used).

## Explicit exclusions

No managed Kubernetes, no managed database service, no load balancer, no second VM, no multi-region. Revisit only if real traffic demands it.

## Superseded: the AWS decision (2026-07-08)

AWS free tier, one EC2 instance (Docker + Nginx/Caddy + self-hosted Redis) with RDS PostgreSQL/PostGIS, the client on S3 + CloudFront, GitHub OIDC to an IAM role for deploys. It was dropped because the 1 GB free-tier EC2 box cannot hold RabbitMQ, the chat service and Keycloak (needed for social login), and its free tier lapses after 12 months (about $15–20 a month for the EC2 + RDS pair after that, before adding anything). Nothing was ever provisioned on AWS.

## Alternatives considered (and passed on)

| Option | Why not |
|---|---|
| **AWS free tier (single EC2 + RDS)** | The 2026-07-08 choice, superseded above. 1 GB RAM is too small for the whole stack; 12-month clock. |
| **Oracle Always Free A1 (arm64)** | The preferred home (free, 4 OCPU / 24 GB allowed), but "out of host capacity" in the region's only availability domain during INFRA-12. Reconsidered when capacity appears. |
| **Azure** | Same shape as AWS (12-month free VM) with several separate free-tier clocks. No advantage. |
| **Google Cloud** | Cloud Run is free but Cloud SQL (managed Postgres) has no free tier; the database is the one piece this app cannot skip. |
| **Render** | The free Postgres is auto-deleted after 30 days. |
| **Supabase (DB) + Vercel (client)** | Excellent free Postgres+PostGIS and static hosting, but nothing hosts a long-running JVM, so it solves only two of three pieces. |
| **Fly.io / Railway** | No real free tier any more. |
| **Self-host on a personal laptop** | Free, but a different risk profile: uptime depends on the machine, and a compromised laptop holds personal files. |

## What this changes

INFRA-3 (this file's ticket, below) is rewritten for Oracle, and INFRA-4..9 and INFRA-14 carry Deltas for it:

- **INFRA-3** — Oracle foundation: the production box built from the runbook, nightly backups (this ticket)
- **INFRA-4** — server Dockerfile + GHCR publish workflow (an x86 image now; arm64 when A1 comes)
- **INFRA-5** — client static build served by Caddy (no S3/CloudFront)
- **INFRA-6** — pull-based deploy through GHCR (not OIDC/SSM)
- **INFRA-7/8/9** — chat routing (already done in the sandbox Caddyfile), chat image publish, `/internal` isolation (security list + Caddy instead of a security group)
- **INFRA-14** — production Keycloak, the secrets store (OCI Vault), the dev-grade leftovers

---

**Status:** `DONE` (2026-10-28) · **Type:** Infrastructure (cloud provisioning) · **Dependency:** INFRA-12 (decided: go on Oracle x86)
**Spec:** this file

## INFRA-3 · Oracle foundation

Scope agreed with the owner on 2026-10-27 (the AWS body of this ticket is superseded).

**In scope**
- This decision document: Oracle *Agreed*, the alternatives table, the layout doc and the backlog index updated.
- The production box, built **fresh from the runbook** (`INFRA-12_ORACLE_SANDBOX_RUNBOOK.md` and `infra/oracle/`), which has never been run end to end: VCN and security list (22/80/443), the instance, DNS (`yoursport.vn`, `www`, `auth`), firewall, Docker, Caddy with Let's Encrypt, the production-style Compose stack. The runbook and scripts are fixed wherever the rebuild shows them wrong. Then the INFRA-12 sandbox instance and its boot volume are retired.
- **Backups:** `infra/oracle/scripts/backup-postgres.sh` (nightly `pg_dump -Fc` of `sportconnect_dev`, `sportconnect_chat_dev` and `keycloak_dev`, plus a tar of the `caddy_data` volume, to an Object Storage bucket by instance principal), `restore-test.sh` (restores the newest set into scratch databases and checks a key table in each), a systemd timer at 19:00 UTC (02:00 in Vietnam), and `install-backup.sh`. **Retention: 7 nightly sets, kept 7 days by a bucket lifecycle rule** (owner's decision). Database names stay unchanged (renaming belongs to INFRA-14). Not encrypted by us beyond Oracle's encryption at rest (INFRA-14).
- Exact resource names, region and OCIDs (no secrets) recorded in `infra/documentation/`, so INFRA-4..9 have concrete targets.
- `infra/documentation/PORTS.md` and `INFRASTRUCTURE_LAYOUT_AND_CICD.md` updated for the Oracle shape.
- Deltas filed in INFRA-4, 5, 7, 9, and in `modules/email` E2 and `services/chat` CHAT-16, which named AWS.

**Out of scope**
- Image build and publish (INFRA-4, INFRA-8), the client deploy (INFRA-5), the deploy pipeline and pull-based updater (INFRA-6), chat path routing (INFRA-7), `/internal` isolation (INFRA-9), Keycloak production hardening and the secrets store (INFRA-14).
- A1 / arm64, any redundancy or second box.

**Owner's console work** (the box authenticates with its instance principal, so there is no key to store): the Object Storage bucket (private) with a 7-day lifecycle rule that deletes objects older than 7 days; a dynamic group matching the instance; an IAM policy letting that group manage objects in that bucket. The steps are in the runbook.

**Constraints and risks:** paid after the trial credit (budget alert); single box; secrets in root-owned files until INFRA-14; the rebuild briefly runs two paid instances on the trial credit.

**Progress:** `INFRA-3_ORACLE_REBUILD_LOG.md` (step by step, with real results).

**Known, parked (2026-10-28, owner's call):** the first fresh box built for this ticket refused the SSH key (`Permission denied (publickey)`) hours after a working first session, and the Oracle Cloud Agent "Run command" stayed `Accepted` and never ran; the cause is unknown (rebuild log, row 15). It is not investigated now. If a box ever refuses a key that worked before, look at it then: the instance console history and boot log first, and whether `authorized_keys` changed. It has not happened on the box now in production.

**Done when:** a fresh box built from the runbook serves `https://yoursport.vn` and `https://auth.yoursport.vn`; a backup has been uploaded to the bucket and restored into scratch databases from the bucket; the 7-day lifecycle rule is in place; this decision is resolved (it is); the sandbox is retired; the Deltas above are filed.
