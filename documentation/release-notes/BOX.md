# box release notes

One section per released version, newest first. Write your lines under `## Unreleased` in the same PR as the change
(rules and format: [README.md](README.md)). `/release box` checks this block, turns it into the next version's section,
writes a fresh template and uses the section as the release PR description. Versions before this file existed only say so; the history is in git.

## Unreleased

### Changes

- `sportconnect-deploy` starts the server container with a second small tmpfs, `/opt/native` (`rw,exec,nosuid,nodev`, 16 MB), next to `/tmp`, which stays `noexec`, and with `JAVA_TOOL_OPTIONS=-DZstdTempFolder=/opt/native` (LOC-7). This fixes saving a location on the box, which returned a 500: the timezone engine's zstd-jni library has to load a native file, which the `noexec` `/tmp` refuses. No new server image is needed.

### Applied automatically

- Nothing at install. The running server keeps its old flags until its container is created again (the manual step below).

### Manual actions on the box

- box: `sportconnect-setup` (it installs the changed `sportconnect-deploy`), then `sportconnect-deploy --recreate=server`. This restarts the server from the image it already runs, so the API is unavailable for the health wait (about a minute).
- Check, on the box: `docker exec sc-server grep -E ' /(tmp|opt/native) ' /proc/mounts` shows `noexec` on `/tmp` and not on `/opt/native`; then save a location in the app, and `docker logs sc-server 2>&1 | grep -c UnsatisfiedLinkError` prints 0.

### Rollback

- Nothing to undo: the extra folder and the JVM property only add a place for that one library. If the new container fails its health check, `sportconnect-deploy` puts the previous one back (as for any deploy).

### Depends on

- none

## 0.2.0 — 2026-11-09

### Changes
- `apply-realm-production.sh` gets a realm roles step (INFRA-25, for A37): the realm roles `USER` and `ADMIN`, `USER` in the realm default role, and `USER` for every existing user that lacks it. `check` gets the matching `ok`/`FAIL` lines and lists the members of `ADMIN`.
- The realm seed file (`infra/keycloak/realm/sportconnect-realm.json`) now defines the roles `USER` and `ADMIN` and the default role (A37). It only seeds a brand-new realm (the import is `IGNORE_EXISTING`), so the live realm is unchanged by it.

### Applied automatically
- `sportconnect-setup` installs the new `set-realm-roles.sh` and the changed `apply-realm-production.sh` under `~/sportconnect/infra/oracle/scripts`. Nothing in the realm changes until the manual step below.

### Manual actions on the box
- box: `sportconnect-setup`, then `bash ~/sportconnect/infra/oracle/scripts/apply-realm-production.sh apply`, then `... check` (all lines `ok`; the `ADMIN` line is info). `apply` also re-applies the other production realm settings, as before (INFRA-14).
- Keycloak console (Users, Role mapping): grant `ADMIN` to whoever is an admin today, **before** the server release that reads roles from the token (A37). Nothing grants it automatically.

### Rollback
- Additive: the roles and the default-role entry are new; the previous box release and the current server ignore them. To undo, delete the roles `USER` and `ADMIN` in the console.

## 0.1.3 — 2026-11-06

### Changes

- Released before release notes existed; see `git log box-v0.1.2..box-v0.1.3`.

## 0.1.2 — 2026-11-06

### Changes

- Released before release notes existed; see `git log box-v0.1.1..box-v0.1.2`.

## 0.1.1 — 2026-11-05

### Changes

- Released before release notes existed; see `git log box-v0.1.0..box-v0.1.1`.

## 0.1.0 — 2026-11-05

### Changes

- Released before release notes existed; see `git log box-v0.1.0`.

