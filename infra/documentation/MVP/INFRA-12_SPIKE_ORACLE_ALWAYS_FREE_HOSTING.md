# INFRA-12 · Spike: can the whole stack run on Oracle Cloud Always Free (and Keycloak with it)?

**Status:** `IN PROGRESS` · **Type:** Infrastructure (spike / hosting decision) · **Dependency:** none · **Gates:** INFRA-3..6 (and INFRA-7/8/9, which assume the AWS EC2 box)

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

Step-by-step record of what was done: `INFRA-12_ORACLE_INSTANCE_SETUP_LOG.md`.

**Run 1 (2026-10-26), credit-funded sandbox, not the Always Free test.**

- **Point 1 (capacity):** `VM.Standard.A1.Flex` failed with "Out of host capacity" in AD-1, the only availability domain in the home region. The console also allowed only 1 OCPU for A1, so the allowance on this account is below the 2 OCPU / 12 GB on Oracle's page; the Limits page has not been checked yet. Always Free compute cannot move to another region.
- **Sandbox:** `VM.Standard.E3.Flex`, 2 OCPU / 12 GB, Ubuntu 24.04, paid from the trial credit. Docker 29.9.2 and Compose v5.6.1 installed; ports 80 and 443 verified from outside.
- **Point 6 (public HTTPS):** the network path (security list, route table, iptables) is proven by HTTP 200 on 80 and 443. Domain, DNS and Let's Encrypt are still open.
- **Point 4 (whole stack, partial):** the dev Compose stack plus server and chat ran on the sandbox. Idle containers total about 1.5 GiB (server 686 MiB, Keycloak `start-dev` 566 MiB, RabbitMQ 136 MiB, Postgres 75 MiB, the rest under 10 MiB); the host showed 9.6 GiB available of 11.9 GiB. Start-up: server 17.5 s, Keycloak 27.8 s. The load was very light and unauthenticated, Keycloak was in dev mode and the CPU was x86_64, so this says the idle stack is small, not that peak load fits. Details and caveats: the setup log.
- **Point 6 (public HTTPS): verified.** `yoursport.vn` and `www.yoursport.vn` resolve to the box; Caddy obtained Let's Encrypt certificates for both in about 3 s; HTTPS returns 200 with a trusted certificate (valid to 2027-01-24), `http://` redirects with 308, the SPA route works. Checked from the owner's PC, outside Oracle. Caddy: 16 MiB idle.
- **Keycloak in production mode on the box (feeds INFRA-14):** started with `start` and `KC_HOSTNAME=https://auth.yoursport.vn` behind Caddy, certificate from Let's Encrypt, admin console and `master` realm blocked from the internet at the proxy, default admin password replaced. The authorization endpoint accepts the web client with the production redirect, rejects a `localhost` redirect with 400 and enforces PKCE. Not done: the sign-in cannot complete until `/api` is proxied; the realm's production redirect URIs were set through the admin API only (not in a script or the realm file; INFRA-14 must decide how); the production-only realm scripts and real provider secrets were not applied.
- **Public `/api` with the `prod` profile (done, steps 47 to 56 of the setup log):** server (`prod`), chat and Caddy run on the Compose network; Caddy proxies `/api`, `/api/chat` (prefix stripped), `/ws` and `/images` from `https://yoursport.vn`; `/actuator`, `/internal` and Swagger are not proxied. Through the public domain `/api/reference/countries` returns real data, `/api/chat/healthz` 200, `/api/users/me` without a token 401. The backing services listen on `127.0.0.1` only, random secrets replace the internal-service and credentials-client secrets. **Findings:** the `prod` health goes `DOWN` without SMTP credentials (Delta on INFRA-11); chat needs `REDIS_ADDR` (it defaults to `localhost`); chat's start-up bootstrap fails if it starts before the server (Docker restarts it until the server is up). **Not verified:** a real sign-up and sign-in (the owner must do it; Claude does not create accounts on a non-test host), the WebSocket upgrades, real email.
- **Google sign-in on the sandbox (steps 57 to 60):** the provider was disabled with placeholders (the realm file's state) until `realm-google-provider.mjs api` was run through an SSH tunnel with the owner's Google client; the owner had registered `https://auth.yoursport.vn/realms/sportconnect/broker/google/endpoint` at Google. The login page now has the Google link and Google answers with its sign-in page, no redirect mismatch. Not done: an actual Google sign-in. Keycloak's host root now redirects to `/login`. The long Keycloak sign-in URLs cannot be shortened (per-request PKCE and session state).
- **Point 10 (outbound email, partial; steps 61 to 65):** provider chosen: Brevo free plan (about 300 a day, SMTP relay, port 587; Oracle blocks 25). `yoursport.vn` (DNS at iNET) has Brevo's verification TXT, DMARC and two DKIM CNAMEs resolving. Keycloak's realm SMTP and the server's `MAIL_*` now point at `smtp-relay.brevo.com:587` with `noreply@yoursport.vn`, and the server's `/actuator/health` is UP with the mail health check **on** (it logs in to the SMTP server, so the login works). **Not proven:** a message actually delivered, its spam placement, and Brevo's own "authenticated" status. The SMTP key was pasted in chat and must be revoked and replaced.
- **Point 9 (latency): inconclusive, with a warning.** TCP round trip about 150 to 200 ms, but the same 490 KB gzipped JS took 1.6 s on some runs and 17 s on others (identical connect, TLS and first-byte times), so the stall is in the transfer path from this PC, cause unproven. Needs more locations and times, and the Cloudflare-in-front test, before it can count for or against Oracle.
- **Client (earlier run over plain HTTP):** the production build is 1.8 MB (one 1.66 MB JS chunk, 468 kB gzipped by Vite; 52 s to build). Caddy serves it from the box at 11.6 MiB idle. From the owner's PC the TCP round trip was about 150 ms and the gzipped JS (490 KB) took 1.06 s over plain HTTP, so a CDN is optional for now. Not tested: HTTPS and a domain, the `/api` proxy, other locations, a Cloudflare CDN.
- **Side finding:** `services/chat/Dockerfile` does not build (Go 1.22 image, `go.mod` needs 1.25). Recorded as a Delta on INFRA-8.
- **Point 4 (load, read-only; setup log step 72):** on the 2 OCPU x86 sandbox, 400 concurrent users with no pauses against `/api/reference/countries` gave 1,550 requests/s (median 38 ms, p95 330 ms, 0 failures); static `/` gave 4,895/s (p95 118 ms, 0 failures); `/api/chat/healthz` gave 2,729/s (p95 190 ms, 146 of 750,493 failed, cause not looked at). CPU was the limit (Caddy up to 378% of 400%, server 186%); memory stayed small (server 944 MiB at most, 8.7 GiB still available). **Not covered:** authenticated traffic, feed, Discover, WebSocket, Keycloak token logins, ARM cores; the load generator shared the box.
- **Owner checks (2026-10-27):** the Keycloak admin console works through the tunnel, and a real sign-up and sign-in on `https://yoursport.vn` worked.
- **Limits (2026-10-27):** the tenancy's A1 core limit is 16 in `ap-melbourne-1` (`standard-a1-core-regional-count`, 0 used), so the 1 OCPU on the create form was not the account limit; the blocker is host capacity in AD-1 (the region's only availability domain). Only 4 OCPU / 24 GB of A1 is free.
- **Point 10 (email), delivered:** the owner confirmed a message from `noreply@yoursport.vn` reached an inbox (2026-10-27). Spam-folder behaviour on other providers is not checked.
- **Decision (owner, 2026-10-27): A1 is not available, so the next infra tickets (INFRA-3..9, 14) are planned and built on x86 (`VM.Standard.E3.Flex`). A1 is reconsidered when capacity appears; the runbook and scripts are meant to make that move a rebuild plus the same load test.** The x86 shape is paid after the trial credit ends (about 2026-11-25).
- **Point 8 (deploy access) decided (owner, 2026-10-27): pull-based deploys through GHCR.** CI pushes images and moves a `prod` tag from a protected workflow; the box pulls and restarts. Written into INFRA-6 as a Delta.
- **Secrets approach decided (owner, 2026-10-27):** root-owned env files on the box plus an inventory doc and an encrypted backup first; OCI Vault (instance principal) in INFRA-14, free allowance still to confirm, SOPS + age as the fallback. Written into INFRA-14 as a Delta.
- Everything else is open. No go/no-go written yet.

