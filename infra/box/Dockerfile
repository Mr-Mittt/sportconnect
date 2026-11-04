# INFRA-19: the "box" config image. A data-only image: it holds every NON-SECRET file the Oracle box needs (the Compose files,
# the Caddyfile, the production override, init SQL, RabbitMQ config, the realm and themes, the box's scripts) and the two
# Keycloak provider JARs, which are built here in CI instead of on a computer. Nothing runs from it: `sportconnect-setup`
# (infra/oracle/scripts/sportconnect-setup.sh) runs it once to copy the files out into a staging folder, then installs them:
#   docker run --rm -e OWNER_UID=$(id -u) -e OWNER_GID=$(id -g) -v "$STAGE:/out" ghcr.io/mr-mittt/sportconnect-box:<tag>
#
# Build context is the REPOSITORY ROOT, and infra/box/Dockerfile.dockerignore is an allow-list: only the paths below can
# enter a build, so a local `docker build` can never pick up infra/keycloak/providers/client_secret_*.json or an .env file.
#   docker build -f infra/box/Dockerfile -t sportconnect-box --build-arg VERSION=0.0.0-local \
#     --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
# CI (.github/workflows/box-image.yml) passes the same build args. infra/scripts/verify-box-image.sh checks the finished image.
#
# Layout inside the image (/box): sportconnect/ is unpacked to ~/sportconnect, web/ to ~/web, bin/ to /usr/local/bin.

# Both JAR stages run on the BUILD machine whatever the target (the JARs are architecture-independent), so an arm64 image is
# not built under emulation. Only the last stage is per platform.
# ---- the Keycloak extensions JAR (phone rules, normalized email, account link): JDK 21 + Gradle -------------------------------
FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk AS extensions
WORKDIR /src
# Only this one project is built, so the settings file is written here instead of copying every module of the monolith.
COPY gradlew build.gradle gradle.properties ./
COPY gradle gradle
COPY infra/keycloak-extensions infra/keycloak-extensions
RUN printf "rootProject.name = 'box'\ninclude 'infra:keycloak-extensions'\n" > settings.gradle \
 && sed -i 's/\r$//' gradlew && chmod +x gradlew \
 && ./gradlew --no-daemon -q :infra:keycloak-extensions:jar \
 && test -s infra/keycloak-extensions/build/libs/sportconnect-keycloak-extensions.jar

# ---- the Keycloakify login theme JAR: Node + pnpm, and a JDK and Maven (keycloakify build calls Maven) -----------------------
FROM --platform=$BUILDPLATFORM node:22-slim AS theme
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-jdk-headless maven \
 && rm -rf /var/lib/apt/lists/*
# The theme compiles the CLIENT's own design files (vite alias '@' -> ../src, theme.css imports ../../src/index.css, Template.tsx
# imports ../../../public/earth.png), so the repository's folder layout is kept: /client/keycloak-theme next to /client/src. Its
# tsconfig type-checks whole client folders (src/shared/ui), whose imports resolve from client/node_modules as on a developer
# machine, so the client's own packages are installed too (the same lockfile client-ci uses).
WORKDIR /client
RUN corepack enable
COPY client/package.json client/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY client/src /client/src
COPY client/public /client/public
WORKDIR /client/keycloak-theme
COPY client/keycloak-theme/package.json client/keycloak-theme/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY client/keycloak-theme .
RUN pnpm run build-keycloak-theme  && test -s dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar

# ---- the files --------------------------------------------------------------------------------------------------------------
FROM alpine:3.20
ARG VERSION=0.0.0-local
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="sportconnect-box" \
      org.opencontainers.image.description="SportConnect box config: the non-secret files of the Oracle box, installed by sportconnect-setup" \
      org.opencontainers.image.source="https://github.com/Mr-Mittt/sportconnect" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# ~/sportconnect/infra: the tree the Compose file's relative mounts expect (./scripts, ./rabbitmq, ./keycloak)
COPY infra/docker-compose.dev.yml /box/sportconnect/infra/docker-compose.dev.yml
COPY infra/scripts/init-chat-db.sql infra/scripts/create-keycloak-db.sh /box/sportconnect/infra/scripts/
COPY infra/rabbitmq /box/sportconnect/infra/rabbitmq
COPY infra/keycloak/realm /box/sportconnect/infra/keycloak/realm
COPY infra/keycloak/themes /box/sportconnect/infra/keycloak/themes
COPY --from=extensions /src/infra/keycloak-extensions/build/libs/sportconnect-keycloak-extensions.jar /box/sportconnect/infra/keycloak/providers/
COPY --from=theme /client/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar /box/sportconnect/infra/keycloak/providers/sportconnect-keycloak-theme.jar
# the box's own files, with the scripts (the Caddyfile and the override are also placed in ~/web, below)
COPY infra/oracle /box/sportconnect/infra/oracle
COPY infra/oracle/Caddyfile infra/oracle/kc-prod.override.yml /box/web/
# the command that deploys the application images
COPY infra/oracle/scripts/sportconnect-deploy.sh /box/bin/sportconnect-deploy

# A Windows checkout may carry CRLF endings; the files must be LF on the box (the .gitattributes of the repo already says so for
# the scripts, this keeps a hand-run build honest too). The two JARs are binary and are left alone.
RUN find /box -type f \( -name '*.sh' -o -name '*.yml' -o -name '*.sql' -o -name '*.json' -o -name '*.conf' -o -name '*.example' \
      -o -name '*.service' -o -name '*.timer' -o -name '*.md' -o -name '*.properties' -o -name '*.ftl' -o -name Caddyfile \
      -o -name enabled_plugins -o -name sportconnect-deploy \) -exec sed -i 's/\r$//' {} + \
 && chmod 0755 /box/bin/sportconnect-deploy /box/sportconnect/infra/oracle/scripts/*.sh /box/sportconnect/infra/scripts/*.sh

# Running the image copies the files into /out (the caller's staging folder) and hands them to OWNER_UID:OWNER_GID.
CMD ["sh", "-c", "rm -rf /out/* /out/.[!.]* 2>/dev/null; cp -a /box/. /out/ && chown -R \"${OWNER_UID:-0}:${OWNER_GID:-0}\" /out"]
