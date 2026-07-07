# INFRA-1 · Backend CI workflow (`server-ci.yml`)

**Status:** `DONE` (bootstrap pending — see "Conditional / not yet verified")
**Type:** Infrastructure (CI)
**Date:** 2026-07-08

## Design

The backend had zero CI — nothing built or ran the Spock suites on push. Spec: `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2/§3, ticket `infra/documentation/BACKLOG_MVP.md` INFRA-1.

The ticket's own first step is an inventory: check whether any Spock test needs real
PostgreSQL/PostGIS or Redis before adding service containers, rather than cargo-culting
infrastructure the tests don't use. Findings:

1. **No test needs real Postgres/PostGIS.** All `BaseIT`-derived integration tests run against H2
   (`server/src/test/resources/application-test.yml`). No Spock spec anywhere uses
   `PostgreSQLContainer` or a real Postgres.
2. **Redis is already self-contained.** A8 (this session) made `BaseIT` spin up its own singleton
   Testcontainers Redis container. `ubuntu-latest` runners have Docker preinstalled and running by
   default, so Testcontainers auto-detects it via the standard Linux socket — no `services:` block
   needed.
   **→ Conclusion: zero GitHub Actions service containers required for this workflow.**
3. **The ticket's literal `./gradlew build` built the client too.** Root `build.gradle` had
   `build { dependsOn ':server:build'; dependsOn ':client:buildClient' }`, and
   `client/build.gradle` had `build.dependsOn buildClient`. Together, a plain `./gradlew build`
   from repo root always triggered a full pnpm install + Vite build — duplicate work `client-ci.yml`
   already does, and Node/pnpm setup a backend-only workflow shouldn't need. Fixed at the source
   (not with a CI-side `-x` exclusion), per explicit direction — see "What was built."
4. **Blocker: the POSIX `gradlew` wrapper script wasn't in the repo.** Only `gradlew.bat` was
   tracked (both at root and, oddly, under `server/`). `ubuntu-latest` can't run `./gradlew`
   without it — generated and committed as part of this ticket.
5. **Noted, not fixed:** `server/gradlew.bat` + `server/gradle/wrapper/` look like a stale, unused
   nested wrapper left over from before the multi-module restructuring. Doesn't block CI (the
   workflow runs from the repo root) — flagged for a separate cleanup ticket, not touched here.

## What was built

### Decoupled backend and client builds at the source

- `build.gradle` (root) — removed the `build { dependsOn ':server:build'; dependsOn
  ':client:buildClient' }` block entirely.
- `client/build.gradle` — removed `build.dependsOn buildClient`.
- `CLAUDE.md` (root) — updated the `./gradlew build` comment to reflect the new backend-only scope.

Gradle's default CLI behavior (matching a task name across every project) still means root
`./gradlew build`/`./gradlew test` automatically runs every JVM module's own `build`/`test` task —
unaffected by the removed lines. `:client:build`/`:client:check` (still matched by the CLI, since
`client/build.gradle` keeps the `base` plugin) are now cheap no-ops, verified via a forced
`--rerun-tasks` run showing zero pnpm/Node/`buildClient` invocations anywhere in the task graph.
`:client:buildClient` itself is untouched and still the explicit way to build the client via
Gradle; `client-ci.yml` was never affected either way since it calls `pnpm` directly.

### Generated the missing `gradlew` POSIX wrapper

Via `./gradlew.bat wrapper --gradle-version 8.5` (matching the already-pinned version in
`gradle/wrapper/gradle-wrapper.properties`). Added a `.gitattributes` entry
(`gradlew text eol=lf`, `gradlew.bat text eol=crlf`) after noticing Git's default line-ending
handling would otherwise convert `gradlew`'s LF endings to CRLF on a Windows checkout — which
would break the shebang/execution on Linux CI runners. Explicitly set the executable bit in git's
index (`git update-index --chmod=+x gradlew`), not just relying on the workflow's own `chmod +x`
step, so a fresh Linux/macOS clone works out of the box too.

### `.github/workflows/server-ci.yml`

Mirrors `client-ci.yml`'s shape: triggers on push to `master` and PRs touching `modules/**`,
`server/**`, `build.gradle`, `settings.gradle`, `gradle/**`, `gradlew`, `gradlew.bat`, or the
workflow file itself, plus `workflow_dispatch` for manual runs. Job: checkout →
`actions/setup-java@v4` (temurin, JDK 21, `cache: gradle`) → `chmod +x gradlew` → `./gradlew build`
→ upload test reports as an artifact on failure. No service containers (per findings #1/#2 above).

## Verification

- Ran `./gradlew build --rerun-tasks` locally from repo root after the decoupling change: full
  backend build (compile + all Spock suites across every module + `bootJar` packaging) succeeded,
  confirmed zero client/pnpm/Node output anywhere in the task graph.
- Confirmed the staged `gradlew` blob has LF line endings (`git show :gradlew | head -1 | od -c`).
- Reviewed the workflow YAML by hand — no `actionlint` installed in this environment.

## Conditional / not yet verified (HF-12 pattern)

- **An actual green Actions run on a backend-touching PR** — can only be confirmed once this
  branch is pushed and a PR opened; not verifiable from this session.
- **Marking `server-ci / test` as a required check** — manual GitHub-settings step. Per session
  017's HF-12 finding, branch protection isn't even mechanically available on this repo (GitHub
  Free + private repo), so this is convention-only regardless, same as `client-ci`.

Both are explicit follow-ups, not claimed as done.
