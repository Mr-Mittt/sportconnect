# INFRA-12 · Oracle hosting spike and the move to the Always Free A1 box (arm64): multi-arch images, the A1 rebuild, cutover

*Renamed 2026-11-02 (was: "Spike: can the whole stack run on Oracle Cloud Always Free (and Keycloak with it)?"). The spike answered GO on 2026-10-27; since A1 capacity appeared the ticket also carries the move to the A1 box (see the scope change at the end). The file name keeps the old wording so existing links work.*

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
- [x] (done on branch `docs/infra-3-oracle-hosting-decision`, pending merge) `INFRA-3_HOSTING_DECISION.md`: mark the Oracle amendment *Agreed* (x86 now, A1 later) and update its alternatives table.
- [x] (done on the same branch: INFRA-3 body rewritten, Deltas in INFRA-4/5/6/7/9/14, email E2, chat CHAT-16) File the rewrite of INFRA-3, INFRA-4, INFRA-5 and INFRA-6 for Oracle as real backlog entries, and re-check INFRA-7, INFRA-8, INFRA-9 (INFRA-6 and INFRA-14 already carry Deltas from 2026-10-27).
- [ ] Revoke/replace the Brevo SMTP key and rotate the Keycloak admin password (both were pasted in chat).
- [ ] Terminate the sandbox and its boot volume when it is no longer needed, or turn it into the real INFRA-3 box on purpose.

## Scope change (2026-11-02): A1 capacity is available, so the ticket now includes the move

**Why:** the owner created a `VM.Standard.A1.Flex` box (Ampere Altra 3.0 GHz, **2 OCPU / 12 GB**) and asked to plan the move to it. Oracle's Always Free page (read 2026-11-02, via search) now lists **2 OCPU / 12 GB** of A1 in total, and community posts report the allowance was cut from 4 / 24 around 2026-08-18; the 4 OCPU / 24 GB in the 2026-10-27 Limits note is unverified and must not be relied on. An OCPU on A1 is one core without hyperthreading, so 2 OCPU is 2 vCPUs (the x86 box has 4).

**Now in scope:** spike points 1 to 3 on the A1 box (capacity: done by the owner; arm64 PostGIS, Keycloak, RabbitMQ, Redis, Caddy; multi-arch server, chat and client images), point 4 re-run on A1 (idle and load), the move itself by the rebuild-with-data sequence of `PRODUCTION_DEPLOYMENT_GUIDE.md` section 9, and retiring the paid x86 box. The approved plan is the next section.

**Still out of scope:** idle reclamation (moot once the box is on Pay-As-You-Go or the load is above the thresholds; to be noted, not measured), the latency and Cloudflare test, authenticated load tests beyond what the re-run of point 4 covers (to be filed as a follow-up).

## Plan for the move (approved 2026-11-02)

Rules decided with the owner: keep `linux/amd64` as a reference and a way back; **one multi-arch tag** (each box pulls the build for its own CPU, so `promote.yml` and `sportconnect-deploy` need no per-architecture names); an **ordinary merge to master builds and pushes nothing**; a **release builds both** `linux/amd64` and `linux/arm64`; a pull request builds amd64 only (native, nothing pushed); a manual run takes a `platforms` choice. The repo is private (2,000 free Actions minutes a month), which is why the emulated arm64 build runs only for releases.

