# CHAT-18 · An unknown conversation id answers 500 instead of 403/404

**Status:** `DONE` (2026-10-16, fixed inside CHAT-17, see its implementation summary) · **Type:** Bug Fix · **Depends on:** none

**Filed:** 2026-10-16, found while verifying CHAT-17 against the real dev stack: `GET /conversations/999999/messages` with a valid Keycloak token (auth passes) answers `500 {"error":"internal_error"}`. The unknown id reaches an error that `internal/api/respond.go`'s `writeError` does not map, so it falls through to the generic 500. A caller who is not a member of an existing conversation gets 403 (`ErrNotAMember`); a conversation that does not exist should answer the same 403 (no existence leak) or a 404, never a 500.

## What

Find which error the history path (`message.Service.History` / the conversation access check) returns for a conversation id with no row (most likely `pgx.ErrNoRows` surfacing unwrapped), map it to the agreed status, and cover the same case on `POST /conversations/{id}/messages`, `PATCH`/`DELETE` message and `POST .../typing`. Add a test (real Postgres, same shape as the existing integration tests) asserting the status per route. Decide at pickup whether it is 403 or 404; prefer 403 so a non-member cannot probe which ids exist.

## Out of scope

Anything about auth (CHAT-17); the client's handling of the error (it already treats 4xx and 5xx generically).
