# CLIENT-SESSION-13 · Render system comments in the session discussion thread

**Status:** `DONE` (2026-08-19) — code complete and verified, baselines regenerated and committed.
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

---

## Implementation (2026-08-19)

### The approved design

Restated rather than linked: add `commentType` to the shared client `Comment` type; branch inside
shared `CommentItem` with an early return for `SESSION_SYSTEM`, rendering a centered, avatar-less,
muted row with no like/reply/delete; seed the MSW session thread with a system entry so the existing
`discussion` visual state covers it; cover it with unit tests and Storybook stories. No data-layer
change (the field already arrives on the existing fetch), no state change, no new design tokens.

### One estimate corrected before building

The ticket said adding a required `commentType` would ripple into **~27 files**. That was a
grep-based estimate made at filing, and it was wrong. Measured properly — by adding the field and
letting `tsc -b` report — the real blast radius is **17 errors across 16 files, every one a test,
story, or MSW fixture. Zero app source files.** Production code only ever spreads or passes a
`Comment` through; it never constructs one from scratch. That made "required" clearly the right
call rather than a costly one, so the recommendation stood, but on evidence instead of a guess.

### What was built

1. **`CommentType = 'USER' | 'SESSION_SYSTEM'`**, required on `Comment` (`features/feed/types.ts`),
   with a TSDoc note on why a `SESSION_SYSTEM` row must not render as its nominal author speaking.
2. **Early return in `CommentItem`** for `SESSION_SYSTEM`, placed above every user-comment
   affordance. Chosen over conditionally hiding each control because a system entry has *none* of
   them — an early return can't partially forget one. `content` is rendered verbatim (server-
   templated, name baked in at write time).
3. **16 fixture/test/story files** given `commentType: 'USER'`. Applied with a script keyed on the
   `postId:` → `userId:` adjacency rather than by hand; one file (`e2e/mocks/handlers/feed.ts`) used
   shorthand `postId,` and was patched separately.
4. **MSW session thread** gained a `SESSION_SYSTEM` entry authored by `mockUser` (who owns
   `mockSession`) — deliberately the *creator*, since that is the real shape and the case most
   likely to render wrongly.
5. **`app-session-detail-modal.spec.ts`** now asserts the system row is visible before screenshotting
   the `discussion` state, so a fixture regression can't silently yield a baseline missing the row.
6. **Tests + stories:** 5 new `CommentItem` tests, 2 new `SessionCommentSection` tests, 4 new stories.

### Key decisions

- **A dedicated test for the nominal-author case.** SESSION-21 authors system entries as
  `session.getCreatedBy()`, so the session creator viewing their own session would otherwise pass
  `CommentItem`'s `isOwnComment` check and be offered a Delete that `deleteComment` rejects. The
  early return makes this impossible, but the test pins it down: it is the single most likely way a
  future refactor reintroduces the bug.
- **The empty-state edge case needed no code.** `SessionCommentSection` gates on
  `comments.length === 0`, and system entries *are* comments, so a system-only thread already
  avoids the empty copy. Covered by a test anyway, because it's an implicit consequence — an
  implementation that filtered system entries before the length check would regress it silently.
- **Content and timestamp share one line as `content - timestamp`, both italic** (user refinement after seeing it running —
  the first cut stacked the timestamp underneath). `flex-wrap` keeps it safe: a long participant
  name pushes the timestamp onto a second centered line rather than overflowing the dialog. Checked
  at 375px, where the current fixture still fits on one line, so the wrap is insurance rather than
  active behavior.
- **No em-dash wrapping** on the centered line. The server templates are already complete sentences
  ("Priya Shah joined the session", "The session has started"), so `— … —` would add noise.

### Verification

- `tsc -b` clean; `pnpm lint` 0 errors (2 pre-existing warnings in an untouched file).
- `pnpm test` — **891/891 passed**, 129 files (was 884; +7 new).
- `playwright --project=e2e` — **51/51 passed**.
- **A false alarm worth recording:** an earlier e2e run showed 9 failures, all in `a11y.spec.ts`,
  all `page.goto` timeouts. They were CPU contention from a concurrent full `vitest` run, not a
  regression — `retries: 0` locally (2 on CI) means one slow run fails outright. Re-running with
  nothing competing gave 51/51 in 1.4m vs 2.5m. Verified rather than assumed, since "it's probably
  flaky" is exactly how a real regression gets waved through.
- **Visual output confirmed without touching baselines:** ran the `discussion` visual case, let it
  fail on the expected baseline mismatch, and inspected Playwright's `-actual.png`. The system row
  renders centered, muted, avatar-less, with no like/reply controls, clearly distinct from the user
  comment above it. `test-results/` is gitignored and was removed afterward.

### Remaining step — baseline regeneration

`session-detail-discussion-{375,768,1280}.png` need regenerating (the thread gained a row). As with
CLIENT-NOTIF-3, this **cannot be done on a Windows host** — the whole visual suite fails there on the
documented font-rendering mismatch. Needs the `client-ci` `update-baselines` dispatch: expect
**exactly those 3 files** to change, everything else byte-identical, worth the same SHA-256 check.

**Executed (2026-08-20).** `update-baselines` dispatch run, artifact downloaded, SHA-256 compared
before overwriting: **exactly the 3 predicted files changed, the other 72 byte-identical** — as
predicted.

Two things that check confirms beyond "the files changed":

- **The dispatch ran on this branch, not `master`.** `master` has neither the `SESSION_SYSTEM`
  branch nor the MSW fixture row, so the discussion crops would have regenerated unchanged and
  *zero* files would have differed.
- **It ran on the branch's current head, not an earlier commit.** The styling changed twice after
  the feature commit (one-line italic in `edaa967`, then the dash separator in `b3106b6`). The
  regenerated crop reads *"Priya Shah joined the session - just now"* — italic, single line, dash
  present — so it reflects `b3106b6`, not `ddcea52`'s stacked non-italic version. A baseline
  generated from the wrong commit would have looked plausible and passed review; the visual check
  is what distinguishes them.

## Delta for later tickets

- **`Comment.commentType` is now required.** Any new code constructing a `Comment` literal — a test,
  a story, an MSW handler — must set it. `'USER'` is right for everything except a deliberate
  session system entry.
- **The ~27-file estimate in this ticket's own "What ships" section above is superseded** by the
  measured 16. Left in place rather than edited so the correction is visible.
