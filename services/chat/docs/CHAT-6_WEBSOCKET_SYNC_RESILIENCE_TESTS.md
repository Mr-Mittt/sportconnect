# CHAT-6 · WebSocket broadcast + sync resilience tests

**Status:** `DONE` · **Branch:** `feature/chat-6-websocket-sync-resilience-tests`

## Design (approved plan, restated)

`internal/ws.Hub` and the WebSocket-accept path had only ever been confirmed to require auth and
exist (a manual curl-based check) — never that a second connected client actually receives a
message pushed by a first one, the entire point of the component. `internal/sync.Consumer`'s
crash-recovery behavior and `Bootstrapper`'s multi-page pagination had never been exercised at all.
The approved plan had three test additions plus two production-code changes discovered necessary
along the way:

1. **WebSocket broadcast test**: a real router over `httptest.NewServer`, two real `coder/websocket`
   client connections to the same conversation, a REST send, assert both receive the push and a
   connection to a *different* conversation doesn't.
2. **Sync consumer resilience tests**: a malformed event is skipped without crashing or acking, a
   well-formed event after it still processes; a "restart" (fresh `Consumer`, same identity) reclaims
   a never-acked entry.
3. **Bootstrap pagination test**: against the **real monolith** (user decision, see "H2/seeding
   question" below) rather than an `httptest.Server` stub, using a test-overridable page size instead
   of needing 500+ seeded rows.
4. **Two production-code changes**, both flagged and approved before implementation, not folded in
   silently:
   - `internal/sync.Consumer` gained a real fix: it never actually retried a never-acked entry on a
     same-identity restart, contrary to what `CLAUDE.md`'s "Known gaps" note implied. Empirically
     confirmed via `redis-cli` before touching any code: `XREADGROUP` with `>` never redelivers an
     entry to any consumer once delivered, only `0` returns a consumer's own pending history.
     `Consumer.reclaimPending` (called once at the top of `Run`) fixes this.
   - `Consumer`'s `StreamName`/`ConsumerGroup` and `Bootstrapper`'s page size, previously hardcoded
     package constants / literals, became per-instance fields (defaulting to the real production
     values everywhere — no `cmd/chat/main.go` changes needed) so tests can use throwaway
     stream/group names and small page sizes instead of touching real shared infrastructure.

## What was built

### `internal/sync/consumer.go`
- `Consumer` gained `stream`/`group` fields (unexported), defaulting to `StreamName`/`ConsumerGroup`
  in `NewConsumer` — `EnsureGroup`, `Run`, `reclaimPending`, and `processMessage` all read `c.stream`/
  `c.group` instead of the package constants directly.
- New `reclaimPending(ctx) error`: one `XREADGROUP ... 0` call (not `>`), processing whatever's
  returned via the existing `processMessage` (same decode/handle/ack path — a still-malformed entry
  stays pending exactly as before). Called once in `Run`, right after `EnsureGroup`, before the main
  `>` loop. Deliberately a single pass, not loop-to-empty — avoids an infinite-retry spin if an entry
  can never succeed; in the practically-unlikely case of >50 pending entries, the remainder waits for
  the next restart rather than being lost (they stay in the pending list either way).

### `internal/sync/bootstrap.go`
- `Bootstrapper` gained an unexported `pageSize` field, defaulting to `defaultPageSize = 500`
  (matching the monolith's own `MAX_LIMIT`) in `NewBootstrapper`. `fetchPage` now sends
  `strconv.Itoa(b.pageSize)` instead of the hardcoded literal `"500"`.

### `internal/testdb`
- New `RequireRedisClient(t) *redis.Client` — same shape as `RequirePool`: connects via `REDIS_ADDR`
  (loaded from `.env` as a dev convenience), fails the test loudly if unreachable.

### New test files
| File | Covers |
|---|---|
| `internal/api/websocket_integration_test.go` | Real router + real WS clients over `httptest.NewServer`; mints a real signed JWT; two connections on the same conversation both receive a broadcast, a connection on a different conversation receives nothing |
| `internal/sync/consumer_integration_test.go` | Malformed payload → not acked, loop continues, next well-formed event still processes (confirmed via `XPENDING`); a raw-delivered-but-unacked entry is reclaimed and processed by a fresh same-identity `Consumer`'s `reclaimPending` |
| `internal/sync/bootstrap_integration_test.go` | Seeds a handful of synthetic rows directly into the **real monolith's** `sportconnect_dev.users` table, hits the real `/internal/sync/users` with `pageSize=50`, confirms every seeded row was pulled across however many real pages that took (132 pre-existing active users at time of writing already forced multi-page traversal) |

Every new test uses a throwaway stream/consumer-group name (`internal/sync`), a dedicated Postgres
transaction rolled back at the end (`conversation`/`message`/api tests, per CHAT-5's pattern), or
explicit fixture cleanup keyed by a unique per-run tag (the monolith-seeding test, since Redis/a
separate database have no transaction-rollback equivalent available here).

### `.github/workflows/chat-ci.yml`
Two gaps found and fixed while verifying this locally end-to-end (see "Verification" below), not
just written and assumed correct:
- Added a `redis:7-alpine` service container (`REDIS_ADDR: localhost:6379`) — CHAT-6's consumer
  tests need real Redis and the workflow had none.
- Added `JWT_SECRET` to the job's `env:` block (an arbitrary CI-only literal — the WebSocket test
  never talks to a real monolith, so this only ever has to be internally consistent with itself, not
  match any real secret).

## The "real monolith vs. stub" and page-size decisions (recorded per user's asks)

Initially asked whether the bootstrap test should hit a real monolith or an `httptest.Server` stub.
Investigated the real cost first: the monolith's `MAX_LIMIT` is a hardcoded 500, and the *client*
(`Bootstrapper`) also hardcoded `limit=500` on every request — forcing a genuine second page against
the real endpoint would have needed 501+ seeded rows. Surfaced this plainly; the user's first answer
was to still use the real monolith, then — after being shown the actual row-count/monolith-dependency
cost — asked directly "what's the page size? should we reduce it and insert 10 rows?" That's exactly
what shipped: `pageSize` became a small, test-overridable field (no Java-side change needed — the
real endpoints already honor a client-supplied smaller `limit`), letting the test use the real
monolith with a handful of seeded rows instead of 501+.

## Verification

`go build ./...`, `go vet ./...`, `go test ./...` all green locally against the real dev Postgres/
Redis/monolith. Beyond that — learning from CHAT-5's "tests pass ≠ CI will pass" gap — `chat-ci.yml`
was re-simulated end-to-end exactly the same way as CHAT-5: fresh `postgres:16-alpine` *and*
`redis:7-alpine` containers (not the long-running dev stack), migrations applied from empty, `.env`
temporarily hidden, only the workflow's own `env:` block values exported, then the full suite run.
This is what actually caught both `chat-ci.yml` gaps above (missing Redis service container, missing
`JWT_SECRET`) — they would otherwise have only surfaced on a real failing PR. Also confirmed via
direct `psql`/`redis-cli` checks that no test left any residue: `conversations`/`chat_messages` at 0
rows, zero `%.invalid` emails in the monolith's `sportconnect_dev.users`, zero leftover `test:*` Redis
keys.

The bootstrap test's skip path was verified deliberately, not assumed: ran it with `.env` hidden and
`INTERNAL_SERVICE_SECRET`/`JWT_SECRET`/`MONOLITH_BASE_URL` unset, confirmed `--- SKIP` (not `FAIL`)
with overall `go test` still exiting 0 — the exact condition `chat-ci.yml` will hit on every run.

## Documentation

Per the user's request this session, added a **README maintenance convention** to
`services/chat/CLAUDE.md` (no prior rule existed requiring this, unlike the client side's
`E2E_OVERVIEW.md` rule) and did a full accuracy pass on `README.md`: §5 now documents exactly what
infrastructure `go test ./...` needs and why (it stopped being a pure-unit-test suite at CHAT-5), §6.3
documents the reclaim-on-restart fix, and §8 ("Current status") was rewritten from a stale
initial-scaffold snapshot to reflect the real current backlog state.

## Not in scope

- CHAT-7 onward (client wiring) — untouched, still local-state mocks.
- No `XAUTOCLAIM` sweep for reclaiming a *different* stuck consumer's entries — still an open gap,
  documented in `CLAUDE.md`, not needed at single-instance scale.
- No behavior change to anything already covered by CHAT-5.
