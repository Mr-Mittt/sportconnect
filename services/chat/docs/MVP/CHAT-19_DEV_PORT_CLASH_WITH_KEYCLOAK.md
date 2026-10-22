# CHAT-19 · Chat service default port :8081 clashes with the dev Keycloak

**Status:** `DONE` (2026-10-16, fixed inside CHAT-17, see its implementation summary) · **Type:** Bug Fix · **Depends on:** none

**Filed:** 2026-10-16, found while verifying CHAT-17: `go run ./cmd/chat` failed with "bind: Only one usage of each socket address" because the dev Compose Keycloak (INFRA-13) publishes `:8081`, the chat service's default `CHAT_HTTP_ADDR`. The client's Vite proxy (`client/vite.config.ts`, `/api/chat` → `VITE_CHAT_PROXY_TARGET ?? http://localhost:8081`) points at the same port, so in dev `/api/chat` currently reaches Keycloak.

## What

Move the chat service to a free dev port (for example `:8090`; check `infra/docker-compose.dev.yml` and the `CORS_ORIGINS` ports first) in all the places that name it: `config.go` default, `.env.example`, `client/vite.config.ts`, `client/e2e` config if it names the port, `services/chat/README.md` and `CLAUDE.md` env tables, and any Playwright/MSW target. Alternatively move Keycloak, but the chat service is the one that arrived first and is not yet deployed anywhere, so changing chat is the smaller blast radius; decide at pickup.

## Out of scope

Production ports (INFRA-14 decides).
