# SESSION-48 · Remove description from the session API

**Status:** `TODO`
**Type:** Cleanup · **Depends on:** CLIENT-SESSION-34 (client backlog: it removes the description from the create form and from the detail modal) ·
**Filed:** 2026-11-11, owner decision during CLIENT-SESSION-34: "remove it too, we will remove in backend later". (The same-day first version of this ticket also covered session `attributes`; the owner reversed that, so attributes stay.)

CLIENT-SESSION-34 stops writing and showing a session's `description`. Once the client neither sends nor reads it, the server side can go. Scope to settle at pickup: the `description` column (drop vs keep for old rows), the `CreateSessionRequest`/`UpdateSessionRequest`/`SessionResponse` fields, the group-recurrence generator if it copies it, and the discover text search if it reads it. Run the consumer census first: `client/src`, `client/e2e/mocks`, and the chat/notification payloads.

**Out of scope:** the client change (CLIENT-SESSION-34), session `attributes` (kept).

**Tests:** migration validated on a real Postgres scratch database; IT coverage that a request still carrying the field is accepted or rejected as decided.
