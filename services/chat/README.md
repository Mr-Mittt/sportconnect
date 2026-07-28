# services/chat

The chat service for SportConnect — group chat and 1:1 direct messages. Written in Go, backed by
its own Postgres database. This is the first service in the repo that is **not** a Java Gradle
module under `modules/` and **not** part of the React client under `client/` — it's a separate
program that runs, builds, and deploys on its own.

If you're new to Go, read `GO_MUST_KNOW.md` first — it uses this exact service as the worked
example for every concept it introduces. This file (`README.md`) assumes you already know how to
read Go and focuses on what this specific service does and how it fits into the rest of the app.

For the design decisions behind the choices below (why Go, why this sync mechanism, why this
schema), see `CLAUDE.md` in this folder and `docs/SYNC_DESIGN.md`.

---

## 1. What this service owns

- **Conversations** — both group chat (tied to a Java-monolith `Group`) and 1:1 direct messages, in
  one data model.
- **Messages** — sending and paginated history.
- **Real-time delivery** — a WebSocket connection per open chat view, fed by whoever just sent a
  message in that conversation.

It does **not** own group membership, friendships, or user profiles — those stay in the Java
monolith. This service keeps its own **read-only copy** of just enough of that data to answer "is
this caller allowed to do this right now?" without ever calling the monolith at request time. How
that copy stays fresh is the sync mechanism described in §6.

---

## 2. Directory structure

```
cmd/chat/main.go        Program entry point — wires everything below and starts the server
internal/
  config/               Reads required/optional environment variables at startup
  auth/                 Verifies the monolith's JWTs; middleware that authenticates every request
  conversation/         Domain: conversations + participants, "is this caller allowed here"
  message/              Domain: chat_messages — send, paginated history, sender-name resolution
  sync/                 Talks to the monolith: consumes Redis Stream events + one-time HTTP pull;
                         owns the local cache tables conversation/message read from
  ws/                   WebSocket connection registry + per-conversation broadcast (pure transport)
  api/                  HTTP routes, request parsing, response shaping — thin glue over the above
  db/                   Postgres connection pool setup
  platform/             Logging + shared error type, used by everything else
migrations/             Database schema, applied with the golang-migrate tool
docs/
  SYNC_DESIGN.md         Full detail on how this service and the monolith stay in sync
CLAUDE.md                Conventions for working in this codebase (style, testing, dependencies)
Dockerfile               Production container image
```

Read `cmd/chat/main.go` first if you want to see how the pieces connect — it's short and it's the
one file that touches every package.

---

## 3. Dependencies

**Runtime dependencies — things that must be running for this service to work:**

| Dependency | What it's for |
|---|---|
| Postgres | This service's own database (`CHAT_DATABASE_URL`) — never the monolith's database |
| Redis | Shared with the monolith — used as the transport for the sync mechanism (§6) |
| The Java monolith (Spring Boot app) | Only for: (a) minting the JWTs this service verifies, (b) the one-time cold-start data pull (§6.3) |

Note what's *not* in that list: the monolith is **not** a runtime dependency for normal chat
traffic. Sending a message, reading history, or opening a WebSocket never calls the monolith. It's
only involved when a JWT was issued (elsewhere, earlier) and during the sync mechanism.

**Go library dependencies** (see `go.mod`):

| Library | Used for |
|---|---|
| `github.com/jackc/pgx/v5` | Postgres driver + connection pool |
| `github.com/golang-jwt/jwt/v5` | Verifying the monolith's JWTs |
| `github.com/redis/go-redis/v9` | Reading the sync event stream from Redis |
| `github.com/coder/websocket` | WebSocket connections for real-time delivery |
| `github.com/stretchr/testify` | Test assertions |

Deliberately not a dependency: any HTTP router/framework (the standard library's `net/http` is
enough at this route count), any ORM (plain SQL via `pgx`), any dependency-injection framework
(everything is wired by hand in `main.go`).

---

## 4. Configuration

Every setting comes from an environment variable, read once at startup by `internal/config`. A
required variable with no value makes the service refuse to start (loudly, with a clear error) —
it never falls back to an insecure default.

For local development, copy `.env.example` to `.env` and fill it in — `internal/config.Load()`
loads that file automatically (via `godotenv`) before reading the environment, so you only set
these once instead of re-exporting them every shell session. `.env` is gitignored; only
`.env.example` (with placeholder values) is checked in. This is a dev convenience only, not a real
config system — see `CLAUDE.md`'s "Dependency philosophy" note. It never overrides a variable
that's already set in your actual shell environment, and in CI/production (where there's no `.env`
file at all) it's silently a no-op.

