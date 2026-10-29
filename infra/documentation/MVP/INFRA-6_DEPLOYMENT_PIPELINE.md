# INFRA-6 · Deployment pipeline (`deploy.yml`)

**Status:** `DONE` · **Type:** Infrastructure (CD) · **Dependency:** INFRA-3, INFRA-4, INFRA-5 ·
**Spec:** `INFRASTRUCTURE_LAYOUT_AND_CICD.md` §2, `INFRA-3_HOSTING_DECISION.md`

**Amended 2026-07-27** (filed alongside INFRA-7/8/9): once `services/chat` has its own image
(INFRA-8) and proxy routing (INFRA-7), this pipeline's "pull the image onto the EC2 instance and
restart the container" step needs to cover the chat container too, not just the server — a third
`docker run`/restart alongside the two below. Not re-scoped in detail here; the implementer should
just not assume "server + client" is still the complete deploy surface by the time this is picked
up.

Orchestrates the pieces above into one deploy: `.github/workflows/deploy.yml`, thin YAML calling
scripts in `infra/scripts/`:

- Trigger: merge to `master` (or manual `workflow_dispatch` — decide in Phase 1)
- Uses the INFRA-3 OIDC role to authenticate to AWS
- Pulls the INFRA-4 image onto the EC2 instance (via SSM, not SSH) and restarts the container
- Runs pending Liquibase migrations before/as part of the restart
- Triggers the INFRA-5 client deploy (or depends on it having already run)
- Uses a GitHub Environment (`production`) with a required-reviewer approval gate
- Rollback = re-run the workflow against an older commit SHA's image tag
- Done when: a full merge-to-master run deploys server + client and both are reachable; record
  as conditional if the required-reviewer GitHub setting can't be verified without a real PR
  merge (same HF-12/INFRA-1 pattern)

## Delta 2026-10-27 (INFRA-12): hosting is Oracle, deploy is pull-based

The AWS parts above (OIDC role, SSM, EC2) no longer apply: hosting moved to Oracle Cloud (sandbox on `VM.Standard.E3.Flex`, x86; Always Free A1 had no capacity, A1 is revisited when it does). Oracle has no GitHub-OIDC equivalent that we have set up, so the decision (owner, 2026-10-27) is **pull-based deploys through GHCR**:

- CI builds and pushes images to GHCR and moves a `prod` tag only from a protected workflow (the `production` Environment approval gate stays).
- The box runs a small job (systemd timer or Watchtower) that pulls a new `prod` image and restarts that container. No inbound deploy path, no SSH key in GitHub.
- The box needs one read-only GHCR token, kept in a root-owned `chmod 600` file on the box (see INFRA-14 for secrets).
- Open for this ticket: Liquibase migrations on deploy (who runs them, before or inside the restart), rollback (move the tag back), how a deploy is made visible, and the chat/client deploys.
- Alternatives considered and rejected for now: SSH deploy key in a GitHub Environment secret (stored long-lived key, port 22 open to GitHub), self-hosted runner on the box (repo code runs on the production machine).

## Delta 2026-10-28 (INFRA-4): what the server image gives this ticket

- Image: `ghcr.io/mr-mittt/sportconnect-server`. Tags: `X.Y.Z` (a release: the merge of a PR that bumped `gradle.properties` with `server-version.sh`), `latest` (newest release), `edge` (newest master build), `sha-<short>`. Deploy a pinned `X.Y.Z` (or a `sha-` tag while testing); rolling back is pinning the previous one. The package is private, so the box needs the read-only GHCR token.
- The image runs the `prod` profile as a non-root user with a `HEALTHCHECK` on `/actuator/health`; it expects the env file `infra/oracle/server.env.example` describes, and (until real SMTP credentials exist) `MANAGEMENT_HEALTH_MAIL_ENABLED=false` or the health check reports DOWN.
- "Which version is running?": `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}'`, or the startup log line (`Starting SportConnectApplication v<version>`). `/actuator/info` carries version, commit and time too, but it needs a login and Caddy does not proxy `/actuator`. If a smoke test or a monitoring check wants it without a token, permitting `/actuator/info` in `SecurityConfig` is a one-line change plus an integration test; do it when there is a consumer.
- A release is not gated on `server-ci`: the dispatch builds whatever master's head is. Gate the deploy on a green `server-ci` run for that commit here.
- `infra/oracle/server.Dockerfile` and `run-containers.sh` (which build from a jar on the box) stay until this ticket replaces them with the pull.

## Delta 2026-10-28 (INFRA-5): what the client image gives this ticket

