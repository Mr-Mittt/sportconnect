# LOC-7 · Saving a location fails on the production box: the timezone engine's native library cannot load from a noexec `/tmp`

**Status:** `IN PROGRESS` (fixed and tested on the development computer 2026-11-10; not run on the box yet, needs box and server patch releases)
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

**The cause, narrowly.** The server container gets a second, small tmpfs `/opt/native` (`rw,exec,nosuid,nodev,size=16m`) that holds only that library, and the image starts the JVM with `-DZstdTempFolder=/opt/native` (zstd-jni's own setting; the string is in its `Native` class and the test proves it works). `/tmp` stays `noexec`. Files: `infra/oracle/scripts/sportconnect-deploy.sh` (box image) and `server/Dockerfile` (which also creates `/opt/native` owned by the app user, so a plain `docker run` without the mount still works).

**Decision (owner, 2026-11-10): a failure to start the engine must fail the save, not be swallowed.** A first draft made `LocationTimeZoneResolver` catch the failure and save the location without a timezone. Reading the one consumer of `Location.timezone` showed why that is wrong: `SessionGenerationService.resolveZone` falls back to the JVM's own zone (UTC) when a location has no timezone, so the sessions generated at a venue saved that way would be scheduled at the wrong local time, silently, and the null is stored permanently (no backfill exists). So the resolver keeps failing loudly, and its Javadoc no longer claims it "never throws": it says an engine that cannot start fails the call, that this is deliberate, and why. The only change to the class is an injectable engine factory (package-private, for the tests).

Alternatives considered and not taken: `--tmpfs /tmp:exec` (loosens `/tmp` for everything: a file written there could be run); replacing timeshape (a larger change, not checked to be possible); a catch that degrades to a null timezone (wrong session times, see above). Why the exception is small: one 16 MB tmpfs, `nosuid`, `nodev`, that only the app writes to; the container still has `--read-only`, `--cap-drop ALL` and `no-new-privileges`.

## Consumer census

- `LocationTimeZoneResolver.resolve` has one caller, `LocationServiceImpl.createLocation` (`ifPresent(location::setTimezone)`). Behaviour is unchanged: an empty result (no polygon, in practice an out-of-range coordinate) still saves with a null timezone (see LOC-8, which proposes to reject it); an engine that cannot start now fails the save with the original error, as before the fix, until the flags are in place.
- `Location.timezone` readers: `LocationServiceImpl.toResponse` (passes it on) and `SessionGenerationService.resolveZone` (null falls back to the JVM zone, the reason for the decision above). Compatible as-is.
- Other native libraries: scanned the 159 jars of the locally built `server.jar` on 2026-11-10. Only zstd-jni bundles a library for every platform. The others with native files are netty's epoll and QUIC (linux x86_64 only) and its macOS DNS resolver, none of which exists for the arm64 box, so none is loaded there (to my knowledge netty then falls back to the JDK's networking, not tested; sign-in and refresh, which call Keycloak, work on the box).

## Tests

- `LocationTimeZoneResolverSpec` (Spock): an engine factory that throws `UnsatisfiedLinkError`, `NoClassDefFoundError`, `ExceptionInInitializerError` or `IllegalStateException` makes `resolve` throw that same error (never an empty zone); a failed start is not cached, the next call builds the engine again and answers. 10 tests pass. Mutation check: with a catch added in `resolve` that returns empty, 5 fail (the 4 failure cases and the not-cached case).
- New `infra/scripts/test-server-native-lib.sh` (8 checks, about a minute, needs Docker and `javac`): runs the real `TimeZoneEngine` of `server.jar` in the server's base image as uid 10001 under the flags read from `sportconnect-deploy.sh` and the options read from the `Dockerfile`. Passes: no hardening works; the old flags fail with the reported error (a control); the real flags work; without the JVM option it fails; without the mount it fails; `/tmp` is still `noexec` and `/opt/native` is exec, `nosuid`, `nodev`; the Dockerfile creates the folder. Mutation checks: removing the mount from the deploy script fails 2 checks (3, 6b); removing the JVM option from the Dockerfile fails check 3.
- Not run: anything on the box (arm64; the local runs are amd64, the failure mechanism is the same on both), the full `:server:test` suite (the changed class has its own spec; no other test touches it), an integration test (the resolver is mocked in `LocationServiceImplSpec`; the integration is the flags test above).

## Release

A box patch (`sportconnect-deploy.sh`, then `sportconnect-setup`) and a server patch (the Dockerfile; the resolver change is documentation and a test seam); the notes are in `documentation/release-notes/BOX.md` and `SERVER.md` (Unreleased). The flags apply when the server container is recreated, which the server patch deploy does. After the deploy: `docker exec sc-server grep -E ' /(tmp|opt/native) ' /proc/mounts` shows `noexec` on `/tmp` only, saving a location in the app succeeds, and `docker logs sc-server 2>&1 | grep -c UnsatisfiedLinkError` prints 0. This ticket stays `IN PROGRESS` until that result is recorded (owner's pasted output).

**Out of scope:** the VNPT DNS failure for OpenStreetMap tiles in the browser (not our server), proxying map tiles, replacing timeshape, rejecting coordinates that resolve to no timezone (LOC-8).