- [x] **A. Images.** The three `*-image-plan.sh` print `build`; the three `*-image.yml` build only when told to and take `platforms`; guide section 15 and its history row. Tried locally: the plan scripts (pull request, ordinary merge, release by push and by dispatch, a branch refused). **Conditionals (GitHub only, INFRA-15 style):** the `platforms` dropdown, the workflow YAML itself (no `actionlint` here), the real arm64 build and its time under QEMU for each image, a first multi-arch release and its Promote, and that `sportconnect-deploy` reads the version and digest from a multi-arch tag (`docker buildx imagetools inspect` on an index; to be tried on a public multi-arch image first).
- [ ] **B. Build the A1 box, no cutover.** The owner gives the A1 IP, an `ssh` alias and the OCID. Runbook up to the stack start (`box-prepare.sh`, bundle, secrets, GHCR login, `start-stack.sh`); record which images do not start on arm64 (PostGIS `16-3.4` first; Keycloak, RabbitMQ, Redis, Caddy), Liquibase on arm64, start-up times; restore the newest bucket set (the first full restore from the bucket); check the stack from the box and from outside with a hosts-file override, DNS untouched.
- [ ] **C. Measure (point 4 on A1).** Idle memory and CPU, then the same read-only load test as on x86 so the two compare. The A1 box has 2 vCPUs against the x86 box's 4 (an OCPU on A1 is one core, no hyperthreads); say so in the result.
- [ ] **D. Cutover (owner steps).** A last backup from the old box; DNS for `yoursport.vn`, `www` and `auth`; after the Keycloak restore re-run `set-admin-pw.sh`, `set-credentials-client-secret.sh`, `set-master-frontend-url.sh` and check the Google provider, SMTP and the web redirect URI; the dynamic-group rule and bucket policy for the new instance OCID; the checks of guide section 10 from outside.
- [ ] **E. The x86 box.** Keep it stopped for a soak period the owner chooses, then terminate it with its boot volume (or terminate at once; the rebuild from the bucket and the multi-arch images is documented). Update `INFRA-3_ORACLE_RESOURCES.md`, the guide and its history, the rebuild log, and the "sandbox" wording in `PORTS.md` rows 39 and 40.
- [ ] **F. Close.** Findings and a final decision written here; the unclosed spike points (latency and the Cloudflare test, authenticated load, idle reclamation) are filed as INFRA-20 (done 2026-11-02); move INFRA-12 to Done.

**Risks.** Oracle reportedly cut the Always Free A1 allowance to 2 OCPU / 12 GB around 2026-08-18 and some instances were disabled: keep the x86 box and nightly backups until the A1 box has soaked, and do not resize or terminate the A1 box (capacity can vanish). A cutover needs a short write freeze. Secrets stay on the boxes only.

**Done when (added 2026-11-02):** the production site runs on the A1 box with the guide's section 10 checks passing from outside; a restore from the bucket onto a fresh box has been run for real; the x86 box is stopped or terminated by the owner's choice; the load numbers for A1 sit beside the x86 ones; the follow-up ticket for the unclosed points exists (INFRA-20, filed).

## Findings 2026-11-02 (from the registries, before the A1 box is built)

Read with `docker buildx imagetools inspect` from the owner's PC; nothing was run on arm64 yet.

- **Point 2 (arm64 images), what the box uses:** `redis:7-alpine`, `rabbitmq:3-management-alpine`, `caddy:2` and `quay.io/keycloak/keycloak:26.4` list `linux/arm64`. **`postgis/postgis:16-3.4` does not: it is a single amd64 image, and `16-3.5`, `16-3.6` and `16-master` list amd64 only too.** The database cannot start on the A1 box with the image the dev Compose file and the box use today.
- **Options for PostGIS on arm64 (owner decides, nothing changed yet):** (a) `imresamu/postgis:16-3.4` and `16-3.4-bookworm` list amd64 and arm64 (a community build, a third-party Docker Hub account on the data path, so a trust decision); (b) our own small image: `postgres:16` plus the Debian `postgresql-16-postgis-3` package (both architectures), built and published by the existing workflows, so the supply chain is ours; (c) wait for the official image. Whichever is chosen must be the same major PostGIS version as the data (3.4) or the dump restores into a different extension version: check `SELECT postgis_full_version()` on the x86 box first.
- **Deploy script on a multi-arch tag:** `ref_info` (the function in `sportconnect-deploy.sh` and `promote-check.sh`) was run on `quay.io/keycloak/keycloak:26.4`, a multi-arch image: it returned the index digest, the version label (`26.4.7`) and the revision label. So the digest and label reads work on a manifest list; no change to the scripts. Still to prove on one of our own images after the first multi-arch release.

## Decision and result 2026-11-02: our own PostGIS image (owner chose option b, PostGIS 3.6)

