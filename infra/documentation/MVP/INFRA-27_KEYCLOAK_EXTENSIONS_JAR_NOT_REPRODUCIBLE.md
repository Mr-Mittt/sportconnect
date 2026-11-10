# INFRA-27 · The Keycloak extensions JAR in the box image is not reproducible: every server version bump makes it differ

**Status:** `TODO`
**Type:** Infrastructure (build)
**Depends on:** INFRA-19 (the box image and its build)
**Filed:** 2026-11-10, found at the box `0.2.1` install (LOC-7).

The box `Dockerfile` copies the root `gradle.properties` into the stage that builds `sportconnect-keycloak-extensions.jar` (line 21). The server version lives in that file, so each server release changes the stage's input, Docker rebuilds the JAR from unchanged source, and the new bytes differ (Gradle keeps file timestamps and does not fix the entry order). `sportconnect-setup --plan` then lists the JAR as a differing file for a release that did not touch it. At `0.2.1` the owner had to compare the two JARs entry by entry (661 entries, all CRCs equal) to be sure nothing real had changed; a future real JAR change could hide among spurious ones, and each install offers a Keycloak restart that is not needed.

**What to do (to settle at pickup):** make the JAR reproducible (`preserveFileTimestamps = false` and `reproducibleFileOrder = true` on the `jar` task in `infra/keycloak-extensions/build.gradle`), or stop feeding the server version into that stage (copy only what the extensions build needs, or pass a fixed version). Check with two builds of the same source: the JAR bytes are equal. Add a line to the box release notes only if the first release after the change still shows the JAR once (the bytes change one last time).

**Out of scope:** the theme JAR (not seen to differ), the Keycloak restart procedure.
