# LOC-7 · Saving a location fails on the production box: the timezone engine's native library cannot load from a noexec `/tmp`

**Status:** `DONE` (2026-11-10: fixed and tested on the development computer, then run on the live box with box `0.2.1` and `--recreate=server`; no new server image)
**Type:** Bug (production), with a deploy-flag change in `infra`
**Depends on:** LOC-4 (the timezone engine), INFRA-6 (the hardened run flags)
**Filed:** 2026-11-10, from the owner's report on the live box: saving a new location returned an error (the Google Maps link resolved fine; the failure was on save).

## Symptom

`docker logs sc-server` (owner's paste, 2026-11-09 16:52): `java.lang.UnsatisfiedLinkError: /tmp/libzstd-jni-1.5.7-11....so: failed to map segment from shared object`, then `Unsupported OS/arch, cannot find /linux/aarch64/libzstd-jni-1.5.7-11.so ...`, then `NoClassDefFoundError: Could not initialize class com.github.luben.zstd.ZstdInputStreamNoFinalizer` and `Unhandled exception` (HTTP 500).

## Root cause

- `createLocation` calls `LocationTimeZoneResolver` (LOC-4), which builds a `net.iakovlev:timeshape` `TimeZoneEngine` on first use. timeshape reads its zipped dataset through `com.github.luben:zstd-jni:1.5.7-11` (confirmed in the Gradle dependency tree).
- zstd-jni unpacks its native `.so` from its jar into a temp folder (`/tmp` by default) and loads it.
- `sportconnect-deploy.sh` starts the server with `--read-only --tmpfs /tmp` (INFRA-6 hardening). Docker mounts a `--tmpfs` as `noexec,nosuid,nodev` unless told otherwise; owner's pasted output from the box, 2026-11-10: `tmpfs /tmp tmpfs rw,nosuid,nodev,noexec,relatime,inode64`. The kernel refuses to map a library from a noexec mount, so the load fails. (The later "Unsupported OS/arch" lines are zstd-jni's fallback message, not the cause.)
- Nothing tests the container flags, so tests and local runs never saw it. The engine is only built on the first location save, so start-up and every other feature were fine.

Reproduced locally 2026-11-10 with the real libraries of `server.jar`, the server's own base image (`eclipse-temurin:21-jre`) and uid 10001: no hardening works; the production flags fail with the same `failed to map segment from shared object`.

## Fix (approved by the owner 2026-11-10)

**The cause, narrowly, on the box only (owner's idea, 2026-11-10: no new server image).** `sportconnect-deploy.sh` starts the server container with a second, small tmpfs `/opt/native` (`rw,exec,nosuid,nodev,size=16m`) that holds only that library, and with `-e JAVA_TOOL_OPTIONS=-DZstdTempFolder=/opt/native` (zstd-jni's own setting; the string is in its `Native` class and the test proves it works, including through this variable). `/tmp` stays `noexec`. The first draft put the option and the folder in `server/Dockerfile`, which would have needed a new server image; moving them to the box script means a box patch and `sportconnect-deploy --recreate=server` fix the running 0.2.0 server. The Docker `--tmpfs` mount creates the folder itself, owned by root with mode 1777, so uid 10001 can write to it.

**Decision (owner, 2026-11-10): a failure to start the engine must fail the save, not be swallowed.** A first draft made `LocationTimeZoneResolver` catch the failure and save the location without a timezone. Reading the one consumer of `Location.timezone` showed why that is wrong: `SessionGenerationService.resolveZone` falls back to the JVM's own zone (UTC) when a location has no timezone, so the sessions generated at a venue saved that way would be scheduled at the wrong local time, silently, and the null is stored permanently (no backfill exists). So the resolver keeps failing loudly, and its Javadoc no longer claims it "never throws": it says an engine that cannot start fails the call, that this is deliberate, and why. The class changes only in its Javadoc and by an injectable engine factory (package-private, for the tests); no behaviour changes, so it needs no server release and rides in the next one.

Alternatives considered and not taken: the option and folder in the image (a new server release for no gain); `--tmpfs /tmp:exec` (loosens `/tmp` for everything: a file written there could be run); replacing timeshape (a larger change, not checked to be possible); a catch that degrades to a null timezone (wrong session times, see above). Costs of the chosen way: the fix is in the box script, not the image (a server started some other way under the hardened flags would not have it), and the JVM prints one `Picked up JAVA_TOOL_OPTIONS` line at start-up. Why the exception is small: one 16 MB tmpfs, `nosuid`, `nodev`, that only the app writes to; the container still has `--read-only`, `--cap-drop ALL` and `no-new-privileges`.

## Consumer census

