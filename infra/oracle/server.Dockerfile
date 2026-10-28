# SUPERSEDED by server/Dockerfile (INFRA-4, the real multi-stage image published to GHCR). This file stays only because
# run-containers.sh still builds the box's image from a jar with it; INFRA-6 replaces both with a pull from GHCR.
#
# INFRA-12 sandbox: a THROWAWAY image for the Spring server, used only to measure and run the stack on the Oracle box.
# This is NOT the INFRA-4 deliverable: the repo has no server Dockerfile yet, and INFRA-4 should replace this (multi-stage
# build in CI, a non-root user, JVM memory flags, a health check). No -Xmx here, so the JVM picks its default heap from the
# host memory; the idle server used about 690 MiB on the sandbox.
#
# build context: a folder holding this file renamed to `Dockerfile` and `server.jar`
#   ./gradlew :server:bootJar -x test          # on the dev machine, then copy server/build/libs/server.jar over
#   docker build -t sc-server <folder>
FROM eclipse-temurin:21-jre
COPY server.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