- Image: `ghcr.io/mr-mittt/sportconnect-client`, same tags as the server image (`X.Y.Z`, `latest`, `edge`, `sha-<short>`; releases tagged `client-vX.Y.Z`). Private, so the same read-only GHCR token pulls it. The Keycloak URL is baked in as `https://auth.yoursport.vn`, so one image is for one environment.
- It holds the built files only. Contract: running it replaces the contents of `/srv` with the build, so deploy the client by running it as a one-shot step into a named volume that the Caddy container mounts read-only on `/srv` (today `run-containers.sh` mounts `~/web/dist` there). Pin `X.Y.Z` (or a `sha-` tag while testing); rolling back is running the previous tag. Caddy needs no restart: it reads the files per request.
- Same note as the server's: a release is not gated on `client-ci`; gate the deploy on a green run for that commit.
- Fold in (from INFRA-15, decided 2026-10-28): set `org.opencontainers.image.description` in `server/Dockerfile` (and `client/Dockerfile` if a pull of `:0.1.0` shows the same gap). The server image's `description` label is Canonical's Ubuntu text, inherited from the base image.
- Fold in (from the INFRA-8 discussion, 2026-10-29): run the containers with hardened flags: `--cap-drop ALL`, `--security-opt no-new-privileges`, and `--read-only` with a writable tmpfs or volume for the server's log directory (`/var/log/sportconnect`). Probe health from outside the container if a future image has no health check of its own (the chat image has none: distroless, no shell). INFRA-16 revisits distroless bases for the server and client afterwards.
- Found during INFRA-8 (2026-10-29), chat deploy: the chat image will not contain its migrations (`services/chat/migrations/*.up.sql`). Today `run-containers.sh` applies them with `psql` from the repo files copied to the box, and the dev stack does not create the chat schema either. INFRA-6 must decide how the chat schema is applied on a deploy (a one-shot step with the migration files, or embedding them in the image); chat's `GET /healthz` is a static 200 (no database check), so it proves the process is up, not that the schema is right.
- Chat image (INFRA-8, 2026-10-29): `ghcr.io/mr-mittt/sportconnect-chat`, same tags (`X.Y.Z`, `latest`, `edge`, `sha-<short>`; releases tagged `chat-vX.Y.Z`), private, so the same read-only token pulls it. Distroless static, user `nonroot` (UID 65532), port 8090, the environment of `infra/oracle/chat.env.example`, no `HEALTHCHECK` (probe `GET /healthz` from outside). Start order: the server must be ready first, because chat's cold-start sync calls it and the process exits if it is not. Running version: the `version` field of the `chat service listening` log line, or the `org.opencontainers.image.version` label.

## Decisions 2026-10-29 (Phase 1, questions 1 to 3 settled with the owner)

Phase 1 is still open for the chat schema, scope, CI gate, fold-ins and edge cases; these are settled:

