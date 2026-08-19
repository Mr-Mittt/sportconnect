# CLIENT-SESSION-13 · Render system comments in the session discussion thread

**Status:** `TODO`
**Type:** New Feature
**Depends on:** none blocking — backend `SESSION-21` (`DONE`, 2026-08-19) already ships the contract
**Filed:** 2026-08-19, immediately after SESSION-21 merged. The backend writes system entries into
the session thread today and the client renders them as ordinary user comments, so a "Priya Shah
joined" record is indistinguishable from Priya Shah having typed those words. Third instance of the
same pattern this week — a backend ticket shipping user-visible data with client work scoped out
(see [CLIENT-NOTIF-3](CLIENT-NOTIF-3_NOTIFICATION_TEXT_FOR_MISSING_SESSION_TYPES.md), and
[CLIENT-NOTIF-4](CLIENT-NOTIF-4_NOTIFICATION_TYPE_COVERAGE_GUARD.md) which exists to stop it
recurring).

SESSION-21 writes server-generated entries into a session's existing discussion thread at three
moments — a participant joined, a participant left, the session started — surfacing through the
same comment-read endpoint the client already calls. They are distinguished by
`CommentResponse.commentType` (`USER` | `SESSION_SYSTEM`), and are **authored by the session
creator** (`session.getCreatedBy()`), which is exactly why rendering them as-is misleads: the row
shows a real person's name and avatar next to text that person never wrote.

Any Normal User who can see the thread sees these (SESSION-10 gates it to JOINED/REQUESTED/INVITED
participants, or a group member for a group-linked session). No user entry point and no new API —
this ticket is purely how an already-arriving field renders in `SessionDetailModal`'s Discussion
section.

## What ships

1. **`commentType` on the client `Comment` type** (`src/features/feed/types.ts`) — the field the
   backend already sends and the client currently drops. **Note the ripple:** `Comment` is shared
   with the post feed and ~27 files construct one, so a required field means touching all of them.
   Recommended required anyway (the backend column is `NOT NULL DEFAULT 'USER'`, and
   `client/CLAUDE.md` mandates types 1:1 with real DTOs) — decide at pickup if that proves painful.
2. **A system-entry branch inside shared `CommentItem`** (`src/shared/components/CommentItem.tsx`),
   early-returning a distinct row when `commentType === 'SESSION_SYSTEM'`. Chosen over a
   session-local component (user decision at filing) so one implementation covers every surface
   `CommentItem` is used on. The trade-off is accepted knowingly: a shared component gains awareness
   of a session concept.
3. **Visual treatment: a centered meta line, no avatar** (user decision at filing) — e.g. a muted,
   centered `— Priya Shah joined —` with its timestamp, visually a thread event rather than a
   comment. It must not read as the session creator speaking.
4. **No like, no reply, no delete on a system entry.** SESSION-21 settled this server-side
   (`deleteComment` rejects one before the ownership check; likes and replies are blocked). All
   three affordances currently live in `CommentItem`, so all three must be suppressed — offering a
   button the server will reject is its own bug.
5. **MSW fixture + visual baseline.** The session-comments fixture gains a `SESSION_SYSTEM` entry,
   and `app-session-detail-modal.spec.ts`'s existing `discussion` state re-baselines to include it.

## Edge cases

- **A thread containing only system entries must not render the empty state.**
  `SessionCommentSection` shows "No comments yet. Be the first to comment!" on `comments.length
  === 0`; a session that has started but has no human comments is a real and probably common case,
  and it must show the system entries, not the empty copy. Decide at pickup whether the composer's
  prompt copy still makes sense there.
- **System entries are always top-level.** They anchor to the `SESSION_POST`, never to a parent
  comment, so `CommentItem`'s recursive reply rendering should never receive one — but the branch
  should not assume it, since nothing in the type prevents it.
- **Pagination is unaffected** — system entries are ordinary rows in the existing `createdAt DESC`
  page, counting toward the page size and the "View more comments" threshold. No change needed;
  noted so it isn't re-derived.
- **`entityTitle`/author-name fallbacks don't apply** — content is server-templated with the name
  baked in at write time, so the client renders `content` verbatim and must not re-resolve names.
- **Account lifecycle (CLAUDE.md):** not applicable, stated explicitly rather than skipped. This
  ticket adds no endpoint, no background job, and no user-triggered cross-domain call — it renders a
  field on a response the client already fetches, and that fetch's own authorization is unchanged.
- **Notification use case (CLAUDE.md):** nothing to log. SESSION-21 already settled that system
  comments are deliberately *additive* to the existing notifications rather than a replacement, so
  no new "should this notify someone?" question arises here.

## Explicitly out of scope

- **`GROUP_SYSTEM` posts (B9).** The client appears to have no branch for them either — it handles
  `USER_FEED`/`GROUP_POST`/`GROUP_BROADCAST` — so B9's group welcome posts likely render as ordinary
  user posts. Same class of gap, different surface (feed post card, not comment row). **Not verified
  in depth**; recorded here so it's on record, to be filed as its own ticket.
- No backend change. No new comment types. No change to how user comments render.
- No aggregation or grouping of consecutive system entries (SESSION-21 deliberately does no dedupe —
  one entry per genuine transition — so a busy session can show several in a row; if that reads
  badly, it's a follow-up, not this ticket).

## Tests

- `CommentItem` unit tests: a `SESSION_SYSTEM` comment renders the system row, exposes no
  like/reply/delete controls, and a `USER` comment is unaffected.
- `SessionCommentSection`: a thread of only system entries renders them and not the empty state.
- Storybook: a `SystemComment` story on `CommentItem`, and a `SessionCommentSection` story with a
  mixed user/system thread.
- Visual regression: the existing `discussion` state re-baselined. **The baselines cannot be
  produced on a Windows host** — the whole suite fails there on the documented font-rendering
  mismatch — so this needs the `client-ci` `update-baselines` dispatch, same as CLIENT-NOTIF-3.
