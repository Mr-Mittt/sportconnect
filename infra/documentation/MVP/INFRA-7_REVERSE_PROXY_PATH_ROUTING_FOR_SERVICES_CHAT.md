# INFRA-7 · Reverse-proxy path-routing for `services/chat`

**Status:** `TODO` · **Type:** Infrastructure (networking) · **Dependency:** INFRA-3 ·
**Spec:** `services/chat/docs/SYNC_DESIGN.md`, `services/chat/README.md` §6

**Origin:** the chat service's client-facing routing decision (client reaches it directly, no
Spring gateway — see `services/chat/CLAUDE.md`) already assumes a reverse proxy path-routes
`/api/chat/**` to the chat container and everything else to the server container. INFRA-3 only
scopes "Nginx or Caddy config on the EC2 instance for TLS termination" for a single origin — it
doesn't yet describe routing between two backend containers, since `services/chat` didn't exist
when INFRA-3 was written.

**What ships:**
- Nginx or Caddy config (whichever INFRA-3 actually provisioned) with two `location`/route blocks
  on the single EC2 instance: `/api/chat/**` → the chat container's port (`8090` locally, since CHAT-19; confirm
  the prod container port matches `CHAT_HTTP_ADDR`), everything else → the server container's port.
- Confirm the WebSocket upgrade (`GET /conversations/{id}/ws`) actually proxies correctly — Nginx
  in particular needs explicit `Upgrade`/`Connection` header passthrough config for this path,
  it's not automatic the way a plain HTTP proxy pass is.
- Done when: a real request to `/api/chat/healthz` through the production domain reaches the chat
  container, a real request to `/api/auth/**` still reaches the server container, and a real
  WebSocket connection through the proxy stays open and receives a pushed message (not just that
  the HTTP upgrade handshake succeeds).

## Delta 2026-10-27 (INFRA-3 / INFRA-12): the routing exists in the sandbox Caddyfile

Hosting is Oracle Cloud with Caddy as the proxy. `infra/oracle/Caddyfile` already routes `/api/chat/*` (prefix stripped) to `sc-chat:8090`, `/api/*`, `/ws*` and `/images/*` to the server, and the static client for everything else; verified from outside: `/api/chat/healthz` 200. This ticket shrinks to adopting that file as the production proxy config and covering what was **not** verified: the **WebSocket upgrade** through Caddy for chat (`/api/chat/ws`) and for the STOMP socket (`/ws`), and the chat service's origin/CORS settings behind the public host.
