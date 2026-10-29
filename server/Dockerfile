# INFRA-4: the production image of the Spring server (multi-stage: JDK builds the jar, a slim JRE runs it).
#
# The Gradle build spans every module (settings.gradle), so the build context is the REPO ROOT:
#   docker build -f server/Dockerfile -t sportconnect-server \
#     --build-arg VERSION=0.1.0-local --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
# CI (.github/workflows/server-image.yml) passes the same build args. server/Dockerfile.dockerignore trims the context.
#
# Runs with the `prod` profile, which has no defaults: DB_*, REDIS_*, RABBITMQ_*, KEYCLOAK_*, INTERNAL_SERVICE_SECRET and
# the rest of application-prod.yml must come from the environment (infra/oracle/server.env.example lists them).

FROM eclipse-temurin:21-jdk AS build
WORKDIR /src

# Only what the Gradle configuration step needs. client/ and infra/keycloak-extensions are projects of the build
# (settings.gradle) but are not part of the server jar, so their build file is enough.
COPY gradlew settings.gradle build.gradle gradle.properties ./
COPY gradle gradle
COPY client/build.gradle client/build.gradle
COPY infra/keycloak-extensions/build.gradle infra/keycloak-extensions/build.gradle
COPY modules modules
COPY server server

ARG VERSION=0.0.0-local
ARG GIT_SHA=unknown
# The cache mount keeps downloaded dependencies between builds; --no-daemon because the container is thrown away.
RUN --mount=type=cache,target=/root/.gradle \
    chmod +x gradlew && \
    ./gradlew :server:bootJar -x test --no-daemon -Pversion="${VERSION}" -PgitSha="${GIT_SHA}" && \
    cp server/build/libs/server.jar /server.jar

FROM eclipse-temurin:21-jre

ARG VERSION=0.0.0-local
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="sportconnect-server" \
      org.opencontainers.image.description="SportConnect backend (Spring Boot): REST API, WebSocket and the Keycloak sign-in callback" \
      org.opencontainers.image.source="https://github.com/Mr-Mittt/sportconnect" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# Non-root. application-prod.yml logs to /var/log/sportconnect/application.log, so that directory must be writable.
RUN groupadd --system --gid 10001 app && \
    useradd --system --uid 10001 --gid app --no-create-home app && \
    mkdir -p /var/log/sportconnect && chown app:app /var/log/sportconnect
WORKDIR /app
COPY --from=build --chown=app:app /server.jar /app/server.jar
USER app

# `dev` is the application's own default; an image must never start on it by accident.
ENV SPRING_PROFILE=prod
EXPOSE 8080

# /actuator/health is the one public actuator path. With real SMTP credentials missing the mail check reports DOWN
# (INFRA-11 Delta), which marks the container unhealthy; the start period covers the Liquibase run on a cold database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fs http://localhost:8080/actuator/health || exit 1

# 60% of the container's memory limit for the heap; the rest is metaspace, threads and the other containers on the box.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=60", "-jar", "/app/server.jar"]
