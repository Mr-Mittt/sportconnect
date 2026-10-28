# INFRA-5: the client build as a small image. It holds the static files and nothing else (no web server): the box's
# Caddy container serves them. Running the image copies the build into /srv, a volume that Caddy mounts read-only:
#   docker run --rm -v web:/srv ghcr.io/mr-mittt/sportconnect-client:<tag>
# (INFRA-6 runs this as the one-shot step before Caddy starts.)
#
# Build context is client/ (the Dockerfile's own folder):
#   docker build -f client/Dockerfile -t sportconnect-client \
#     --build-arg VERSION=0.1.0-local --build-arg GIT_SHA=$(git rev-parse --short HEAD) client
# CI (.github/workflows/client-image.yml) passes the same build args plus the production Keycloak URL.

FROM node:22-slim AS build
WORKDIR /src
# pnpm at the version package.json pins ("packageManager"), the same one client-ci uses.
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .

# Baked into the bundle at build time (src/features/auth/keycloak.ts); the default is the dev Compose Keycloak, so an
# image built without the argument is not meant for a server. Every other call (/api, /images, /ws) is same-origin.
ARG VITE_KEYCLOAK_URL=http://localhost:8081
ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL}
RUN pnpm build

FROM alpine:3.20
ARG VERSION=0.0.0-local
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="sportconnect-client" \
      org.opencontainers.image.source="https://github.com/Mr-Mittt/sportconnect" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

COPY --from=build /src/dist /dist
# `cp -a` keeps the files' modes; the trailing /. also copies dotfiles. The target volume is the caller's choice.
CMD ["sh", "-c", "rm -rf /srv/* && cp -a /dist/. /srv/"]
