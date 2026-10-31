# INFRA-7 · Reverse-proxy path-routing for `services/chat`

**Status:** `DONE` (2026-10-30) · **Type:** Infrastructure (networking) · **Dependency:** INFRA-3 ·
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

Hosting is Oracle Cloud with Caddy as the proxy. `infra/oracle/Caddyfile` already routes `/api/chat/*` (prefix stripped) to `sc-chat:8090`, `/api/*`, `/ws*` and `/images/*` to the server, and the static client for everything else; verified from outside: `/api/chat/healthz` 200. This ticket shrinks to adopting that file as the production proxy config and covering what was **not** verified: the **WebSocket upgrade** through Caddy for chat (`/api/chat/conversations/{id}/ws`; corrected 2026-10-30, the delta first wrote `/api/chat/ws`, which does not exist) and for the STOMP socket (`/ws`), and the chat service's origin/CORS settings behind the public host.

## Implementation summary (2026-10-30)

**Approved plan.** The routing already existed (INFRA-12), so the ticket became: adopt `infra/oracle/Caddyfile` as the production proxy config, prove both WebSockets through Caddy, and confirm the origin settings behind `https://yoursport.vn`. No proxy directive changed.

**What changed in the repo.** `infra/oracle/Caddyfile`: comments only (a production header and a rule that no `log` directive may record the query string or URI of this site, because the chat socket carries the access token as `?token=`; the STOMP token travels in the CONNECT frame). The config without its comment lines hashes the same before and after (`7e1f6650…720d`), so nothing was reloaded on the box. `PORTS.md` Caddy row reworded ("sandbox" gone). Guide: new subsection "Proxy and WebSockets (INFRA-7)" in section 10 and a change-history row. The wrong path in the 2026-10-27 delta (`/api/chat/ws`) is corrected to `/api/chat/conversations/{id}/ws`.

**What was checked, and by whom.**
- **Box, read-only (owner ran, "all correct"; the output was not pasted):** the box's Caddyfile without comment lines has the same hash as the repo file; `CHAT_CORS_ALLOWED_ORIGIN` and `CORS_ORIGINS` are `https://yoursport.vn`; RabbitMQ has the `rabbitmq_stomp` plugin enabled and listens on 61613; `sc-server` has `STOMP_RELAY_HOST=rabbitmq` and `STOMP_RELAY_PORT=61613`; the Caddyfile has no `log` directive.
- **From my computer, raw upgrade handshakes against the public host (seen by me):** chat socket without a token `401`, with a bad token `401 invalid token` and chat's CORS headers (so the prefix is stripped and the request reaches the chat service); STOMP `/ws` with origin `https://yoursport.vn` `101 Switching Protocols`; with origin `https://evil.example` `403`.
- **Live sockets in the browser (owner, two signed-in users, DevTools Network, "all same with your expectation"; no frames pasted):** the chat socket shows 101 and stays open and a message sent by the other user arrives live; the STOMP socket shows 101, `CONNECTED`, the subscription and a pushed notification that raised the bell with no refresh; an idle socket (about 2 minutes) still received a message. This also shows the RabbitMQ relay works on the box.
- **Not run live:** the chat socket with a valid token and a wrong `Origin` (the token lives only in the page's memory; chat's origin setting is checked above). The Chrome extension was not connected, so I did not drive the browser myself.
- **Earlier, same day or before:** `/api/chat/healthz` and `/api/auth/**` through the public host (guide section 10, rows 28 and 29 of the INFRA-3 rebuild log).

**Found on the way.** The 1:1 chat box on `/friends` stays unavailable after accepting a friend request until a reload: filed as client ticket FRIEND-3.
