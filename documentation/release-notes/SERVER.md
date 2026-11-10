# server release notes

One section per released version, newest first. Write your lines under `## Unreleased` in the same PR as the change
(rules and format: [README.md](README.md)). `/release server` checks this block, turns it into the next version's section,
writes a fresh template and uses the section as the release PR description. Versions before this file existed only say so; the history is in git.

## Unreleased

### Changes

- Saving a location no longer fails with a 500 on the production box (LOC-7). The timezone engine reads its data through zstd-jni, which unpacks a native library into a folder and loads it; the box's `/tmp` is `noexec`, so the load failed on the first location save. The image now starts the JVM with `-DZstdTempFolder=/opt/native`, a small folder the box mounts as an exec tmpfs (box patch, see Depends on).
- A location is never stored without a timezone because the engine failed: if the engine cannot start, the save fails (as it always did), because sessions generated at a location without a timezone would be scheduled in the wrong zone (LOC-7, owner's decision; the resolver's Javadoc no longer claims it never throws).

### Applied automatically

- The image creates `/opt/native` owned by the app user; nothing to do.

### Manual actions on the box

- box: install the box patch first (`sportconnect-setup`), then `sportconnect-deploy` for this server. The new container flags come from the box script, so a server deployed by an older box script still runs, but saving a location keeps failing as before.
- After the deploy, on the box: `docker exec sc-server grep -E ' /(tmp|opt/native) ' /proc/mounts` shows `noexec` on `/tmp` and not on `/opt/native`; then save a location in the app and check `docker logs sc-server 2>&1 | grep -c UnsatisfiedLinkError` prints 0.

### Rollback

- No migration: the previous server release (0.2.0) still runs against this database, and with it saving a location fails again (the bug this release fixes). Nothing else changes.

### Depends on

- box >= 0.2.1

## 0.2.0 — 2026-11-09

### Changes
- Roles come from the Keycloak access token (`realm_access.roles`, only `USER` and `ADMIN`) instead of our `user_roles` table (A37). The sign-in, refresh and `GET /api/users/me` responses still return `roles`, now taken from the token. A user the token gives no `USER` gets 403 on authenticated endpoints; deactivation is unchanged (still refused within 60 s by the database gate, even with a valid `ADMIN` token).
- Provisioning no longer attaches a role to a new user (A37).
- The `roles` and `user_roles` tables, the `Role` entity and `UserService.getUserRoles` are removed (U27, migration `V084`). Nothing read the tables after A37; this release ships both together.

### Applied automatically
- `V084__drop_roles_and_user_roles.sql` drops `user_roles` and `roles` when the server starts (U27). It cannot be undone by Liquibase and a restore of a dump taken after it does not bring the tables back.
- The Redis entry `user:access-state:{id}` shrinks from `1|USER,ADMIN` to `1` or `0`; entries cached by the previous release are still read for their 60 s TTL, so nothing needs flushing (A37).

### Manual actions on the box
- Before this release is deployed: box `0.2.0` or later is installed (`sportconnect-setup`), `apply-realm-production.sh apply` and `check` have run (all lines `ok`; they read the secret files, so run `eval "$(bash ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh)"` first and `bash ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh --clean` after), and `ADMIN` is granted in the Keycloak console to every current admin (INFRA-25). Without that, every user gets 403 until their next token refresh and nobody can reach `/admin`.
- Before the deploy, on the box, with the old server still running (U27): export who holds ADMIN today and dump the two tables, because the migration drops them and the dump is the only way back:
  `docker exec sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_dev -c "select u.id, u.email from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where r.name = 'ADMIN'"` (keep the output; grant ADMIN in Keycloak to each of those people), then
  `docker exec sportconnect-dev-postgres-1 pg_dump -U postgres -d sportconnect_dev -t roles -t user_roles > roles-before-u27.sql` and keep the file off the box.
- After the deploy: sign in, open `/admin` as an admin (a refresh may be needed), and confirm a plain user is redirected.

### Rollback
- Going back is not a plain redeploy any more (U27). The previous server release (0.1.2) loads `user_roles` for every user, so against this release's database it fails on the first authenticated request. To go back: redeploy 0.1.2, then restore the two tables from `roles-before-u27.sql` (`docker exec -i sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_dev < roles-before-u27.sql`, which recreates `roles` and `user_roles` with their rows; the dump has no data in any other table). A full database restore from the box backup also works and brings the tables back.
- The Keycloak roles are additive and need no undo.

### Depends on
- box >= 0.2.0

## 0.1.2 — 2026-11-02

### Changes

- Released before release notes existed; see `git log server-v0.1.1..server-v0.1.2`.

## 0.1.1 — 2026-11-01

### Changes

- Released before release notes existed; see `git log server-v0.1.0..server-v0.1.1`.

## 0.1.0 — 2026-10-28

### Changes

- Released before release notes existed; see `git log server-v0.1.0`.

