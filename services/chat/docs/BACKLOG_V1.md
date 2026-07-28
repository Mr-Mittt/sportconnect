# Chat Service — V1 Feature Backlog

**Version:** V1
**Module:** `services/chat`
**Last updated:** 2026-07-28
**Prerequisite:** `services/chat/docs/BACKLOG_MVP.md` should be closed before picking anything up
here.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session, `DONE` when implemented + verified
- Use `/workon chat v1` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | CHAT-14 | Read receipts | `TODO` |

---

### CHAT-14 · Read receipts
**Status:** `TODO` · **Type:** Feature (unscoped) · **Dependency:** CHAT-8, CHAT-9 (both `DONE` in
`BACKLOG_MVP.md`)
**Filed:** 2026-07-27, initially as a deferred `BACKLOG_V1.md` ticket, moved into `BACKLOG_MVP.md`
the same day (user decision), then moved back here on 2026-07-28 (user decision, at pickup) before
any of its open questions below were resolved — not re-scoped by either move.

#### Questions to resolve when picked up

1. Per-message ("seen by X, Y") or per-conversation ("read up to message N")? The latter is
   dramatically simpler to store (one `last_read_message_id` per `conversation_participants` row —
   that table already exists and already has a natural place for this column) and is what most
   chat products actually show for group conversations; per-message read state is the more complex,
   Instagram-DM-style option.
2. Does this need a new real-time event (broadcast "user X has read up to message N" over the
   existing WebSocket hub), or is a periodic/on-demand fetch enough?
3. Any privacy control (some products let a user disable sending read receipts while still seeing
   others') — decide if that's in scope at all before designing storage for it.
4. Group chat specifically: showing "seen by 8 of 12 members" doesn't scale visually to large
   groups the same way it does for a 1:1 DM — needs its own design decision, not an assumption that
   1:1 and group read receipts look the same.

#### Out of scope for this filing

Any actual implementation, schema migration, or API design — needs its own Phase 1/2/3 pass at
pickup.

---

Nothing else is currently deferred for the chat service. File future out-of-scope ideas here as
they come up, following the style already established elsewhere in this repo for lightly-scoped
future work (e.g. client's `ANON-1`/`I18N-1`): title, filed-date/origin, open questions to resolve
at pickup, explicit out-of-scope note — not a full design.