- **Decision:** `infra/postgis/Dockerfile` (`postgres:16` plus the PGDG `postgresql-16-postgis-3` package pinned to the 3.6 minor), published as `ghcr.io/mr-mittt/sportconnect-postgis:16-3.6` for amd64 and arm64 by `.github/workflows/postgis-image.yml`. The box's PGDG repo offers 3.6.3, 3.6.4 and 3.7.0, not 3.4.3, so the data (3.4.3) is restored into 3.6; the owner accepted the newer minor and asked that dev use 3.6 too (dev Compose now `postgis/postgis:16-3.6`; nothing else in the repo names a PostGIS image: the server tests use H2 and CI has no PostGIS container).
- **Result on the A1 box (point 2):** built natively on arm64 (965 MB, PostgreSQL 16.15), a scratch container created the extension and reported PostGIS `3.6.4`, and a geography distance between Ho Chi Minh City and Hanoi returned 1138 km. **Not yet run:** the restore of the real data into it, the GitHub workflow, the dev volumes upgrade.

## Progress on step B (2026-11-02)

Rows 1 to 13 of `INFRA-12_A1_MIGRATION_LOG.md`. Done: the A1 box prepared (Docker, firewall), arm64 images for Redis, RabbitMQ, Caddy and Keycloak pulled, our PostGIS 3.6 image built and run (3.6.4), the backing services started, the newest bucket set restored (first full restore from the bucket, PostGIS 3.4.3 data into 3.6.4, counts equal to the x86 box). Idle memory of the five containers is about 700 MiB; Keycloak is up in about 36 s on 2 Ampere vCPUs. **Still open in step B:** Caddy, the application (waits for the first multi-arch release), the outside checks with a hosts-file override. **Found on the way:** CRLF in a bundle cut on Windows (fixed in the guide); the backup timer must not be installed on a rehearsal box.

## PostGIS 3.6 on arm64: how it was proven (2026-11-02, point 2)

Log row 15. The application only stores `geography(Point, 4326)` and indexes it with GiST (no `ST_*` in the Java sources). Proof: the same 9-query battery gives identical output on arm64 3.6.4 and amd64 3.6.4; a 20,000-row geography table with a GiST index round-trips exactly, the planner uses the index, and indexed and unindexed counts agree; the real data (written by 3.4.3) restored into 3.6.4 with equal counts. One difference against the old x86 box: `ST_Transform` to VN-2000 (3405) moves by about 0.8 m because of the newer PROJ, not the CPU. **Still to do:** the application's own reads and writes of locations through the deployed server on the A1 box (after the first multi-arch release).

## Point 3 (multi-arch builds) result 2026-11-02

First release of all three images with both platforms (PR #396, log row 16): **Build (and push) times, owner's word:** client 6 m 28 s, chat 5 m 54 s, server 11 m 14 s, each with amd64 native and arm64 under QEMU on one `ubuntu-latest` runner. About 23.6 minutes of Actions per release of all three, so the 2,000 free minutes a month are not a constraint at this release rate, and a native arm runner is not needed. All three version tags list `linux/amd64` and `linux/arm64` in GHCR (read from the A1 box). **Still to prove:** that the images run: `sportconnect-deploy` on the A1 box (arm64) and on the x86 box (amd64, the reference), which also puts server `0.1.2`'s mail-health setting on a box for the first time.

## Deploys of the multi-arch release (2026-11-02, log rows 17 to 19)

`sportconnect-deploy` ran on both boxes with the same promoted versions (server `0.1.2`, chat `0.2.1`, client `0.1.1`): A1 (arm64) in 1 m 07 s, x86 (amd64, live) in 45 s, both healthy with no restarts. One tag per version served each box its own architecture. The outside requests against A1 (by `curl --resolve`, DNS untouched) matched the live site on all 12, and the live site still answers the same after its deploy. **Not yet proven:** a real sign-in and chat message through A1, the mail contributor's absence (INFRA-11) on a box, and the INFRA-6 check 9 failure path.