## Decision (2026-10-27)

**GO on Oracle Cloud, on x86 (`VM.Standard.E3.Flex`) for now. Always Free A1 is reconsidered when Oracle has capacity.** Decided by the owner on the evidence above. This is not "Oracle Always Free": the x86 shape is paid once the trial credit ends (about 2026-11-25), roughly $50 a month at 2 OCPU / 12 GB (list-price estimate from memory, to be confirmed on Oracle's price list).

| # | Point | Result |
|---|---|---|
| 1 | A1 capacity | **Failed** (no host capacity in the region's only availability domain); the 16-core A1 limit is fine. Revisit later. |
| 2 | PostGIS on arm64 | **Not tested** (no A1 box). Check the image manifest before any A1 move. |
| 3 | arm64 builds | **Not tested.** Same. |
| 4 | Whole stack, real numbers | **Done on x86:** idle about 1.5 GiB of containers; 400 concurrent users, read-only, 0 to 0.01% failures, CPU-bound (Caddy/TLS first). **Not covered:** authenticated traffic (feed, Discover, WebSocket, Keycloak logins), ARM. |
| 5 | Idle reclamation | **Open**, moot while the paid x86 shape is used. |
| 6 | Public HTTPS | **Done and verified** (`yoursport.vn`, `auth.yoursport.vn`, Let's Encrypt). |
| 7 | Backups | **Open.** No backups exist. Must be done before real users (INFRA-14). |
| 8 | Deploy access | **Decided:** pull-based through GHCR (INFRA-6 Delta). |
| 9 | Latency | **Inconclusive, open.** |
| 10 | Outbound email | **Done:** Brevo free plan; a message reached an inbox. |

Also proven on the sandbox: Keycloak in production mode behind Caddy, Google sign-in, a real sign-up and sign-in by the owner, and the admin console through an SSH tunnel.

**Risks accepted with this decision:** no backups yet; authenticated load unmeasured; one box, no redundancy; dev-grade passwords on the backing services (loopback-only); a monthly bill after the trial; latency unproven.

**To close this ticket (Done when):**
- [ ] `INFRA-3_HOSTING_DECISION.md`: mark the Oracle amendment *Agreed* (x86 now, A1 later) and update its alternatives table.
- [ ] File the rewrite of INFRA-3, INFRA-4, INFRA-5 and INFRA-6 for Oracle as real backlog entries, and re-check INFRA-7, INFRA-8, INFRA-9 (INFRA-6 and INFRA-14 already carry Deltas from 2026-10-27).
- [ ] Revoke/replace the Brevo SMTP key and rotate the Keycloak admin password (both were pasted in chat).
- [ ] Terminate the sandbox and its boot volume when it is no longer needed, or turn it into the real INFRA-3 box on purpose.
