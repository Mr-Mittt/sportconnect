# INFRA-15 · Verify the server-image workflow on GitHub

**Status:** `TODO` · **Type:** Infrastructure (verification, GitHub-side) · **Dependency:** INFRA-4 merged to `master`

**Filed:** 2026-10-28, from INFRA-4. A workflow that publishes to GHCR can only run for real once it is on `master`, so INFRA-4 was verified locally (image build and boot, the version and plan scripts against a scratch repo with fake tags, `actionlint`) and these GitHub-side checks were left here, the same way HF-12 holds the client-ci ones.

Run in this order after INFRA-4 merges; record each result (or the failure and its fix) in this file.

1. **The merge run.** The merge of INFRA-4 itself runs `server-image`. The file is `0.0.0`, so it must be an ordinary build: `:sha-<short>` and `:edge` pushed to `ghcr.io/mr-mittt/sportconnect-server`, no release, no tag. Check the package exists, its visibility (private is intended) and that it is linked to the repository (the `org.opencontainers.image.source` label links it). If not, fix it in the package settings and note the steps in `PRODUCTION_DEPLOYMENT_GUIDE.md` §15.
2. **Pull and run.** `docker login ghcr.io` with a token that can read packages, pull `:edge`, and boot it like INFRA-4 did locally (env file from `infra/oracle/server.env.example`, `MANAGEMENT_HEALTH_MAIL_ENABLED=false` without SMTP credentials): healthy, `prod` profile, startup line `v0.0.0+<sha7>`.
3. **A pull-request run.** Open a PR touching `server/**`: the job runs the version check and builds without pushing and without a GHCR login.
4. **The bad-version check.** On a scratch PR set `gradle.properties` below an existing release (after step 5 has made one) or to a malformed value: the "Check the version" step must fail the PR.
5. **The first release.** Branch from `master`, `infra/scripts/server-version.sh bump` (expect `0.0.0 -> 0.1.0`), commit `chore(release): server 0.1.0`, merge. Expect `:0.1.0`, `:latest`, `:edge` and `:sha-<short>`, the git tag `server-v0.1.0` created last, and a jar stamped `0.1.0` (image label and startup line). The next ordinary merge must then be stamped `0.1.0+<sha7>` and push no release. Bump again with `patch` and check `0.1.1`.
6. **The re-run.** Make a release whose push fails (or simulate: delete the tag `server-v<x>` from a scratch fork) and confirm "Run workflow" with no inputs releases it. Also confirm the workflow refuses to run from a branch other than `master`.
7. **Retention.** The prune step is `continue-on-error`, so a failure is silent. Read its log: either it deleted nothing (fewer than 11 `sha-` builds) or it deleted old ones; if the token is refused (403), decide between a token that may delete package versions and pruning by hand, and record it. Confirm no release tag, `latest` or `edge` was touched.
8. **Swagger.** Open Swagger UI on a run of the pulled image and confirm the API version shown is the build version, not `dev`.
9. **Paperwork.** Replace the "(not run yet)" notes in `PRODUCTION_DEPLOYMENT_GUIDE.md` §15 and its change history, and the conditional in INFRA-4's summary.

## Added 2026-10-28 (INFRA-5): the client image

INFRA-5 added `client-image.yml` (package `ghcr.io/mr-mittt/sportconnect-client`, tags `client-vX.Y.Z`, version in `client/package.json`, `0.0.0` placeholder). It was verified locally only (version and plan scripts against a scratch repo, `actionlint`, a real image build, served by Caddy). Repeat steps 1 and 3 to 7 above for the client, once INFRA-5 is on `master`; they differ only in the names:

- **C1. The merge run** of INFRA-5 (the version is `0.0.0`): an ordinary build, `:sha-<short>` and `:edge` pushed to `sportconnect-client`, no tag. Check the package, its visibility (private) and its link to the repository.
- **C2. Run the image.** Pull `:edge`, run it into an empty volume (`docker run --rm -v web:/srv <image>`), serve the volume with `caddy:2-alpine` and the Caddyfile: `/` and an unknown path return `index.html`, the bundle contains `https://auth.yoursport.vn` and not `localhost:8081`, the labels show the version and revision.
- **C3. A pull-request run** touching `client/src`: builds without pushing. A PR touching only `client/docs/**`, `client/e2e/**` or `client/keycloak-theme/**` must not start the workflow.
- **C4. The bad-version check, C5. the first release** (`/release client` bumps `0.0.0` to `0.1.0`; expect `:0.1.0`, `:latest`, the tag `client-v0.1.0` created last; a bare `/release` must bump the server and the client on one branch), **C6. the re-run and the master-only refusal, C7. retention** (the prune step for `sportconnect-client`).
- **C8. Paperwork:** replace the "(not run yet)" notes for the client in `PRODUCTION_DEPLOYMENT_GUIDE.md` §15 and its change history.

**Out of scope:** the box pulling the images (INFRA-6); arm64; gating a release on `server-ci`.