- **Deploy is a manual command on the box, no timer.** The owner runs `sudo sportconnect-deploy` (SSH to the box). It asks GHCR what `:prod` points to for each component (server, client, chat), compares with what is running (the `org.opencontainers.image.version` label), prints a plan (`running 0.1.0, prod 0.2.0, will deploy` per component), asks `Deploy? [y/N]`, pulls only the changed images, restarts them, probes health from outside (the chat image has no health check), and rolls back to the previous image automatically if the probe fails. Nothing on the box acts unattended; no inbound port; no SSH key in GitHub. Watchtower rejected (follows a moving tag, needs the Docker socket).
- **A promote workflow moves `:prod`** (`promote.yml`, `workflow_dispatch` with a component and a version). It accepts only an existing release (`X.Y.Z`) or a `sha-` tag, never `edge` or `latest`. The run is titled `Promote <component>: <current> -> <new>`. A first, ungated job reads the label of the current `:prod` image and writes a summary (production runs X at sha A, promoting Y at sha B, CI result for that commit); the job that retags (no rebuild) sits behind the **`production` GitHub Environment with a required reviewer**, so the owner approves after reading the summary. First deploy: the summary says nothing is deployed yet.
- **Migrations stay inside the server at startup** (Liquibase, as today) for up-version deploys. **Promoting a lower version than the current `:prod` is blocked** by `promote.yml` (and the deploy command refuses a plan that lowers a version) until **INFRA-17** is done: an older release can need an older schema, and Liquibase cannot undo raw-SQL migrations. Until then the way out of a bad release is a fixed newer release, or a restore from backup. `spring.jpa.hibernate.ddl-auto` is `validate`.
- Open for the same reason, to settle in this ticket: a `pg_dump` before a deploy that brings new migrations is INFRA-17's option 2; whether INFRA-6 already takes it is a Phase 1 question.
- **Chat schema: embedded in the chat image and applied at chat startup** (owner, 2026-10-29), filed as chat **CHAT-22** (`services/chat/docs/MVP/CHAT-22_...`), which INFRA-6 depends on. The deploy command therefore does nothing for the chat schema; `run-containers.sh`'s `psql` loop goes away with the script. One-time step on the box once CHAT-22 ships: the production chat schema was created by `psql`, so `schema_migrations` must be seeded at version 4 (command in the deployment guide).
- **`:prod` is only a registry tag** (not GitHub-specific); the deploy command compares digests and shows the version label. retention already protects it (checked 2026-10-29 in `select-prunable-package-versions.mjs`: only versions whose tags **all** start with `sha-` can be pruned, so a `sha-` build that also carries `prod` is kept); no change to the prune script, only a test case for it.
- **Promote checks CI at level 2** (owner, 2026-10-29): it looks for the latest `master` run of the matching workflow (`server-ci`, `client-ci`, `chat-ci`) on the tag's commit or an ancestor of it (the workflows are path-filtered; `server-ci` does not list the root `gradle.properties`, so a server release commit usually has no run of its own), shows the result in the approval summary, **blocks on a failed run, warns when none is found** (older than GitHub's log retention, or never run), and has a visible "skip CI check" input whose use is written into the summary. The summary tells how to run CI again on the tag (Actions, the CI workflow, Run workflow, pick the tag; all three have `workflow_dispatch`). Promote dispatching CI and waiting for it is left out for now.
- **Chat is in scope** (server, chat and the client files; start order server first, then chat, then the client volume).
- **Fold-ins in scope:** the `description` label in `server/Dockerfile` and `client/Dockerfile`; hardened run flags (`--cap-drop ALL`, `no-new-privileges`, `--read-only` with a volume for `/var/log/sportconnect` and a tmpfs for `/tmp` for the server; tried on the box, a flag that breaks startup is dropped and the reason written down).
- **Scope is the three images only.** `infra/oracle/scripts/run-containers.sh` was written for the INFRA-12 sandbox before images existed (builds the server from a jar, applies the chat schema with `psql`); its jar build, `psql` loop and server/chat start are removed, `infra/oracle/server.Dockerfile` is deleted, and what is left (the dependencies from the dev Compose file plus `kc-prod.override.yml`, the network and Caddy) becomes `start-stack.sh`, a one-time start that INFRA-14 reshapes. `box-prepare.sh` is untouched. Caddy and Keycloak are not managed by the deploy command.

## Out of scope (settled 2026-10-29)

Reverse-proxy and Caddy changes (INFRA-7); Keycloak and the dev-grade Postgres / Redis / RabbitMQ settings (INFRA-14); distroless server and client images (INFRA-16); down-version promotes and schema rollback (INFRA-17); the move to the A1 ARM box (INFRA-12 leftovers). Without a ticket of their own, filed together as **INFRA-18**: zero-downtime deploys, deploy notifications and a status view, Promote starting CI by itself.

## Edge cases of `sportconnect-deploy` (settled 2026-10-29)

One rule for any failure: **restore everything, not only the part that failed.** Components that this run already changed go back to the versions that were running before it, in reverse order, and the command prints a clear report.

1. **Pull fails** (network, bad or expired token): nothing is touched; the running containers stay. Message names the image and suggests checking the token and `docker login ghcr.io`.
2. **A new container fails its health probe:** all components changed in this run are put back (not only the failed one). Server: wait for the "Started SportConnectApplication" log line, then probe health from outside; chat: `GET /healthz` from outside; client: the files are in the volume. Only the containers are restored: a Liquibase migration the new server already ran stays (INFRA-17).
3. **Concurrent runs:** a lock file; the second run refuses and says which run holds it.
4. **Chat fails its start-up sync after the server was updated** (chat exits when the server is not ready): same rule, server and chat both go back.
5. **First deploy:** nothing is running, so there is nothing to restore; the command stops with a clear message if the env files, network or volumes are missing.
6. **Nothing changed:** prints "everything is up to date" and restarts nothing.
7. **`:prod` is missing for any component:** the whole deployment stops before touching anything. The message says which component has no `:prod` and what to check (that Promote ran for it, the component name, that the token can read the package).
8. **Fails halfway** (for example server done, client volume refresh fails): everything done in this run is rolled back, then the report says what was deployed, what failed, the reason and a suggestion. If a rollback step itself fails, the report says which component is now in an unknown state and the exact command to fix it by hand.
9. **A record of each run** is appended to a log file on the box (time, versions before and after, result); that, plus the terminal report, is how a deploy is made visible.

