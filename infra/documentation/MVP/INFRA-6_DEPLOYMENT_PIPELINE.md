# INFRA-6 · Deployment pipeline (`deploy.yml`)

**Status:** `TODO` · **Type:** Infrastructure (CD) · **Dependency:** INFRA-3, INFRA-4, INFRA-5 ·
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
