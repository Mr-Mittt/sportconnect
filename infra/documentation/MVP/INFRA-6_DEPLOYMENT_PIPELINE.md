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
