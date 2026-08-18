# Chat Service — Feature Backlog

**Version:** MVP v1
**Module:** `services/chat` (Go + Postgres — see `services/chat/CLAUDE.md`)
**Last updated:** 2026-07-28

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session, `DONE` when implemented + verified
- Use `/workon chat mvp` to resume

**Ticket numbering starts at CHAT-5, not CHAT-1** — `CHAT-1..4` already exist as ticket IDs in the
archived PubNub-based plan (`documentation/md/archive/chat/`). Those were never built and are
superseded in full; this backlog continues the same `CHAT-N` module prefix without reusing their
numbers, so a search for e.g. `CHAT-3` doesn't return two unrelated tickets.

**Origin:** the structural scaffold (module layout, schema, cross-service JWT verification, the
Redis Streams sync mechanism, HTTP/WS API surface) was built and live-verified end-to-end before
this backlog existed — see `PROGRESS.md`'s 2026-07-26/27 chat entries and
`services/chat/docs/SYNC_DESIGN.md`. That work is **done**, not a ticket here. What's actually
missing to call the chat *feature* complete — not just the service — is backend test coverage
(the scaffold was proven live but has almost no automated regression coverage) and the entire
client side (`GroupChatTab.tsx`/`FriendChatPanel.tsx` are still local-state mocks, untouched).

**Scope decided for this MVP** (2026-07-27, user decision, amended same day): both group chat and
1:1 direct messages ship, backed by the one already-built schema (`conversations`/`chat_messages`
cover both in one lineage, see `SYNC_DESIGN.md`). Editing/deleting messages, read receipts, typing
indicators, and file attachments were initially filed as deferred `BACKLOG_V1.md` tickets, then
pulled into this MVP the same day (CHAT-13..16 below). None of the four were scoped in detail
before this move (each still carries open questions to resolve at pickup, same as when filed) —
moving them to MVP is a priority/sequencing decision, not a design pass; do that work at pickup, not
by assuming the original filing's open questions have already been answered.

**Delta (2026-07-28, user decision):** CHAT-14 (read receipts) was moved back out to
`BACKLOG_V1.md` at pickup, before any of its open questions were resolved — MVP now ships CHAT-13,
CHAT-15, CHAT-16 only from the original four. `BACKLOG_V1.md` is no longer empty as a result.

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [CHAT-16](MVP/CHAT-16_FILE_IMAGE_ATTACHMENTS.md) | File/image attachments | `TODO` |
| 2 | [CHAT-11](MVP/CHAT-11_HARDENING_LOADING_ERROR_SENDING_STATES_A11Y_VISUAL_REGRESSIO.md) | Hardening — loading/error/sending states, a11y, visual regression | `TODO` |
| 3 | [CHAT-12](MVP/CHAT-12_QA_ACCEPTANCE_CHECKLIST.md) | QA / acceptance checklist (chat) | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [CHAT-13](MVP/CHAT-13_EDIT_DELETE_MESSAGES.md) | Editing and deleting messages | `DONE` |
| 2 | [CHAT-15](MVP/CHAT-15_TYPING_INDICATORS.md) | Typing indicators | `DONE` |
| 3 | [CHAT-10](MVP/CHAT-10_E2E_MSW_HANDLERS.md) | E2E + MSW handlers for chat | `DONE` |
| 4 | [CHAT-5](MVP/CHAT-5_REPOSITORY_CACHE_INTEGRATION_TESTS.md) | Repository/cache integration tests (DB-backed) | `DONE` |
| 5 | [CHAT-6](MVP/CHAT-6_WEBSOCKET_SYNC_RESILIENCE_TESTS.md) | WebSocket broadcast + sync resilience tests | `DONE` |
| 6 | [CHAT-7](MVP/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md) | Chat API client + data hooks scaffold (client) | `DONE` |
| 7 | [CHAT-8](MVP/CHAT-8_WIRE_GROUP_CHAT_TAB.md) | Wire `GroupChatTab` to the real chat service | `DONE` |
| 8 | [CHAT-9](MVP/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md) | Wire `FriendChatPanel` to the real chat service (1:1 DMs) | `DONE` |

---

**Dependencies:**
```
CHAT-5, CHAT-6 — independent of everything else. The backend they test already works (live-verified
  2026-07-27); these are regression-coverage tickets, not blockers to client work starting.
CHAT-7 → CHAT-8, CHAT-9 (both client wiring tickets share the same API client/hook foundation)
CHAT-8 ∥ CHAT-9 — no code dependency between them (group chat and direct messages are independent
  UI surfaces once CHAT-7 exists), but sequenced group-first above: GroupChatTab has the
  longer-standing design reference (design-reference-group-feed.html, since GRP-1) and was the
  original CHAT-1..4 plan's sequencing precedent — pick up CHAT-9 first only if there's a specific
  reason to prioritize direct messages instead.
CHAT-8, CHAT-9 → CHAT-15, CHAT-16 — each of these two builds on top of basic send/receive existing
  on both surfaces; each needs its own Phase 1/2/3 scoping pass at pickup (per root CLAUDE.md's
  ticket-writing convention) since neither was designed in detail before being moved here, only
  filed with open questions. No dependency between the two — pick up in any order. (CHAT-14 was
  moved back to `BACKLOG_V1.md` on 2026-07-28, at pickup, before being scoped — see that file.)
CHAT-8, CHAT-9, CHAT-13, CHAT-15, CHAT-16 → CHAT-10 → CHAT-11 → CHAT-12 (E2E/hardening/QA
  now needs to cover the full feature set shipped in MVP, not just basic messaging — sequenced last
  for that reason, same "wire → test → harden → QA" shape every other client feature in this repo's
  backlogs already follows)
```

**Delta (reorder, 2026-07-28, user decision):** CHAT-16 was picked up first per the table order above,
but its Phase 1 research (see its ticket entry below) found the "reuse the existing media-upload
path" premise false — there is no working upload pipeline anywhere in this app to wire into, only a
URL-string field on posts with no upload service behind it. That makes CHAT-16 a materially bigger,
still-undecided piece of work, so the user chose to swap it with CHAT-10 in the implementation order
and finish CHAT-10 first instead — CHAT-10's own dependency list (CHAT-8, CHAT-9, CHAT-13, CHAT-15,
CHAT-16) is unaffected by this reorder except that CHAT-16 hasn't shipped yet at CHAT-10's pickup;
CHAT-10 picked up now covers CHAT-8/9/13/15's already-shipped surfaces only, and will need a small
follow-up to extend coverage once CHAT-16 eventually ships (same as how CHAT-14 being out of MVP
scope already narrows this ticket).

---

## Not tracked (excluded from Implementation Order)

### CHAT-14 · Read receipts

**Moved to `services/chat/docs/BACKLOG_V1.md` on 2026-07-28** (user decision, at pickup, before any
of its open questions were resolved) — see that file for the ticket in full.

---

