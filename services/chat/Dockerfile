# First Dockerfile in this repo. Multi-stage: build with the full Go
# toolchain, ship a distroless final image — no shell, no package manager,
# small enough (a static Go binary, typically <20MB) to matter on the
# single 1GB-RAM production box this shares with the Spring monolith.

FROM golang:1.22-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /chat ./cmd/chat

FROM gcr.io/distroless/static-debian12
COPY --from=build /chat /chat
EXPOSE 8081
ENTRYPOINT ["/chat"]
