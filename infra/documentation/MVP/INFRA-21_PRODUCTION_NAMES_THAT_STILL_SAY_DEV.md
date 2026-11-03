# INFRA-21 · Production names that still say "dev": containers, network, volumes and databases

**Status:** `TODO` · **Type:** Infrastructure (naming and operations hygiene) · **Depends on:** INFRA-14 (it changes the scripts and the Compose override that carry these names)

**Filed:** 2026-11-03, during the INFRA-14 rehearsal. The owner saw `sportconnect-dev-postgres-1` and friends in `docker ps` on the production box and asked why production says `dev`.

## What it is

Production runs `infra/docker-compose.dev.yml` plus `infra/oracle/kc-prod.override.yml`. Compose names resources after its project, `sportconnect-dev`, so on the production box the backing services are `sportconnect-dev-<service>-1`, the network is `sportconnect-dev_default`, and the named volumes carry the same prefix. The databases are `sportconnect_dev`, `sportconnect_chat_dev` and `keycloak_dev`. Nothing is wrong with how they work; the names mislead anyone reading `docker ps`, a backup listing or a log, and they make it easy to mistake the production box for a developer machine.

## Where the names are used (a census to repeat at pickup)

`infra/oracle/scripts/` (`rotate-credentials.sh`, `restore-from-bucket.sh`, the backup and restore scripts, `start-stack.sh`, `sportconnect-deploy.sh` network and container names), `infra/oracle/kc-prod.override.yml`, the server's `DB_NAME` and chat's `CHAT_DATABASE_URL` in the env files held in the secrets store, the realm and backup tooling, and `PRODUCTION_DEPLOYMENT_GUIDE.md`. The dev stack uses the same Compose file, so a rename must not change what a developer's `docker compose up` creates (their volumes would be orphaned).

## Options to weigh at pickup (none chosen)

1. **Production-only project name** (`name:` or `COMPOSE_PROJECT_NAME` set by `start-stack.sh`, for example `sportconnect`). New containers and network names; Compose then creates **new empty volumes**, so the data has to be moved (dump and restore, or copy the volume) with a backup taken first. Downtime.
2. **Database names only** (`ALTER DATABASE ... RENAME`, the env files and the roles' ownership scripts updated). Smaller, but touches the backup set naming and the restore scripts.
3. **Leave as is** and document it. The cost is confusion, not failure; a valid outcome if the risk of the move is judged higher than the benefit.

## Acceptance (if done)

Production names carry no `dev`; a restore from a backup taken before the change still works (the scripts accept both, or the change ships with a new full backup); a restore drill passes on the new names; `rotate-credentials.sh check` and the section 10 checks pass; the guide and its change history are updated; the dev stack is unchanged.

**Out of scope:** the container names `sc-server`, `sc-chat` and `sc-caddy` (already production names), splitting production into its own Compose file (a larger change; this ticket may recommend it).
