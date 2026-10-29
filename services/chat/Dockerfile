# Multi-stage: build with the full Go toolchain, ship a distroless final image: no shell, no package manager, small
# enough (a static Go binary) to matter on the single production box this shares with the Spring monolith.
#
# Build context is services/chat/ (INFRA-8):
#   docker build -t sportconnect-chat --build-arg VERSION=0.0.0-local --build-arg GIT_SHA=$(git rev-parse --short HEAD) services/chat
# CI (.github/workflows/chat-image.yml) passes the same build args, and GO_VERSION read from go.mod so a Go bump there
# reaches the image without editing this file. The default below only serves a plain local `docker build`; keep it equal
# to the `go` line of go.mod.
#
# The image runs as the distroless `nonroot` user (UID 65532): the service writes no files (logs go to stdout) and listens
# on 8090. It has no HEALTHCHECK (no shell to run one); GET /healthz answers 200 and is probed from outside (INFRA-6).
# It needs the environment infra/oracle/chat.env.example lists.

ARG GO_VERSION=1.25

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

ARG VERSION=0.0.0-local
ARG TARGETARCH
COPY . .
# -X stamps the version into main.version (logged at start-up); -trimpath and -s -w keep the binary small and reproducible.
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /chat ./cmd/chat

FROM gcr.io/distroless/static-debian12:nonroot

ARG VERSION=0.0.0-local
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="sportconnect-chat" \
      org.opencontainers.image.description="SportConnect chat service (Go): group and direct messages over HTTP and WebSocket" \
      org.opencontainers.image.source="https://github.com/Mr-Mittt/sportconnect" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

COPY --from=build /chat /chat
USER nonroot
EXPOSE 8090
ENTRYPOINT ["/chat"]
