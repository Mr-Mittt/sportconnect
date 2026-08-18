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
  on the single EC2 instance: `/api/chat/**` → the chat container's port (`8081` locally; confirm
  the prod container port matches `CHAT_HTTP_ADDR`), everything else → the server container's port.
- Confirm the WebSocket upgrade (`GET /conversations/{id}/ws`) actually proxies correctly — Nginx
  in particular needs explicit `Upgrade`/`Connection` header passthrough config for this path,
  it's not automatic the way a plain HTTP proxy pass is.
- Done when: a real request to `/api/chat/healthz` through the production domain reaches the chat
  container, a real request to `/api/auth/**` still reaches the server container, and a real
  WebSocket connection through the proxy stays open and receives a pushed message (not just that
  the HTTP upgrade handshake succeeds).