## Implementation summary (2026-10-29)

**The approved design, restated.** Deploys are pull-based and manual: GitHub moves a `prod` tag after an approval, and the owner runs one command on the box to pull what `prod` points at. No timer, no inbound port, no SSH key in GitHub, no Watchtower. Decisions are in the two sections above; this is what was built.

**GitHub side.**

- `.github/workflows/promote.yml`: a manual run (component `server`, `client` or `chat`; version `X.Y.Z` or `sha-<hex>`; an optional "skip CI check"). Only from `master`. Job `check` (no gate) runs `infra/scripts/promote-check.sh` and writes the summary the reviewer reads; job `promote`, behind the `production` Environment (required reviewer), runs `infra/scripts/promote-apply.sh`, which retags the image as `prod` by digest (`docker buildx imagetools create`, nothing rebuilt) and checks the digest afterwards. The job that waits is named `Retag <component> <now> -> <new>`.
- `promote-check.sh` refuses: an unknown component, a version that is not `X.Y.Z` or `sha-<hex>` (`edge`, `latest` and `prod` can never be promoted), an image that does not exist, an image whose commit is not the current `prod` commit or a descendant of it (the down-version block, by `git merge-base --is-ancestor` on the `org.opencontainers.image.revision` labels, so it works for releases and `sha-` builds alike), and a failed CI run for the code (level 2: a missing result only warns). The CI result is the newest push run on `master` of `<component>-ci` whose commit is the image's commit or an ancestor of it, because the CI workflows are path-filtered and `server-ci` does not list the root `gradle.properties` (a server release commit usually has no run of its own). It reads labels with `sed`, not `jq`, so the same function runs on the box.

**Box side.**

- `infra/oracle/scripts/sportconnect-deploy.sh` (installed as `/usr/local/bin/sportconnect-deploy`, run as `ubuntu`, no `sudo`): plan table (`running`, `prod`, `DEPLOY` / `unchanged`), `--plan`, `--yes`, `--version` (checksum of the file). Pulls everything first; deploys server (waits for the image's health check), chat (`GET /healthz` from the host at the container's address, the image has no shell), client (files copied aside, the image run once into `~/web/dist`, optional probe through Caddy). Hardened flags (`--cap-drop ALL`, `no-new-privileges`, `--read-only`; server also `--tmpfs /tmp` and the volume `sc-server-logs`). **Any failure restores everything the run changed**, in reverse order (old container kept as `<name>-prev`, old client files in `dist.prev`), then prints what changed, what failed, why and what to do; a restore that itself fails names the component in an unknown state. A missing `:prod` for any component stops the whole run before anything is touched. A lower `prod` version than the running one is refused. A lock file allows one run at a time; every run is appended to `~/web/deploy.log`.
- `run-containers.sh` became `infra/oracle/scripts/start-stack.sh` (dependencies from the dev Compose file with the production override, and Caddy; no jar build, no chat `psql` loop, no server or chat start). `infra/oracle/server.Dockerfile` is deleted. `box-prepare.sh` is untouched.
- `description` label added to `server/Dockerfile` and `client/Dockerfile` (the chat one had it). `.gitattributes`: `infra/oracle/scripts/*.sh` are LF (a CRLF script breaks on the box).
- Docs: `PRODUCTION_DEPLOYMENT_GUIDE.md` (new section 16, edits to sections 3, 5, 12 and 15, change-history row), `INFRASTRUCTURE_LAYOUT_AND_CICD.md`, `PORTS.md` (a file reference only: **no new ports**), the INFRA-12 runbook (a note), `PROGRESS.md`, INFRA-15 (the checks below).

**Divergences from the plan, and why.**

- The client files go into the existing bind mount `~/web/dist`, not a named volume as the INFRA-5 delta proposed: the client image's command works on a bind mount, and Caddy needs no re-creation.
- The command runs as `ubuntu` (docker group), not through `sudo`, so the GHCR login lives in `ubuntu`'s Docker config.
- The retention script needed **no change** for `prod`: it only prunes versions whose tags all start with `sha-`, so a `sha-` build that carries `prod` is kept. Checked with the real selector on a synthetic list (ids of a `sha-old`+`prod` version and of a release were not pruned).
- The workflow run title cannot hold the version that `prod` has now (it is only known after the first job); the waiting job's name and the summary carry it instead.

