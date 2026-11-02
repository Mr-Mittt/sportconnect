# INFRA-20 · Oracle hosting follow-ups: latency and Cloudflare test, authenticated load, idle reclamation

**Status:** `TODO` · **Type:** Infrastructure (measurements left open by the INFRA-12 spike) · **Depends on:** INFRA-12 (the move to the A1 box, so the numbers are taken on the box that stays)

**Filed:** 2026-11-02, from the INFRA-12 scope change. INFRA-12 closes with a GO and the move to the Always Free A1 box; three of its ten spike points were never closed and nothing else tracked them.

## Items

1. **Latency and a CDN (spike point 9).** Inconclusive on 2026-10-27: TCP round trip about 150 to 200 ms from the owner's PC, but the same 490 KB gzipped JS took 1.6 s on some runs and 17 s on others with identical connect, TLS and first-byte times, so the stall is in the transfer path from that PC, cause unproven. Needs more locations and times, and the Cloudflare-in-front test, before it counts for or against Oracle's region. Measure against the A1 box once it serves the site.
2. **Authenticated load (spike point 4, the part never covered).** Only read-only, unauthenticated load was measured on x86 (400 concurrent users, CPU-bound, Caddy and TLS first). Not covered: feed, Discover, the WebSocket (chat and STOMP), Keycloak token logins. Measure on the A1 box (2 vCPUs, so the numbers differ from the 4-vCPU x86 baseline) with a load generator that does not share the box.
3. **Idle reclamation (spike point 5).** Oracle may reclaim an idle Always Free instance (7 days under its CPU, network and memory thresholds). Determine from Oracle's current documentation whether the production box is exposed to it, whether Pay-As-You-Go removes it while keeping the free A1 allowance, and what the stack's real utilisation is against the thresholds. Also confirm the current A1 allowance (reported cut to 2 OCPU / 12 GB around 2026-08-18) and whether the tenancy keeps it.

**Out of scope:** changing the region or the CDN in front of the site (a result of item 1 may file that), tuning the application for load (a result of item 2 may file that).