- `LocationTimeZoneResolver.resolve` has one caller, `LocationServiceImpl.createLocation` (`ifPresent(location::setTimezone)`). Behaviour is unchanged: an empty result (no polygon, in practice an out-of-range coordinate) still saves with a null timezone (see LOC-8, which proposes to reject it); an engine that cannot start now fails the save with the original error, as before the fix, until the flags are in place.
- `Location.timezone` readers: `LocationServiceImpl.toResponse` (passes it on) and `SessionGenerationService.resolveZone` (null falls back to the JVM zone, the reason for the decision above). Compatible as-is.
- Other native libraries: scanned the 159 jars of the locally built `server.jar` on 2026-11-10. Only zstd-jni bundles a library for every platform. The others with native files are netty's epoll and QUIC (linux x86_64 only) and its macOS DNS resolver, none of which exists for the arm64 box, so none is loaded there (to my knowledge netty then falls back to the JDK's networking, not tested; sign-in and refresh, which call Keycloak, work on the box).

## Tests

- `LocationTimeZoneResolverSpec` (Spock): an engine factory that throws `UnsatisfiedLinkError`, `NoClassDefFoundError`, `ExceptionInInitializerError` or `IllegalStateException` makes `resolve` throw that same error (never an empty zone); a failed start is not cached, the next call builds the engine again and answers. 10 tests pass. Mutation check: with a catch added in `resolve` that returns empty, 5 fail (the 4 failure cases and the not-cached case).
- New `infra/scripts/test-server-native-lib.sh` (7 checks, about a minute, needs Docker and `javac`): runs the real `TimeZoneEngine` of `server.jar` in the server's base image as uid 10001 under the flags read from `sportconnect-deploy.sh`. Passes: no hardening works; the old flags fail with the reported error (a control); the real flags work; without the `JAVA_TOOL_OPTIONS` entry it fails; without the extra mount it fails; `/tmp` is still `noexec` and `/opt/native` is exec, `nosuid`, `nodev`. Mutation checks: removing the mount from the deploy script and removing the variable each fail the check that needs them.
- Not run locally: the arm64 box (the local runs are amd64; the box run is recorded below), the full `:server:test` suite (the changed class has its own spec; no other test touches it), an integration test (the resolver is mocked in `LocationServiceImplSpec`; the integration is the flags test above).

## Release

A box patch only (`sportconnect-deploy.sh`; notes in `documentation/release-notes/BOX.md`, Unreleased), then on the box `sportconnect-setup` and `sportconnect-deploy --recreate=server` (the flags apply when the container is created, and an unchanged image is not redeployed otherwise). No server image, so no server release or promote; the resolver's Javadoc and test seam ride in the next one. After the recreate: `docker exec sc-server grep -E ' /(tmp|opt/native) ' /proc/mounts` shows `noexec` on `/tmp` only, saving a location in the app succeeds, and `docker logs sc-server 2>&1 | grep -c UnsatisfiedLinkError` prints 0. The result is recorded below.

**Out of scope:** the VNPT DNS failure for OpenStreetMap tiles in the browser (not our server), proxying map tiles, replacing timeshape, rejecting coordinates that resolve to no timezone (LOC-8).

## Run on the box (2026-11-10, owner's pasted outputs unless noted)

**Release.** Box `0.2.1` (PR #428), promoted to `sha256:0fe8056ac5ab…`. `sportconnect-setup --plan` showed `0.2.0` to `0.2.1` with three files: `sportconnect-deploy.sh`, its installed copy `bin/sportconnect-deploy`, and `sportconnect-keycloak-extensions.jar`.

**The unexpected JAR.** No source under `infra/keycloak-extensions` changed between the two box releases; `gradle.properties` did (the server version bump, PR #425), and the box `Dockerfile` copies it into the stage that builds the JAR, so the stage was rebuilt and the bytes changed (Gradle keeps file timestamps; the 0.2.0 install had reused a cached layer). The owner compared the installed JAR with the one in the new image: 661 entries each, all CRCs equal (`True`). Installed; Keycloak was not restarted (the install's note offered it; declined, the content is the same).

**Recreate.** `sportconnect-deploy --recreate=server`: `server 0.2.0 0.2.0 RECREATE`, chat and client unchanged, `deployed: server 0.2.0`.

**Checks.** `/proc/mounts`: `tmpfs /tmp ... rw,nosuid,nodev,noexec` and `tmpfs /opt/native ... rw,nosuid,nodev,relatime,size=16384k` (no `noexec`). `printenv JAVA_TOOL_OPTIONS`: `-DZstdTempFolder=/opt/native`. Container health: `healthy`. Saving a location in the app worked (owner's word). `docker logs sc-server 2>&1 | grep -c UnsatisfiedLinkError` printed `0` after the save.

**Not shown.** The timezone stored on the new location, and a log count taken before the save (the recreated container starts a fresh log, so the earlier error is not in it).