**Verified locally (what actually ran).**

- `promote-check.sh`: 12 scenarios against stand-in `docker` and `gh` commands in a scratch git repo, all as expected: upgrade, down-version refused, same image (no change), missing image, `edge` / `latest` refused, CI failed blocks, CI failed with the skip flag passes and records it, no CI result only warns, first promote (nothing on `prod`), `prod` commit unknown to the checkout, bad component.
- `sportconnect-deploy.sh`: 7 scenarios with real Docker against a throwaway registry (`registry:2` on localhost:5055) and stand-in images (busybox / alpine with labels and health checks): first deploy of all three; run again (up to date); partial deploy (server and client, chat unchanged); chat that exits at start (server went back too); client that fails (server and chat went back); lower `prod` version refused; server that never turns healthy (restored); `--plan`; the log file. The hardened flags ran with the stand-in images. Test containers, networks, volumes and images were removed afterwards.
- `bash -n` on both box scripts, `actionlint` (the container image `rhysd/actionlint`) on `promote.yml` (no findings printed), the `imagetools` output shape checked on public images (a single-platform manifest prints the image config as `.Image` and `.Manifest.Digest` works).

**NOT run (conditionals, recorded in INFRA-15):** the `promote` workflow on GitHub and the `production` Environment approval (including whether the repository plan offers required reviewers); the registry reads against the real GHCR packages (the label `sed` is only proven on the stand-in config JSON); `sportconnect-deploy` on the box (first run over the sandbox's locally built containers, the GHCR login, the hardened flags on the **real** server and chat images, the chat probe by container address, the real `flock`, the Caddy probe); the CI-result lookup on real `gh` output. Chat's own schema creation is CHAT-22; a chat deploy that includes it waits for that release.

**Follow-ups filed:** INFRA-17 (down-version deploy and the database schema), INFRA-18 (zero-downtime, deploy notifications, Promote starting CI), CHAT-22 (chat migrations at start-up, embedded in the image). Piggy-backed INFRA-15 checks: this PR touches `server/Dockerfile`, so its PR run covers server step 3 (GHCR login skipped on a pull request) and its merge covers step 5 (the next ordinary build stamped `0.1.0+<sha7>`); a `/release server patch` afterwards covers `0.1.1`.

## Bug found by the first real promote, and its fix (2026-10-29)

**What happened.** The first real run of `promote` (server `0.1.0`, approved) failed in the "Move prod" step: `promote-apply: ghcr.io/mr-mittt/sportconnect-server:prod is sha256:777a3f9c... after the retag, expected sha256:e2d088ac...`. The post-retag digest check did its job, but `:prod` had already been moved, to a manifest other than the approved one.

**Root cause.** `docker buildx imagetools create --tag IMAGE:prod IMAGE@DIGEST` does not copy the manifest when the source is a single-platform image (ours are pushed with `provenance: false`): it writes a new manifest list that wraps it, with its own digest. Reproduced against a throwaway registry: source `manifest.v2` `6f78fc...` became a `manifest.list.v2` `94d0bb...`. The image content was right, the digest was not, so `prod` would never have compared equal to the digest the summary showed (the no-change check, the box's compare). It was missed because the local tests of `promote-apply.sh` used a stand-in `docker`, and only the read side of `imagetools` had been checked on real images.

**Fix.** `promote-apply.sh` reads the manifest by digest through the registry API (`GET /v2/<name>/manifests/<digest>`), checks that the bytes hash to that digest, and writes the same bytes with the same content type as the tag `prod` (`PUT .../manifests/prod`); the registry token is requested from `ghcr.io/token` with the workflow's `GITHUB_TOKEN` (added to the step's `env`). The final digest check through `imagetools inspect` stays as an independent safety net. The same command works for a manifest list (a multi-platform image later).

**Verified locally (what ran).** `promote-apply.sh` against a throwaway `registry:2` on localhost:5055: a single-platform source gives `prod` == source digest; a manifest-list source gives `prod` == the list digest; switching back replaces the tag; a digest that does not exist fails with "could not read" and leaves `prod` unchanged. **Not run:** the token request against `ghcr.io` and the PUT with `GITHUB_TOKEN` (INFRA-15 check 2, rerun after this fix merges). The server's `:prod` meanwhile points at the wrapping list `777a3f...` (nothing deploys from it yet); the rerun replaces it with `e2d088...`.
