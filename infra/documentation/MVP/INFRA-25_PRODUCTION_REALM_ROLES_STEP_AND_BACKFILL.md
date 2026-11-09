# INFRA-25 · Production realm: the `roles` step in `apply-realm-production.sh` and the backfill

**Status:** `IN PROGRESS`
**Type:** Infrastructure (production realm)
**Depends on:** INFRA-24 (the release notes carry its deploy actions), A37 (defines the roles and the claim)
**Filed:** 2026-11-09, from the `/feature` session "Move roles to Keycloak": production realm changes are not made by the dev `infra/scripts/*.mjs` but by `infra/oracle/scripts/apply-realm-production.sh` (kcadm inside the container, shipped in the box image).

Add a `roles` setting to `apply-realm-production.sh` (`apply` and read-only `check`, idempotent, no secret printed): realm roles `USER` and `ADMIN`, `USER` in the realm default role, and the backfill (`USER` to every existing real user; see the scope change below). Tested on a throwaway Keycloak like INFRA-14, shipped in a box release (`/release box`), then run on the box in the order of the A37 rollout. The guide gets the step, "(not run yet)" until a pasted output exists, and the runbook line "grant ADMIN in the Keycloak console".


**Scope change, 2026-11-10 (owner, at pickup):** (1) **No ADMIN backfill.** The exported `ADMIN_IDS_FILE` and everything about reading `user_roles` is removed; the script only backfills `USER`. The owner grants `ADMIN` in the Keycloak console (Users, Role mapping) to whoever is an admin today, **before** the server release of A37, otherwise they lose `/admin` and the admin endpoints until granted. `check` lists the current members of `ADMIN` (info, never FAIL) so the owner can see who has it. (2) **The `USER` backfill runs inside every `apply`**, not a separate command; it is idempotent, so a later `apply` does no harm. (3) **Who gets `USER`:** every real user including deactivated ones (the active gate refuses them anyway and a reactivation then needs no extra step); service-account users (`service-account-*`) get nothing.

**Entry point:** the owner, on the box, after `sportconnect-setup`.

**Edge cases:** a user created while the script runs; a second run changes nothing; a user created while the backfill runs gets USER from the default role anyway; a user that cannot be updated is reported and the step fails (nothing is silently skipped).

**Out of scope:** the code that reads the claim (A37), dropping the tables (U27), roles other than USER and ADMIN.

## Implementation summary (2026-11-10)

**Built** (branch `feature/infra-25-production-realm-roles`, not merged): `infra/oracle/scripts/set-realm-roles.sh` (runs in the Keycloak container like the other `set-*.sh`): creates the realm roles `USER` and `ADMIN` (ADMIN empty), adds `USER` to the realm default role `default-roles-sportconnect`, then pages through the users (100 at a time) and gives `USER` directly to any real user whose **effective** realm roles lack it; prints `users: N checked, A already had USER, B fixed, C failed`, exits 1 on a failure (by user id, never by email). `apply-realm-production.sh` calls it as the last step of `apply`, and `check` gained `ok`/`FAIL` lines (USER exists, ADMIN exists, USER in the default role, every real user holds USER) plus an `info ADMIN members:` line. Release notes: `documentation/release-notes/BOX.md` (Unreleased). Guide: section 6 paragraph and a change-history row.

**Key decisions.** (1) The owner chose to have `USER` on every existing user and to grant `ADMIN` by hand later, so there is no ADMIN backfill and no id file. (2) Finding at exploration: an account that holds `default-roles-sportconnect` gets `USER` effectively once the composite has it (proven in the test: the token carries it), so the per-user pass is a **safety net** on effective roles, not a write per user; a normal run writes nothing. (3) Service-account users are not returned by the user listing at all (checked live); the `service-account-*` skip stays as a guard. (4) `apply` re-applies the other production realm settings too, as before; the roles step is idempotent.

**Divergences from the approved plan:** none in behaviour. The tests were first added to `test-rotate-credentials.sh` (the only existing harness with a throwaway Keycloak), then moved at the owner's request into their own `infra/scripts/test-realm-roles.sh`; `test-rotate-credentials.sh` is back to its committed content.

**Tests** (my own runs, development computer, throwaway Keycloak 26.4, `infra/scripts/test-realm-roles.sh`, its own file with its own container on :8094, listed in `PORTS.md`): 32 passed, 0 failed (and `test-rotate-credentials.sh`, back to its committed content, still 91 passed, 0 failed). Before `apply`, `check` shows the four new `FAIL` lines; `apply`: roles created, USER in the default role, `1 already had USER, 1 fixed` (a user without the default role), a second run `0 fixed`; a password-grant token has `USER` and not `ADMIN`; granting `ADMIN` by hand puts it in the token and `check` lists the member. **Mutation check:** with the roles step deleted from `do_apply`, 6 cases fail (26 passed, 6 failed, in `test-realm-roles.sh`); the file was restored byte for byte.

**Not run:** anything on the box (needs box release `0.1.4` via `/release box`, `sportconnect-setup`, then `apply-realm-production.sh apply` and `check`, then granting ADMIN in the console before the A37 server release). The token of the real `sportconnect-web` client is proven when A37 ships. This ticket stays `IN PROGRESS` until the box run is recorded in the guide (owner's pasted output).
