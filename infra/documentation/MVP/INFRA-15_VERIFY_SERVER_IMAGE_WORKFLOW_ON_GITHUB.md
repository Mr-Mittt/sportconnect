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

**Out of scope:** the box pulling the image (INFRA-6); arm64; gating a release on `server-ci`.
