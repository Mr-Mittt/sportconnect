# Session Comments Vision

**Last updated:** 2026-08-07

> **Superseded 2026-08-12 — SESSION-10 shipped, but not this way.** The "reuse Post's actual
> `Comment` entity/table" alternative this doc rejects below (see "Comment shape") was reconsidered
> a second time and **accepted**, after `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` §7 also
> re-rejected an even stronger form of it and was itself superseded. Every `Session` now gets a
> companion `Post` (`PostType.SESSION_POST`) that exists purely as a comment-thread anchor —
> comments are `post-impl`'s real `Comment` entity, reused via internal bypass methods on
> `CommentService`, not a new `SessionComment` table. The underlying `Post` is invisible via
> `/api/posts/**` for everyone; the client reaches comments only through new `session-api` endpoints
> (`GET/POST /api/sessions/{sessionId}/comments`, `.../comments/{commentId}/like`) — there is no
> `session-scoped` reuse of `post-impl`'s own REST surface. The **access-gating decisions below are
> unchanged** (participants-only, `JOINED`/`REQUESTED`/`INVITED`, widened for group-linked sessions
> per the ADR §6 delta) — only the storage/entity decision and the API surface reversed. Full design
> record: `modules/session/docs/MVP/SESSION-10_SESSION_POST_COMMENTS.md`.

## Vision statement

Give session participants a lightweight, persistent place to discuss a specific session — right
below the session details in `SessionDetailModal` — without requiring a group chat, an external
channel, or coordinating logistics via a WhatsApp thread outside the app.

## Discussion summary

Opened by grounding in what already exists: `modules/session` (all `DONE` through SESSION-9) has
join/leave, capacity, fees, invite-friends, and join-approval, but no discussion layer at all.
`modules/social/post-impl` already has a full comment system on `Post` — one level of nesting,
per-comment likes, a Redis preview cache, `last_interaction_at` bumped on new comments — which
became the working precedent for shape. The separate Go chat service (real-time group/friend chat)
was considered and set aside as a different mechanism (ephemeral-feeling live messaging vs. a
persistent, session-scoped thread).

The user's framing: a comment section directly in the Session Detail modal, below the session
details, so that all participants can discuss/talk about the session — not a post-game review, not
a replacement for the group chat, closer to "logistics/coordination thread scoped to this specific
session." From there the discussion resolved five forks: who can read/write (participant status
gating), whether non-participants can read, whether to reuse Post's comment shape or start simpler,
whether updates need to be live, and whether this applies to group-linked sessions too (which
already have a group chat) or standalone sessions only.

## Decisions

- **Access gating:** readable/postable only for participants with a `SessionParticipant` row in
  `JOINED`, `REQUESTED`, or `INVITED` status. `LEFT` loses access once someone leaves — they were
  chosen to keep visibility to "anyone still actively attached to the session," including someone
  waiting on approval or an invite who wants to ask a question before they're formally in.
- **Read visibility:** participants-only. The comment section is absent entirely for someone
  browsing a public standalone session from Discover before joining — it isn't a public preview
  like a post's comments.
- **Comment shape:** full reuse of Post's comment shape — one-level nesting (replies), per-comment
  likes, the same Redis preview-cache pattern — but as a **new, domain-scoped `SessionComment`
  entity** living in `modules/session`, not a reuse of `post-impl`'s actual `Comment`
  table/entity (this repo's domain-scoped-tables rule forbids a cross-domain JPA relationship or
  shared table here — the shape is copied, the entity is not).
- **Live updates:** refetch-on-open / manual refresh via TanStack Query, same pattern Post comments
  already use. No live push, no involvement from the chat service.
- **Session scope:** applies to both standalone and group-linked sessions, unconditionally — not
  gated on `groupId`. A group-linked session's comment thread is scoped to that specific session,
  independent of the group's own ongoing chat channel.
- **Moderation:** delete own comment only, same as Post comments today. No creator/owner moderation
  capability in v1.
- **Thread lifecycle:** no session-status gating — the thread stays open for new comments
  regardless of `SessionStatus`, including `CANCELLED` or a session whose scheduled time has
  already passed.

## Rejected alternatives

- **Live updates via the Go chat service** — would pull a second service into what's otherwise a
  straightforward CRUD feature, and that service's sync boundary
  (`services/chat/docs/SYNC_DESIGN.md`) wasn't designed around this use case.
- **Standalone sessions only** (group-linked sessions keep using their group's chat instead) —
  rejected: would need a conditional in the modal and creates a gap where a group-linked session's
  discussion is buried in a different tab instead of living with the session itself.
- **All 4 participant statuses, including `LEFT`** — rejected as odd: someone who backed out of a
  session keeps talking in a thread meant for people still going.
- **Public read for non-participants** — rejected in favor of participants-only, to keep a public
  standalone session's discussion private to the people actually attending.
- **Session-status-gated locking** (locks on `CANCELLED`, stays open after completion) — rejected
  in favor of always-open, for simplicity; matches how Post comments never lock either.

## Open questions

- **Notifications:** should a new comment notify other participants (push/in-app badge), or is the
  thread fully opt-in for v1 (you only see new comments when you open the modal)? Not resolved.
- **Success signal:** how do we know this feature is working — % of sessions that get ≥1 comment,
  comments-per-session average, or a qualitative signal (fewer logistics questions showing up in
  group chat instead)? Not resolved.

## Proposed tickets

### modules/session
- **SESSION-10** — New `SessionComment` domain entity + endpoints (create/list/delete, one-level
  nesting, likes), gated to `JOINED`/`REQUESTED`/`INVITED` participants. Filed in
  `modules/session/docs/BACKLOG_MVP.md`.

### Client
- **CLIENT-SESSION-8** — Comment section in `SessionDetailModal`, participants-only,
  refetch-based (no live updates), reusing Post's comment UI idiom. Depends on SESSION-10. Filed in
  `client/docs/BACKLOG_MVP.md`.
