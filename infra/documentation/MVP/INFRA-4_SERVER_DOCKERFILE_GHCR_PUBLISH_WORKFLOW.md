# INFRA-4 · Server Dockerfile + GHCR publish workflow

**Status:** `DONE` (2026-10-28; GitHub-side checks are INFRA-15) · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** `INFRA-3_HOSTING_DECISION.md`, `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §1

- `server/Dockerfile` (artifact-scoped — lives with the code it packages, not in `infra/`):
  multi-stage build (Gradle build stage → slim JRE 21 runtime stage), non-root user
- Workflow step (extending `server-ci.yml` or a new job) that builds the image and pushes to
  `ghcr.io/<org>/sportconnect-server` on merge to `master` (or on tag — decide in Phase 1),
  tagged with the commit SHA
- Done when: a real image is pushed to GHCR and can be pulled + run locally against
  `docker-compose.dev.yml`'s Postgres/Redis to confirm it boots

## Delta 2026-10-27 (INFRA-3 / INFRA-12): target is the Oracle VM, x86 now

Hosting is Oracle Cloud (`INFRA-3_HOSTING_DECISION.md`), not AWS. Consequences for this ticket:
- The image runs on an **x86** VM now; Always Free A1 (arm64) is reconsidered when capacity appears, so build with `buildx` for `linux/amd64` and keep `linux/arm64` addable (INFRA-12 points 2 and 3 are untested).
- `infra/oracle/server.Dockerfile` (`eclipse-temurin:21-jre` plus a pre-built jar) is a **throwaway measuring tool** from the INFRA-12 sandbox, not this ticket's deliverable.
- Publishing to GHCR needs no cloud credentials (the workflow's `GITHUB_TOKEN`). The VM pulls the image itself (pull-based deploy, INFRA-6); it needs one read-only GHCR token for a private image, kept in a root-owned file on the box.
- Run the server with the `prod` profile (the `dev` profile hard-codes `app.internal-service-secret`; INFRA-12 findings).

## Scope change 2026-10-28: server versioning is in scope

Why: the server has no real version today (every `build.gradle` hardcodes `0.0.1-SNAPSHOT`, there are no git tags, and `/actuator/info` reports nothing), so the only identifier of a deployed build would be a commit SHA. The owner wants versioning built in this ticket.

Added to scope: a single source of truth for the server version, the version and commit exposed at runtime (`/actuator/info`), and image tags and OCI labels that carry both. Scheme agreed with the owner 2026-10-28 (release on demand):

- **One monolith version.** The base lives in the root `gradle.properties` (`0.1.0`); every Gradle module and `server` read it, replacing the hardcoded `0.0.1-SNAPSHOT` lines. CI passes `-Pversion` (the release version, or `<base>-<short sha>` for an ordinary build). Independent per-Gradle-module versions are not wanted (they ship in one jar); revisit only if a domain is extracted.
- **Per deployable.** `server`, `client` and `chat` each have their own version and tags, `server-vX.Y.Z` / `client-vX.Y.Z` / `chat-vX.Y.Z`. This ticket builds the scheme and applies it to the server; INFRA-5 and INFRA-8 reuse it (Deltas filed there).
- **Every server-affecting merge to `master`** pushes `sha-<short>` and `edge`. No version number is assigned.
- **A release is deliberate:** a manual `workflow_dispatch` choosing `patch`, `minor` or `major` (the workflow reads the latest `server-v*` tag and computes the next version), or a pushed `server-vX.Y.Z` tag as a fallback. It pushes the image as `X.Y.Z`, moves `latest`, and creates the git tag.
- **Runtime:** `springBoot { buildInfo() }` plus the commit SHA, so `/actuator/info` reports version, commit and build time; the image carries the OCI labels version, revision and created.

### Scope change 2026-10-28 (later the same day): the release is driven by the version in the repo

Why: the owner prefers a release that needs no manual choices (no branch dropdown, no bump input). The two bullets about how a release is cut ("A release is deliberate: manual dispatch ... or a pushed tag") are **replaced** by:

- **A bump tool, `infra/scripts/server-version.sh bump [minor|patch|major|X.Y.Z]`**, edits the version in `gradle.properties`; no argument raises the minor version. It refuses a version that is not `X.Y.Z`, equals the current one, or is not strictly higher than the highest existing `server-v*` tag (so a downgrade or a repeat fails). `server-version.sh check` runs the same validation in CI, so a hand-edited version fails on the PR.
- **The flow:** branch from `master`, run the bump, merge a dedicated PR (`chore(release): server X.Y.Z`). **On the merge to `master` the workflow releases by itself**: if the tag `server-v<version in gradle.properties>` does not exist yet, the run is a release (image `:X.Y.Z` and `:latest`, then the git tag, created last). Otherwise it is an ordinary build (`:sha-<short>`, `:edge`). Detection is by tag, not by commit message.
- **`0.0.0` is a placeholder and is never released.** The file starts at `0.0.0`, so the first merge of this ticket only publishes `:edge`; the first real release is a deliberate bump to `0.1.0`.
- **Ordinary builds are stamped `<version>+<short sha>`** (semver build metadata, "after" the release), not `<version>-<short sha>` (which sorts as a pre-release).
- **Removed:** the patch/minor/major dispatch input, `next-server-version.sh`, and the hand-pushed `server-v*` tag trigger (the workflow owns the tags). `workflow_dispatch` stays with no inputs, as the "run again" for a release whose image push failed (the tag is created last, so no tag exists and the re-run releases).
- Every release, a patch included, needs a PR that bumps the version.

## Implementation summary (2026-10-28)

**Design as approved; what was built matches it. The one call the owner made along the way: `/actuator/info` stays authenticated.**

- **Version.** The four hardcoded `0.0.1-SNAPSHOT` lines (root, subprojects, `server`, `client`) are gone; the root `gradle.properties` holds `version=0.0.0` (the placeholder before the first release) and every project reads it (checked for `modules:common`, `modules:auth:auth-impl`, `infra:keycloak-extensions`, `client`). CI overrides it with `-Pversion`. `server/build.gradle` has `springBoot { buildInfo() }` with a `commit` property from `-PgitSha`; the built jar's `build-info.properties` was read and showed version, commit and time. `OpenApiConfig` takes Swagger's API version from `BuildProperties` (fallback `dev`), and the two docs that cited `server-0.0.1-SNAPSHOT.jar` now say `server.jar`.
- **Image.** `server/Dockerfile` (root build context, `server/Dockerfile.dockerignore` allow-list): `eclipse-temurin:21-jdk` builds `:server:bootJar -x test` with a Gradle cache mount, `eclipse-temurin:21-jre` runs it as UID 10001, `SPRING_PROFILE=prod`, `-XX:MaxRAMPercentage=60`, `HEALTHCHECK` on `/actuator/health`, OCI labels (version, revision, created, source), `/var/log/sportconnect` writable for the prod log file.
- **Workflow.** `.github/workflows/server-image.yml` (logic in `infra/scripts/server-image-plan.sh`, `server-version.sh`, `prune-ghcr-versions.sh`, `select-prunable-package-versions.mjs`): a pull request checks the version and builds without pushing; a push to `master` is an ordinary build (`:sha-<short>`, `:edge`, jar stamped `<version>+<short sha>`) unless the tag `server-v<version>` does not exist yet, in which case it is a **release**: it also pushes `:X.Y.Z` and `:latest` and creates the git tag last. `0.0.0` is never released. A no-input `workflow_dispatch` re-runs it (retry of a release whose push failed). Retention keeps every release, `latest`, `edge` and the newest 10 `sha-*` builds, and runs `continue-on-error`.
- **Version tool.** `infra/scripts/server-version.sh bump [minor|patch|major|X.Y.Z]` (default minor) edits `gradle.properties` and refuses a version that is not `X.Y.Z`, is not higher than the current one, or is not higher than the highest `server-v*` tag; `check` runs the same validation in CI (a version lower than the latest release fails the PR). A release is the merge of a PR that bumped the version (`chore(release): server X.Y.Z`); there is no branch or bump choice to make in GitHub.
- **Decision (owner, 2026-10-28):** `/actuator/info` stays authenticated, so there is no `SecurityConfig` change and no new integration test for it. In production nothing outside the Docker network can reach it anyway (Caddy does not proxy `/actuator`); the version is read from the image labels and the startup log line. Permitting it later is a one-line change, noted on INFRA-6.
- **Docs.** Deltas on INFRA-5, INFRA-6 and INFRA-8 (the scheme to reuse, what the image gives the deploy), `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2, `PRODUCTION_DEPLOYMENT_GUIDE.md` new §15 plus its change-history row, a "superseded" banner on `infra/oracle/server.Dockerfile`.

