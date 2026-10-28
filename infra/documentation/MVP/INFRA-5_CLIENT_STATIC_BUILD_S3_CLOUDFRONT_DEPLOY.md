# INFRA-5 · Client static build + S3/CloudFront deploy

**Status:** `DONE (2026-10-28; GitHub-side checks are INFRA-15)` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
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

INFRA-4 built the versioning scheme for the server image; the client follows the same shape (`infra/scripts/server-image-plan.sh`, `server-version.sh` and `prune-ghcr-versions.sh` are the templates). The client has its own version (in `client/package.json` or a file of its own, decided here), separate from the monolith's, and tags `client-vX.Y.Z`. A release is a merged PR that raised the version with a bump tool; an ordinary master merge pushes `:sha-<short>` and `:edge`, stamped `<version>+<short sha>`; retention keeps every release plus the newest 10 `sha-*` builds. Register the client in the component table of `.claude/commands/release.md` (its version tool and file), so `/release` bumps it too.

## Implementation summary (2026-10-28)

**Approved design.** The client build becomes a small image on GHCR, versioned like the server image. The box's Caddy container serves the files; the image has no web server. Scope questions answered by the owner: image delivery (not an SSH copy), data-only image (Caddy and its TLS volumes unchanged), the client has its own version in `client/package.json` with tags `client-vX.Y.Z`, shared logic generalised only where cheap, GitHub-side checks folded into INFRA-15.

**Built.**
- `client/Dockerfile` (+ `client/.dockerignore`): `node:22-slim` builds with pnpm (`--frozen-lockfile`) and `VITE_KEYCLOAK_URL` as a build arg (the default is the dev Keycloak, so an image built without it is not for a server); the final `alpine` stage holds `/dist` and the OCI labels. Running the image replaces the contents of `/srv` with the build (`docker run --rm -v web:/srv <image>`); that is the contract INFRA-6 uses (a one-shot step into a volume that Caddy mounts `:ro`).
- `infra/scripts/client-version.sh` (`bump` and `check`, same rules as `server-version.sh`, version in `client/package.json`, tags `client-v*`; it preserves the file's line endings and never touches a nested `version` key) and `infra/scripts/client-image-plan.sh` (same outputs as the server's, package `sportconnect-client`).
- `.github/workflows/client-image.yml`: a pull request builds without pushing, a master push pushes `:sha-<short>` and `:edge`, a merged version bump also pushes `:X.Y.Z` and `:latest` and creates the tag `client-vX.Y.Z` last, a no-input dispatch re-runs a failed release, retention keeps every release, `latest`, `edge` and the newest 10 `sha-*` builds. It bakes `VITE_KEYCLOAK_URL=https://auth.yoursport.vn`.
- `client/package.json` version `0.0.1` -> `0.0.0` (the placeholder; nothing reads that field, grep checked). `.claude/commands/release.md`: the client is a versioned component, so `/release client` bumps it and a bare `/release` bumps the server and the client on one branch.
- `prune-ghcr-versions.sh` already took the package name, so it is shared as is.

**Decisions and divergences.**
- The original text's `/api` and `/images` origin problem (Delta 2026-08-15) does not exist on Oracle: both are same-origin behind Caddy, so only the Keycloak URL is baked in.
- The first build failed: `tsc -b` typechecks `playwright.config.ts`, which imports `e2e/mocks`. So `e2e` stays in the Docker context (it never reaches the final image) and `client/e2e/**` is not excluded from the workflow's path filter. `docs`, `keycloak-theme` and `design-reference` are excluded from the path filter, and from the Docker context where the build does not read them.
- Node 22 in the image (what `client-ci` tests on), although `client/build.gradle` pins 24.14.0 for the Gradle path.
- `rm -rf /srv/*` in the image command leaves dotfiles; the Vite build emits none.
- One platform (`linux/amd64`): static files; arm64 comes with the A1 box.

**Verified locally.**
- `client-version.sh` and `client-image-plan.sh` against a scratch git repo with fake tags: bump (default minor, patch, major, explicit, repeat, downgrade, below the latest tag by version order, bad input), CRLF kept, nested `version` untouched, `check` (placeholder, untagged, tagged, below latest, real exit code 1), and the plan for a PR, an ordinary build, a release, a dispatch, a dispatch off `master` and a tag ref. A first run showed `sed -i` dropping CRLF on Windows; fixed with `sed -b`.
- `actionlint`: clean.
- A real `docker build` (about 26 s warm), labels correct, the image run into an empty volume twice (a planted stale file is removed on the re-run), then served by `caddy:2-alpine` with the same static `handle` block as the real Caddyfile: `/`, `/login`, `/groups/123`, `/actuator/health` and a missing `/assets/...js` all return 200 with `index.html`, the real bundle is served as `text/javascript`, and the bundle carries `https://auth.yoursport.vn` (the one `http://localhost:8081` left is the dead fallback branch in `keycloak.ts`).
- Not run: the real Caddyfile on a box (it needs the domain and certificates).

**Not verified (INFRA-15, section "the client image"):** the GHCR push, package visibility and linking, the release run and tag, the version check on a PR, the path filter, retention deletes. The box does not pull the image until INFRA-6.
