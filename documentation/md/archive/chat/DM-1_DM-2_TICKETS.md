# Direct-message tickets — DM-1, DM-2 (ARCHIVED)

**ARCHIVED 2026-07-26 (user decision):** extracted from `client/docs/BACKLOG_MVP.md` in full,
superseded by a fresh chat re-plan (which now covers 1:1 direct messages alongside group chat,
rather than treating them as separate lineages). Neither ticket had any code written or detailed
scoping — both were filed as stubs alongside FRIEND-1. Kept for historical context only; do not pick
these up.

Origin backlog: `client/docs/BACKLOG_MVP.md` (Phase 9). Same lineage as the now-also-archived
CHAT-1..4 (`documentation/md/archive/chat/`). `FRIEND-1`'s `FriendChatPanel` remains a shipped
local-state mock — unaffected by this archival, still real code, not part of the plan being redone.

---

## Implementation Order (as it appeared in the live backlog)

| # | Ticket | Title | Status |
|---|---|---|---|
| 49 | DM-1 | Direct-message backend — conversations/messages module scaffold + endpoints (backend, `modules/user` or new module TBD at pickup) | `TODO` |
| 50 | DM-2 | Wire FRIEND-1's local-state mock chat panel to DM-1 — blocked on DM-1, FRIEND-1 | `TODO` |

## Dependency note (as it appeared in the live backlog)

```
DM-1 (backend, new)/DM-2 (client, new) filed alongside FRIEND-1, same lineage as CHAT-1/CHAT-2 but
  for 1:1 chat instead of group chat: FRIEND-1 ships its chat panel as a local-state-only mock (no
  backend at all, not even a filed ticket, unlike group chat's CHAT-1) — DM-1 scopes and builds the
  real conversations/messages backend, DM-2 wires FRIEND-1's chat panel to it. Neither blocks
  FRIEND-1 or anything else in this backlog.
```

---

### DM-1 · Direct-message backend — conversations/messages module scaffold + endpoints
**Status:** `TODO` · **Type:** Feature (backend) · **Dependency:** FRIEND-1 (client half needs this,
not the reverse)
**Origin:** filed alongside FRIEND-1 — FRIEND-1's chat panel ships as a local-state mock on purpose
(no backend exists for 1:1 messaging at all, unlike group chat which at least has CHAT-1 filed).
Same "smallest shippable slice" sequencing this backlog already uses for CHAT-1/CHAT-2.

**Not yet scoped in detail** — needs its own design pass (schema, real-time transport — reuse
PubNub per-pair channels like the chat architecture doc, or a simpler polled/REST approach; module
placement, e.g. extending `modules/social/chat-impl` once CHAT-1 creates it, vs. a new module)
before pickup. See `documentation/md/CHAT_SERVICE_INTEGRATION.md` for the group-chat precedent this
would likely follow.

---

### DM-2 · Wire FRIEND-1's chat panel to the real backend
**Status:** `TODO` · **Type:** Feature (client) · **Dependency:** DM-1, FRIEND-1
**Origin:** filed alongside DM-1 and FRIEND-1 — same CHAT-2-after-CHAT-1 pattern applied to 1:1 chat.

**Not yet scoped in detail** — full acceptance criteria to be written once DM-1 exists to build
against.