**Verified locally (all run in this session).**
- `./gradlew :server:bootJar -Pversion=0.1.0-abc1234 -PgitSha=abc1234`: `build-info.properties` carried `build.version=0.1.0-abc1234` and `build.commit=abc1234`.
- `docker build -f server/Dockerfile` (about 4 minutes cold), booted against the dev Compose Postgres, Redis, RabbitMQ and Keycloak with the production env shape. The startup line read `Starting SportConnectApplication v0.1.0-local`, profile `prod`, process user `app`, the log file written; `/actuator/health` 200 and Docker's own health state `healthy`; `/actuator/info` 401 without a token; labels carried version and revision. Without SMTP credentials `/actuator/health` returned 503 (the mail check, the known INFRA-11 Delta); `MANAGEMENT_HEALTH_MAIL_ENABLED=false` made it UP.
- `server-version.sh` and `server-image-plan.sh` against a scratch git repo with fake tags: bump default minor / patch / major / explicit, a repeat, a downgrade, a result below the latest tag (`0.10.0` correctly above `0.9.0`), a bad argument, a bad file version, CRLF kept; `check` for placeholder / untagged / tagged / below-latest; the plan for a pull request, an ordinary push, a push of an untagged version (release), a re-run by dispatch, a tagged version, a dispatch off `master` and a tag ref (refused). `select-prunable-package-versions.mjs` against fake version lists (release, `latest`, `edge` and untagged versions are never selected; only the oldest `sha-*` beyond the cut are). A jar built with `-Pversion=0.0.0+abc1234` read back `build.version=0.0.0+abc1234`.
- `actionlint` on `server-image.yml`: no findings.
- `:server:test --tests PublicSurfaceAccessIntegrationTest` (full Spring context with the changed `OpenApiConfig`): passed. Only that class was run, not the whole `:server:test` suite.

**Not verified (conditionals, owned by INFRA-15, filed):** the push to GHCR, package visibility and repository linking, the release run and tag creation, the version check on a PR, the retention deletes (whether the workflow's `GITHUB_TOKEN` may delete versions of a user-owned package is unknown), and that Swagger UI shows the build version (the `BuildProperties` read was not looked at in a running Swagger). Also unverified: the cold-start build time on a GitHub runner, and that the image runs on the Oracle box (the box does not pull it until INFRA-6).

**Limits worth knowing.** A release is not gated on `server-ci` (noted on INFRA-6 and in the guide): merge a version bump when `server-ci` is green. Every release, a patch included, needs a bump PR. The first merge of this ticket releases nothing (the file is `0.0.0`); the first release is a deliberate `server-version.sh bump` to `0.1.0`. `latest` follows the newest release run, not the highest version.
