# INFRA-12 · Spike: can the whole stack run on Oracle Cloud Always Free (and Keycloak with it)?

**Status:** `TODO` · **Type:** Infrastructure (spike / hosting decision) · **Dependency:** none · **Gates:** INFRA-3..6 (and INFRA-7/8/9, which assume the AWS EC2 box)

**Filed:** 2026-10-13, from a `/feature` discussion on "login with Google, Facebook and Zalo". Keycloak (or any extra process) does not fit the 1 GB AWS free-tier EC2 box planned in `INFRA-3_HOSTING_DECISION.md`. The repo owner has since created an Oracle Cloud Always Free account. Oracle's Always Free page (read 2026-10-13) lists an Arm Ampere A1 allowance of **2 OCPU / 12 GB**, 200 GB block storage and 10 TB/month egress, which on paper holds the whole stack with room to spare. This ticket turns "on paper" into a measured go/no-go before any AWS ticket is built.

## What

Stand up one A1 instance and prove or disprove each point below. Record the numbers in a **Findings** section of this file.

1. **Capacity.** Create a `VM.Standard.A1.Flex` instance (Ubuntu, 2 OCPU, 12 GB) in the home region. Record the region, which availability domains were tried, and any "out of host capacity" errors.
2. **PostGIS on arm64.** Confirm the image we use (`postgis/postgis:16-3.4`, as in `infra/docker-compose.dev.yml`) runs on arm64, or pick and record a working alternative. Check that Liquibase migrations apply cleanly.
3. **Multi-arch images.** Build `server` and `services/chat` for `linux/arm64` (buildx). Record build time under QEMU in GitHub Actions and whether a native arm runner is an option.
4. **Whole stack in Compose, with real numbers.** Postgres+PostGIS, Redis, RabbitMQ, server, chat, Caddy, plus Keycloak with its own Postgres schema as an optional extra. Record `docker stats` idle and under light load, startup time, and the headroom left of the 12 GB.
5. **Idle reclamation.** Oracle may reclaim an idle Always Free instance (7 days: CPU, network and memory all under the thresholds on its page). Determine from Oracle's docs whether upgrading to Pay-As-You-Go removes this while keeping Always Free resources free, and what the stack's real utilisation is against the thresholds.
6. **Public HTTPS.** Domain, DNS, Caddy with Let's Encrypt, OCI security list (80/443). Verify from outside Oracle.
7. **Backups.** A scheduled `pg_dump` to Object Storage (20 GB free) plus a restore test. Record what the 5 free volume backups add.
8. **Deploy access without AWS OIDC.** There is no GitHub-OIDC-to-IAM equivalent here. List the options (SSH key as an environment secret, pull-based updater on the box, a bastion/tailnet) and which one stays closest to the "no long-lived credentials in the repo" rule in `INFRASTRUCTURE_LAYOUT_AND_CICD.md`.
9. **Latency.** Round-trip from Vietnam to the chosen region, and whether Cloudflare's free CDN in front of Caddy is enough in place of CloudFront.
10. **Outbound email.** Port 25 is blocked by default; confirm the email module's SMTP provider works from the box.

## Out of scope

Migrating anything real; rewriting INFRA-3..9 (done only on a "go", see below); the Keycloak vs custom JWT decision (auth module — this spike only measures whether Keycloak fits); a Zalo provider.

## Done when

Findings are written here with a go / no-go, and `INFRA-3_HOSTING_DECISION.md`'s amendment is resolved:

- **Go** → mark the amendment *Agreed*, update the Oracle row in its alternatives table, and file the rewrite of INFRA-3..6 (and re-check INFRA-7/8/9) against Oracle as real backlog entries before closing this ticket.
- **No-go** → record why in the hosting decision, keep the AWS plan, and note that any extra service (Keycloak, RabbitMQ) still needs more than the 1 GB box.

## Findings

_Not started._