| Variable | Required? | Default | What it's for |
|---|---|---|---|
| `CHAT_DATABASE_URL` | **Yes** | — | This service's own Postgres connection string |
| `JWT_SECRET` | **Yes** | — | Must be byte-identical to the monolith's `app.jwt.secret` — this is how a token minted by Spring is verifiable here without ever calling Spring |
| `INTERNAL_SERVICE_SECRET` | **Yes** | — | Sent as a header on this service's calls to the monolith's `/internal/sync/**` endpoints (§6.3); must match the monolith's `app.internal-service-secret` |
| `REDIS_ADDR` | No | `localhost:6379` | Same Redis instance the monolith already uses |
| `MONOLITH_BASE_URL` | No | `http://localhost:8080` | Only used for the one-time bootstrap pull (§6.3) |
| `CHAT_HTTP_ADDR` | No | `:8081` | Where this service listens |
| `CHAT_CORS_ALLOWED_ORIGIN` | No | `http://localhost:5173` | The Vite dev server's origin |

---

## 5. Running it

### Local development

```bash
# 1. Start shared dependencies (from the repo root)
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres (incl. this service's own DB) + Redis

# 2. Set the required config, once (from services/chat/)
cp .env.example .env
# ... edit .env: fill in JWT_SECRET/INTERNAL_SERVICE_SECRET to match the monolith's dev values

# 3. Run it
go run ./cmd/chat
```

(`.env` is loaded automatically — see §4 above. If you'd rather export the variables directly
instead of using a file, that works too; real env vars always take precedence over `.env`.)

The monolith (`./gradlew :server:bootRun`) and the client (`cd client && pnpm dev`) run the same
way they always have — this service is a fourth thing running alongside them, not a replacement for
any of them. See root `CLAUDE.md`'s dev workflow for the other three.

