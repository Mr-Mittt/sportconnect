# INFRA-5 · Client static build + S3/CloudFront deploy

**Status:** `TODO` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** `INFRA-3_HOSTING_DECISION.md`, `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1

- Workflow step that runs `pnpm build` in `client/`, syncs the output to the INFRA-3 S3 bucket,
  and invalidates the CloudFront distribution
- Confirm the built client's `/api` calls target the real production server URL (env-specific
  Vite build config), not `localhost`
- Done when: a real build is deployed and reachable through the CloudFront URL

**Delta (2026-08-15, filed while implementing client SPORT-4):** the `/api` origin problem above
isn't unique to API calls — `SportIcon` (SPORT-4) renders `Sport.iconUrl`, a real backend-served
static asset (`sport-impl`'s `WebConfig`, `/images/**` → `classpath:/images/`) returned by
`GET /api/sports` as a **server-relative path** (e.g. `/images/sports/badminton.png`). A relative
`<img src>` only resolves against the page's own origin, so once the client is genuinely on
CloudFront and the backend is on EC2 (this ticket's whole premise), that image 404s exactly the
same way an unconfigured relative `/api` call would. Dev-mode is unaffected (client SPORT-4 added
a `/images` entry to `vite.config.ts`'s dev proxy, mirroring the existing `/api` one — real local
`pnpm dev` and the e2e mock server both resolve it correctly today); this delta is scoped to
**production only**. Whatever this ticket's env-specific Vite build config ends up being for `/api`
(an absolute prod server URL baked in at build time, most likely) needs to cover `/images/**` too —
either the same absolute-origin prefix applied to both, or a CloudFront distribution behavior that
path-routes `/images/**` to the EC2 origin (mirrors INFRA-7's reverse-proxy path-routing precedent,
just client-origin-side instead of server-side). Decide which at pickup; either closes this gap.
Not blocking SPORT-4's own client-side ship — that ticket's scope is explicitly client-only,
dev-verified, with this production gap called out rather than silently assumed fixed.

## Delta 2026-10-27 (INFRA-3 / INFRA-12): no S3/CloudFront, Caddy serves the build

Hosting is Oracle Cloud (`INFRA-3_HOSTING_DECISION.md`). The S3 bucket, CloudFront distribution and cache invalidation are gone; the sandbox already serves the client from the VM's Caddy (`infra/oracle/Caddyfile`, build in `/srv`, SPA fallback to `index.html`).
- The Keycloak URL is **baked in at build time**: `VITE_KEYCLOAK_URL=https://auth.yoursport.vn pnpm build` (default is `http://localhost:8081`). The CI build must set it.
- Open for this ticket (pull-based deploy, INFRA-6): how the build gets onto the box. Preferred: a small image on GHCR that contains the build (served by the Caddy container), pulled like the other images; alternative: CI copies the build over SSH, which the pull-based decision rejects.
- Measured: the build is 1.8 MB (one 1.66 MB JS chunk, 468 kB gzipped). Latency from Vietnam was inconclusive (INFRA-12 point 9); Cloudflare in front of Caddy is the CDN option if it matters.

## Delta 2026-10-28 (INFRA-4): versioning scheme to reuse

INFRA-4 built the versioning scheme for the server image; the client follows the same shape (`infra/scripts/server-image-plan.sh`, `server-version.sh` and `prune-ghcr-versions.sh` are the templates). The client has its own version (in `client/package.json` or a file of its own, decided here), separate from the monolith's, and tags `client-vX.Y.Z`. A release is a merged PR that raised the version with a bump tool; an ordinary master merge pushes `:sha-<short>` and `:edge`, stamped `<version>+<short sha>`; retention keeps every release plus the newest 10 `sha-*` builds.
