# INFRA-25 · Production realm: the `roles` step in `apply-realm-production.sh` and the backfill

**Status:** `TODO`
**Type:** Infrastructure (production realm)
**Depends on:** INFRA-24 (the release notes carry its deploy actions), A37 (defines the roles and the claim)
**Filed:** 2026-11-09, from the `/feature` session "Move roles to Keycloak": production realm changes are not made by the dev `infra/scripts/*.mjs` but by `infra/oracle/scripts/apply-realm-production.sh` (kcadm inside the container, shipped in the box image).

Add a `roles` setting to `apply-realm-production.sh` (`apply` and read-only `check`, idempotent, no secret printed): realm roles `USER` and `ADMIN`, `USER` in the realm default role, and the backfill (`USER` to every existing user; `ADMIN` to the user ids in a file exported from the live database's `user_roles` before anything is dropped). Tested on a throwaway Keycloak like INFRA-14, shipped in a box release (`/release box`), then run on the box in the order of the A37 rollout. The guide gets the step, "(not run yet)" until a pasted output exists, and the runbook line "grant ADMIN in the Keycloak console".

**Entry point:** the owner, on the box, after `sportconnect-setup`.

**Edge cases:** a user created while the script runs; a second run changes nothing; an id in the ADMIN file that has no Keycloak user (reported, not fatal); the export must be taken before the table-drop release (U27).

**Out of scope:** the code that reads the claim (A37), dropping the tables (U27), roles other than USER and ADMIN.