**Applying migrations** (needs the [`golang-migrate`](https://github.com/golang-migrate/migrate)
CLI installed separately — it is not part of `go build`):

```bash
migrate -path migrations -database "${CHAT_DATABASE_URL}?sslmode=disable" up
```

The `?sslmode=disable` suffix is only needed for `migrate` itself — its driver defaults to
requiring SSL and fails against a local Postgres with none configured. The service's own
`CHAT_DATABASE_URL` (in `.env`) doesn't need it: `pgx` (what the service uses) defaults to
`sslmode=prefer` and falls back to plaintext automatically.

### Building, testing, checking

```bash
go build ./...     # compiles everything
go vet ./...        # catches common mistakes the compiler doesn't
go test ./...        # runs all tests
```

Run all three before considering any change here done — see `CLAUDE.md`'s "Before committing"
note for why (this codebase was scaffolded without a Go toolchain available to check it, so the
first real `go` run against it matters more than usual).

**`go test ./...` needs real infrastructure running, not just the Go toolchain** — most of this
service's tests are DB-/Redis-backed integration tests, not pure-unit tests, per `CLAUDE.md`'s
testing convention (CHAT-5, CHAT-6):

| Package | Needs |
|---|---|
| `internal/conversation`, `internal/message`, `internal/sync` | The dev compose stack's Postgres (`sportconnect_chat_dev`) — see step 1 above. Tests run inside a transaction rolled back at the end, so they never leave rows behind. |
| `internal/sync` (consumer resilience tests) | The dev compose stack's Redis too — each test uses a throwaway stream/consumer-group name, isolated from the real `sportconnect:domain-events` stream and `chat-service` group a real running instance of this service would use. |
| `internal/sync` (bootstrap pagination test) | The real monolith running (`./gradlew :server:bootRun`) and reachable at `MONOLITH_BASE_URL` — this one test seeds a handful of synthetic rows directly into the monolith's own dev Postgres, hits the real `/internal/sync/**` endpoint, and cleans up afterward. |
| `internal/api` (WebSocket broadcast test) | Just the dev Postgres (spins up its own `httptest.Server`, no separately-running chat process needed) |

If any of the above isn't running, the relevant test fails loudly with a clear message (never
skips silently) — start the dev compose stack (and, for the bootstrap test, the monolith too)
first. The one deliberate exception is the bootstrap test itself: it skips (doesn't fail) when
`INTERNAL_SERVICE_SECRET` isn't set, since that's this suite's one signal that the environment
isn't set up to run the monolith at all. CI (`chat-ci.yml`) provisions its own throwaway Postgres
and Redis for this; it never sets `INTERNAL_SERVICE_SECRET`, so the bootstrap test always skips
there (see that workflow's own notes).

### Production

`Dockerfile` builds a small, self-contained image (a compiled Go binary, no JVM, no Node — a few
MB). It's meant to run as a third container alongside the monolith and Redis on the same host,
reachable from the internet only at `/api/chat/**` via whatever reverse proxy fronts the whole app
(not yet built in this repo for any service — see `docs/SYNC_DESIGN.md`'s punch list).

---

## 6. How this service talks to the rest of the system

```
┌──────────┐   /api/chat/**  (direct, no Spring gateway)   ┌──────────────┐
│  Client  │ ───────────────────────────────────────────►  │  chat (Go)   │
└──────────┘                                                └──────┬───────┘
                                                                    │
       JWT verified independently, same secret as Spring           │
                                                                    │
┌──────────┐   /api/**                                     ┌───────▼──────┐
│  Client  │ ──────────────────────────────────────────►    │ Spring Boot  │
└──────────┘                                                └──────┬───────┘
                                                                    │
                            Redis Stream (async, one-directional)  │
                            + one-time HTTP bootstrap pull         │
                                                                    ▼
                                                          chat's own Postgres
                                                       (local cache of just enough
                                                        monolith data to authorize)
```

### 6.1 Authentication — independent, not delegated

Every request to this service (except `GET /healthz`) must carry `Authorization: Bearer <token>`,
**except** `GET /conversations/{id}/ws` (§7), which also accepts the token as a `?token=` query
parameter — a browser's native `WebSocket` API cannot set custom headers during the handshake, so
that one route needs a fallback the rest don't. The token is the exact same JWT the monolith's
login/refresh endpoints issue. This service verifies its signature and expiry itself, using the
shared `JWT_SECRET` — it never calls Spring to check if a token is valid. That's what makes "the
client talks to this service directly" workable: there's no single point that both services depend
on to answer "who is this."

Signature verification accepts HS256, HS384, *and* HS512 — not just HS256. JJWT 0.12.x's
`Jwts.builder().signWith(key)` (the monolith's own signing call site, `JwtTokenServiceImpl`) picks
the strongest HMAC-SHA variant the *key's byte length* supports, not a fixed algorithm; a long
enough `JWT_SECRET` (as the real dev value is) actually produces HS512 tokens. All three variants
verify against the same secret bytes, so accepting all three is exactly as secure as accepting one
— CHAT-7 found and fixed this after every real monolith-issued token was being rejected by a
verifier that only allowed HS256 (`internal/auth`'s own tests never caught it, since they mint
HS256 tokens themselves).

### 6.2 Authorization — reads a local cache, never a live call

Knowing *who* the caller is isn't the same as knowing whether they're allowed in a given
conversation (a group member, or a friend, in the monolith's data). Rather than asking the monolith
"is this user a member of group 42?" on every single chat request, this service keeps its own
read-only copy of that answer, in tables it owns:

- `group_members_cache` — mirrors the monolith's group membership
- `friendships_cache` — mirrors the monolith's friendships
- `user_profiles_cache` — mirrors display name/avatar, so a sender's name never has to be fetched
  live (or trusted from the client) when rendering a message

`internal/conversation` and `internal/message` only ever read these tables. Nothing outside
`internal/sync` ever writes them.

### 6.3 Keeping that cache fresh — the sync mechanism

Two parts, working together (full detail in `docs/SYNC_DESIGN.md`):

1. **Ongoing deltas.** Every time something relevant changes in the monolith (someone joins/leaves
   a group, a group is deleted, a friend request is accepted/removed, someone changes their display
   name), Spring publishes a small event onto a Redis Stream (`sportconnect:domain-events`). This
   service has a background loop (`internal/sync.Consumer`, started in `main.go`) permanently reading
   that stream and updating the cache tables above. On every start (including after a crash), the
   consumer first reclaims and re-processes any of its own entries left pending/unacked from a prior
   run (`Consumer.reclaimPending`) before moving on to new events — a handler failure never silently
   drops an update. This only reclaims *this same consumer identity's* own pending entries; recovering
   a *different* stuck consumer's entries (relevant only once this service ever runs as more than one
   instance) still needs `XAUTOCLAIM`, not yet implemented — see `CLAUDE.md`'s Known gaps.
2. **Cold-start bootstrap.** A stream only carries events from the moment something subscribes to
   it — it can't tell this service about a group that already had 50 members before this service
   ever existed. So, once, the first time this service's database is empty, it calls three
   internal-only endpoints on the monolith (`/internal/sync/group-members`, `/internal/sync/friendships`,
   `/internal/sync/users`) to pull the *entire* current state and seed the cache. After that first
   run, it never needs to do this again — the stream keeps it current, even across restarts.

Those `/internal/sync/**` endpoints are not part of the public API — they're gated by a shared
secret header (`X-Internal-Service-Secret`) and are meant to be unreachable from outside the
server's own network in production.

### 6.4 Real-time delivery — a broadcast, not a two-way channel

Opening a chat view establishes a WebSocket connection (`GET /conversations/{id}/ws`) to this
service. That connection is used **one way**: the server pushes updates down it. Sending, editing,
or deleting a message always goes through the corresponding REST endpoint (§7), which persists the
change and then hands it to `internal/ws.Hub.Broadcast`, which pushes it to every connection on that
same conversation (**including the caller's own**, if they have more than one tab/session open — the
client is expected to dedupe by message id, see the "the caller's own connections too" note under
§7's message endpoints). If you send a WebSocket frame *to* the server, it's read and discarded —
this service doesn't listen for chat content over the socket, only over the REST endpoints.

Every broadcast frame is a JSON envelope, not a bare message object:

```json
{ "type": "MESSAGE_CREATED", "message": { "id": 501, "...": "..." } }
```

`type` is one of `MESSAGE_CREATED`, `MESSAGE_EDITED`, or `MESSAGE_DELETED` (CHAT-13) — `message` is
always the same shape shown under §7's message endpoints, current as of whichever change just
happened. This is the wire contract every client must parse; there is no bare-message form anymore
(CHAT-7/8/9 originally shipped one, superseded in the same change that added edit/delete).

`USER_TYPING` (CHAT-15) is a sibling envelope with an unrelated `typing` payload, not a fourth
message-shaped variant:

```json
{ "type": "USER_TYPING", "typing": { "conversationId": 1, "userId": "...", "displayName": "Jordan Lee", "isTyping": true } }
```

Unlike every other broadcast, this one is **not** sent back to the sender's own connection(s) — see
`POST /conversations/{id}/typing` below. It's also never persisted; there is no `chat_messages`-style
row backing it, purely a live relay through `internal/ws.Hub`.

---

## 7. API reference

Base path in production: `/api/chat` (via the reverse proxy — see `docs/SYNC_DESIGN.md`). In local
dev, the client's Vite proxy maps `/api/chat/**` straight to this service, so the paths below are
relative to whatever that base is — e.g. `GET /conversations/{id}/messages` is reached at
`/api/chat/conversations/{id}/messages`.

Every endpoint except `GET /healthz` requires `Authorization: Bearer <jwt>`. A missing or invalid
token gets `401 Unauthorized`.

### `GET /healthz`

No auth required. Returns `200 OK` with `{"status": "ok"}` — used for container health checks.

### `POST /conversations/open/group/{groupId}`

Opens (creating if it doesn't exist yet) the chat conversation for a group. Fails if the caller
isn't currently a member of that group, per the local cache (§6.2).

**Response `200 OK`:**
```json
{
  "id": 1,
  "type": "GROUP",
  "externalGroupId": 42,
  "createdAt": "2026-07-26T10:15:00Z"
}
```

**Errors:** `403 Forbidden` (`{"error": "forbidden", "message": "..."}`) if the caller isn't a
member.

### `POST /conversations/open/direct/{userId}`

Opens (creating if it doesn't exist yet) the 1:1 conversation between the caller and `userId`. Fails
if they aren't currently friends, per the local cache.

**Response:** same shape as above, with `"type": "DIRECT"` and no `externalGroupId`.

**Errors:** `403 Forbidden` if they aren't friends.

### `POST /conversations/{id}/messages`

Sends a message into conversation `id` (the numeric ID returned by one of the two "open" endpoints
above, not a group ID). Re-checks the caller is still allowed in this conversation on every call —
not just when it was first opened.

**Request body:**
```json
{ "content": "Let's play Friday" }
```

**Response `201 Created`:**
```json
{
  "id": 501,
  "conversationId": 1,
  "senderId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "senderFullName": "Jordan Lee",
  "senderAvatarUrl": "https://.../avatar.jpg",
  "content": "Let's play Friday",
  "createdAt": "2026-07-26T10:15:00Z",
  "editedAt": null,
  "deletedAt": null
}
```
`senderFullName`/`senderAvatarUrl` are always resolved server-side from `user_profiles_cache` —
never taken from the request body, so a caller can't spoof their displayed name. `editedAt`/
`deletedAt` (CHAT-13) are **always present**, explicit JSON `null` until a message is actually
edited/deleted — deliberately not `omitempty` like `senderAvatarUrl` above. A real bug shipped
briefly with `omitempty` on these two: Go's `encoding/json` omits a nil-pointer `omitempty` field
from the output entirely rather than emitting `null`, which a JS client decodes as `undefined` —
and a client checking `deletedAt !== null` (matching this field's `string | null` type, not
`string | null | undefined`) sees `undefined !== null` as `true`. Every untouched message rendered
as deleted immediately. Fixed same-day; see `docs/CHAT-13_EDIT_DELETE_MESSAGES.md`.

On success, the same message is pushed to every client currently connected via WebSocket to this
conversation (§6.4) — including the sender's own other connections — wrapped in a
`{"type": "MESSAGE_CREATED", "message": {...}}` envelope.

**Errors:**
- `403 Forbidden` — caller no longer allowed in this conversation
- `400 Bad Request` — empty content, or content over 1000 characters
  (`{"error": "bad_request", "message": "..."}`)

### `PATCH /conversations/{id}/messages/{messageId}`

Edits a message's content in place (CHAT-13) — no edit history is kept, just the current content
plus an `editedAt` timestamp. **Sender only** — no group-admin moderation over others' messages, and
no time window (a message can be edited indefinitely).

**Request body:**
```json
{ "content": "Let's play Friday at 6pm" }
```

**Response `200 OK`:** the updated message, same shape as `POST .../messages`, with `editedAt` now
set. Broadcast to every connection on the conversation as `{"type": "MESSAGE_EDITED", "message": {...}}`.

**Errors:**
- `403 Forbidden` — caller isn't allowed in this conversation, or isn't the message's sender
- `404 Not Found` — no such message, or it's already been deleted (soft-deleted messages are treated
  as not-found for edit/delete purposes)
- `400 Bad Request` — empty content, or content over 1000 characters

### `DELETE /conversations/{id}/messages/{messageId}`

Soft-deletes a message (CHAT-13): stamps `deletedAt` and scrubs `content` to an empty string
server-side — the original text is never re-served by `GET .../messages` afterward. The row itself
stays (id/position stability), matching this app's `User.isActive`/`Group.isActive` convention
elsewhere. Same sender-only, no-time-window rules as editing.

**Response `200 OK`:** the now-deleted message (`content: ""`, `deletedAt` set). Broadcast as
`{"type": "MESSAGE_DELETED", "message": {...}}`.

**Errors:** same `403`/`404` cases as `PATCH`, no content-related `400` (there's no request body).

### `GET /conversations/{id}/messages`

Paginated message history, newest first.

**Query params:**
| Param | Meaning |
|---|---|
| `before` | Message ID cursor — returns messages older than this one. Omit for the most recent page. |
| `limit` | Page size, 1–200, default 50. |

**Response `200 OK`:** a JSON array of the same message shape shown above — a deleted message in
this list still has its row (`content: ""`, `deletedAt` set), not omitted.

**Errors:** `403 Forbidden` if the caller isn't currently allowed in this conversation.

### `GET /conversations/{id}/ws`

Upgrades the connection to a WebSocket. Same authorization check as the endpoints above. Once
connected, the server pushes every create/edit/delete on this conversation (by anyone, including
the caller's own other connections) as a JSON text frame — the `{type, message}` envelope described
in §6.4. See §6.4 — this connection is receive-only from the client's perspective.

**Auth on this route only:** in addition to `Authorization: Bearer <token>`, also accepts
`?token=<token>` as a query parameter (§6.1) — the one concession to browsers' native `WebSocket`
API not supporting custom handshake headers. The header wins if both are present.

### `POST /conversations/{id}/typing` (CHAT-15)

Signals that the caller started or stopped typing in conversation `id`. Same conversation-scoped
authorization as every other endpoint above (re-checked on every call, not cached from when the
conversation was opened). Purely a live relay — nothing is persisted, and there is no `GET`
counterpart; a client that reconnects mid-typing simply sees nothing until the next signal arrives.

**Request body:**
```json
{ "isTyping": true }
```

**Response `204 No Content`** — nothing to return.

Broadcasts a `{"type": "USER_TYPING", "typing": {...}}` envelope (§6.4) to every *other* connection
on the conversation — deliberately excluding every connection belonging to the caller themselves
(unlike message send/edit/delete, which do echo back to the sender). `displayName` is resolved
server-side from `user_profiles_cache`, same as `senderFullName` on a message — never taken from the
request body.

**Errors:** `403 Forbidden` — caller no longer allowed in this conversation.

---

## 8. Current status

The structural scaffold (this README's §1–§7) was built and live-verified end-to-end, then given
real automated regression coverage — this is no longer scaffold-only. Current state, kept current
per `CLAUDE.md`'s README maintenance convention (check `docs/BACKLOG_MVP.md` for the authoritative,
up-to-the-day ticket state if this drifts):

- **Backend test coverage:** `CHAT-5` (`DONE`) added DB-backed integration tests for
  `internal/conversation`, `internal/message`, and `internal/sync`'s cache store — previously only
  pure-validation unit tests existed. `CHAT-6` (`DONE`) added WebSocket broadcast fan-out coverage
  (a real router, real WebSocket clients, over `httptest.NewServer`), `internal/sync.Consumer`
  crash-recovery coverage, and `internal/sync.Bootstrapper` pagination coverage against the real
  monolith. CHAT-6 also fixed a real bug it found while writing that coverage: `Consumer.Run` only
  ever read Redis Stream entries with `>`, which Redis never redelivers once an entry has been
  delivered to a consumer group — so a same-identity restart never actually retried a never-acked
  entry, contrary to what this file used to imply. `Consumer.reclaimPending` (called once at the top
  of `Run`) fixes this: a same-identity restart now genuinely reclaims and re-processes its own
  pending entries first.
- **CI exists:** `.github/workflows/chat-ci.yml` — build/vet/test on every `services/chat/**` PR,
  against `postgres:16-alpine` and `redis:7-alpine` service containers (Redis added for CHAT-6's
  consumer tests). It does not run the monolith-dependent bootstrap pagination test (see that test's
  own skip condition) — a full Java+Gradle+Postgres stack inside a Go-only CI job isn't worth the
  weight; that one test is a local/pre-release check only.
- **Client is fully wired, both surfaces real:** `CHAT-7` (`DONE`) added `client/src/features/chat/`
  — a chat-scoped API client (`chatApiClient`, targeting `/api/chat`) and `useGroupChatData`/
  `useDirectChatData` data hooks (open-or-resume conversation, history, send, a real-time WebSocket
  connection with backoff reconnect), live-verified against these real running services. `CHAT-8`/
  `CHAT-9` (both `DONE`) wired `GroupChatTab.tsx`/`FriendChatPanel.tsx` to those hooks for real —
  neither is a local-state mock anymore. `CHAT-13` (`DONE`) added editing/deleting messages
  (sender-only, no time window) on both surfaces, plus a reversed message-alignment layout (own
  left, others' right) and a group-chat-only avatar next to other members' messages. CHAT-7 also
  found and fixed two things this section used to gloss over: the JWT-algorithm bug described in
  §6.1, and `vite.config.ts`'s `/api/chat` proxy entry needed `ws: true` added (the string-shorthand
  form doesn't proxy WebSocket upgrades) — a further proxy bug (missing path-prefix `rewrite`) was
  found and fixed at CHAT-8. `CHAT-15` (`DONE`) added typing indicators on both surfaces — ephemeral,
  in-memory only (no schema change, no Redis), client-driven 5s idle timeout plus a client-side
  safety-net expiry for a dropped stop signal/disconnect, "name(s), then a count" group display.
- **No production reverse-proxy config exists yet** for this or any other service in the repo —
  tracked as `INFRA-7` (`infra/documentation/BACKLOG_MVP.md`).
- **`/internal/sync/**` network isolation** (must be unreachable from outside the server's network)
  is not yet enforced anywhere — tracked as `INFRA-9`, same file.
