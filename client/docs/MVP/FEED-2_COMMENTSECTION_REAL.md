# FEED-2 · CommentSection (real)

**Status:** DONE (2026-07-14) · **Type:** Integration · **Dependency:** FEED-1 · **Spec:** AUTH/FEED
epic § FEED-2

## What this ticket covers

Wires a real comment thread to the backend (`POST`/`GET /api/posts/{postId}/comments`, delete,
like/unlike) from PostCard's comment icon on Home Feed. Unlike FEED-1/FEED-6/FEED-7 (data-source
swaps behind an already-built component), no `CommentSection` component existed anywhere in the
codebase before this ticket — the epic's two-bullet spec ("adding a comment updates commentCount
optimistically", "deleting a comment removes it immediately") had no accompanying
`design-reference-*.html`, so the UI itself needed designing here.

## Scope decisions (user-confirmed before implementation)

The epic spec didn't resolve these, so they were confirmed with the user up front rather than
assumed:

1. **Modal dialog**, not an inline expand under the post. Required a new shared `Dialog` primitive
   (`src/shared/ui/dialog.tsx`, hand-written on `@radix-ui/react-dialog` — same reasoning as
   `dropdown-menu.tsx`: the shadcn CLI writes to a broken path on Windows, see AUTH-1's summary) and
   a new `--color-overlay` design token (`index.css`) for the backdrop scrim.
2. **Reply-to-comment (one level of nesting) is in scope.** The backend already enforces "a reply
   can never itself be replied to" server-side (post-impl's A4) and returns each root comment's
   `replies` fully populated in `GET /posts/{postId}/comments` — so the client never needed generic
   recursion, just one explicit nesting level.
3. **"View more comments" is a plain button**, not `Feed`'s `useInfiniteScrollSentinel` +
   auto-load pattern — a comment thread is a secondary surface, not the primary scroll surface.

## What was built

### Types
No changes — `Comment`/`CreateCommentPayload` (FEED-0) already matched the backend DTOs
field-for-field. Added `MAX_COMMENT_LENGTH = 1000` to `feed/types.ts` (the backend's real
`CreateCommentRequest.content` `@Size(max = 1000)`, undocumented client-side until now) so both
the composer and the reply input enforce it consistently.

### Data layer (`src/features/feed/`)
- `queryKeys.ts`: added `comments(postId)`, nested under `feedKeys.all` (deliberate — see the bug
  note below).
- `optimisticCommentUpdates.ts` (new, mirrors `optimisticFeedUpdates.ts`): update/remove a single
  comment within a postId's cached thread, checked at root level then one level into `replies`.
- New primitive hooks in `feed/hooks/`: `useComments` (infinite query, `enabled`-gated so a thread
  only fetches while its dialog is open), `useCreateComment`, `useDeleteComment`, `useLikeComment`,
  `useUnlikeComment`. Each mirrors FEED-1's established optimistic-mutation shape
  (`onMutate`/`onError`/`onSettled`).
  - **Backend-verified asymmetry `useCreateComment`/`useDeleteComment` encode:** only a **root**
    comment's create/delete touches the parent post's `commentCount` — a reply's create/delete only
    touches its parent comment's own `replyCount`. Verified directly against
    `CommentServiceImpl.createComment()`/`deleteComment()` (the Redis counter key differs:
    `post:{id}:comments` vs `comment:{parentId}:replies`) before writing the optimistic logic, not
    assumed from the epic text.
- New composite `src/features/home-feed/useCommentsData.ts` (mirrors `useHomeFeedData.ts`'s role,
  scoped to one post's thread instead of the whole feed).

### Components (`src/features/home-feed/components/`)
- `CommentItem.tsx` (+ stories + test): a comment/reply row, recursive one level (author, relative
  time, content, like button, "Reply" — root comments only — and delete — own comments only).
- `CommentSection.tsx` (+ stories + test): the dialog — root comments with nested replies, "View
  more comments", bottom composer.
- `PostCard.tsx`: comment `<span>` → `<button aria-label="View comments">`, new `onOpenComments`
  prop threaded through `Feed.tsx` → `HomeFeedPage.tsx`.

## A design correction made mid-implementation

`CommentSection` originally called `useCommentsData` itself (i.e. owned its own data fetching), the
same shape as `HomeFeedPage`/`useHomeFeedData`. That broke an implicit but consistent codebase rule:
every other Home Feed component (`Feed`, `PostCard`, `UpcomingMatches`, etc.) is presentational and
controlled, with the *page* owning the data hook — which is exactly why none of those components
need a `QueryClientProvider` to run in Storybook. Keeping `CommentSection` hook-owning would have
made it the only home-feed component that couldn't be Storybook'd without new test infrastructure.
Refactored before finalizing: `useCommentsData(postId, isOpen)` now lives in `HomeFeedPage.tsx`
(which already owned `activeCommentsPostId`, the "which post's dialog is open" state), and
`CommentSection` takes `comments`/`isLoading`/`isError`/`onAddComment`/etc. as plain props. This is
the reason `CommentSection.tsx`'s final version has no `postId` prop at all — it doesn't need one.

## A real bug found and fixed during hook implementation

`useDeleteComment`'s first version took **two separate snapshots** for rollback: a
comments-cache-only snapshot (via `snapshotCommentsCache`) and, for root-comment deletes, a second
broad `feedKeys.all` snapshot (via `snapshotFeedCaches`, reused from FEED-1) for the post's
`commentCount`. Since `feedKeys.comments(postId)` is deliberately nested under `feedKeys.all`
(`queryKeys.ts`), the broad snapshot — taken *after* the comment had already been spliced out of the
comments cache in the same `onMutate` — silently included the *already-emptied* thread. On rollback,
`onError` restored the comments cache correctly first, then immediately clobbered it back to empty
via the broader (stale) feed-cache restore. Caught by a dedicated rollback test
(`useDeleteComment.test.tsx`), not by manual testing. Fixed by taking one snapshot
(`snapshotFeedCaches`, which already covers the comments cache too, by design) before either
mutation runs, removing the redundant/order-sensitive second snapshot entirely — see the comment in
`useDeleteComment.ts` for the full reasoning, since the fix is non-obvious enough that a future
change re-adding a second snapshot would silently reintroduce the same bug.

### MSW handlers (`e2e/mocks/handlers/feed.ts`, `e2e/mocks/fixtures.ts`)
Added a stateful `commentsState` (keyed by postId, same "small fake backend, not a fixed responder"
reasoning FEED-1 established for `postsState`) and the 5 comment endpoints. `mockComment` fixture
added, seeded onto `mockPost` (whose `commentCount` was already `1`, kept consistent). Not exercised
by a new e2e spec in this ticket — FEED-10 (still `TODO`, later in the queue) owns the feed/comments
E2E journey and will use these handlers, same precedent as FEED-1's handlers waiting for FEED-10.

## Verification

- `pnpm exec tsc -b`: clean.
- `pnpm lint`: clean.
- `pnpm test`: 198/198 (46 files) — all new hooks, `CommentItem`, `CommentSection`, plus the full
  pre-existing suite still green (including a fix to `HomeFeedPage.test.tsx`, which never seeded
  `authStore.user` before — needed now that `HomeFeedPage` reads it for the composer's avatar; also
  had to make its `afterEach` explicitly `cleanup()` before `clearSession()`, since Vitest runs
  `afterEach` hooks inside-out and the global `cleanup()` in `src/test/setup.ts` would otherwise run
  *after* this file's own session-clearing hook, leaving `HomeFeedPage` briefly mounted with a
  `null` user it non-null-asserts).
- `pnpm build`: clean.
- `playwright --project=e2e`: 29/29 (single-worker; 4 a11y specs flaked under the default parallel
  workers on this machine — timeouts in axe's own `page.evaluate`, not a real violation — confirmed
  by rerunning single-worker, unrelated to this change).
- **Live-backend verification** (registered a real user, created a real post, then drove the actual
  running app in a browser against `./gradlew :server:bootRun`, not MSW): create root comment →
  `commentCount` 0→1 confirmed via `GET /posts/{id}`; create reply → `commentCount` unchanged (1);
  `GET /posts/{id}/comments` returns the root with the reply nested in `replies`, matching the
  client's `Comment` type exactly; like/unlike; delete reply → `commentCount` still 1; delete root →
  `commentCount` 1→0. All matched the client's optimistic assumptions exactly. Also drove the full
  UI flow in a real browser (open dialog → post comment → like it → close → confirm the post card's
  count updated → reopen → delete → empty state) — screenshot confirmed the dialog matches the
  design tokens (surfaces, accent-solid Post button, overlay scrim).
- Storybook: `CommentItem` (7 states) and `CommentSection` (5 states) visually confirmed via
  screenshot — nested-reply indentation, empty/loading/error states, and the composer all render as
  designed.
- **Visual regression** (`pnpm exec playwright test --project=visual-regression`): all 9 committed
  Home Feed baselines diff (~0.01–0.02 pixel-ratio) — expected, per the HF-13/14/15 precedent:
  `PostCard`'s comment `<span>` became a `<button>` (needed for the click target/focus ring), a small
  but real layout nudge on every capture. Direct image inspection of the `actual` render confirmed
  correct content, layout, and no regression. Filed **HF-16** (follow-up, `TODO`) to regenerate
  baselines via the `client-ci` `update-baselines` dispatch, same process as HF-13/14/15 — not fixed
  in this ticket, consistent with why those three are their own tickets rather than folded in here.

## Addendum (2026-07-14, later same day): dialog redesigned against a retroactive reference

After the initial implementation shipped, the user hand-edited
`design-reference/design-reference-post-modal.html` (the retroactive reference mentioned above) into
a richer, more finished design and asked for the implementation to be brought in line with it. Two
real design changes, applied to `CommentSection.tsx`:

1. **The dialog header now shows the post being commented on** — author avatar, name, relative
   time on the left; the close button stacked above the sport badge on the right (not the previous
   generic "Comments" title). **The post's own content is also repeated at the top of the dialog
   body**, separated by a hairline border, above the comment list. `CommentSection` gained `post:
   Post | null` and `sport: SportProfile | null` props for this — `HomeFeedPage` resolves both from
   its already-loaded `data.posts` (via `sportKeyForId`, the same lookup `Feed.tsx` already does per
   post) and passes them down. Reuses `PostCard`'s exact avatar/name/time/sport-badge rendering
   conventions (`getRampBadgeClasses`, `getSportIcon`, `formatRelativeTime`) for visual consistency.
2. **The composer/reply "Post" buttons now swap color on disabled↔enabled** (muted `bg-border`/
   `text-text-muted` → solid `bg-accent-solid`/white) instead of `Button`'s default opacity-fade
   disabled treatment. Implemented as a `className` override on the shared `Button` component
   (`disabled:bg-border disabled:text-text-muted disabled:opacity-100`) rather than a new `Button`
   variant or hand-rolled markup — `Button`'s primary variant already sets the enabled-state colors,
   and Tailwind's `disabled:` variant classes only apply while the `disabled` attribute is actually
   present, so this composes cleanly without touching `Button` itself (which other pages' primary
   buttons, e.g. Login/Register submit, still use with the original opacity-fade treatment — this
   override is scoped to just these two buttons, not a global change).

`shared/ui/dialog.tsx` changed shape to support the custom header: the previous `DialogHeader`
(title-only) became unused once `CommentSection` needed to build its own header, so it was replaced
with lower-level `DialogTitle`/`DialogClose` exports instead of keeping a now-dead title-only
abstraction around. `CommentSection` still renders a Radix-required accessible `DialogTitle`, just
`sr-only` ("Comments on {author}'s post") since the visible header now conveys the same information
visually.

Re-verified after this change: `pnpm test` 200/200 (2 new assertions — header content, disabled↔
enabled button color), `pnpm exec tsc -b`/`pnpm lint`/`pnpm build` clean, Storybook screenshots
confirmed the header/body layout matches the reference pixel-for-pixel, and a second live-backend
browser pass confirmed the button's computed `background-color` genuinely changes
(`rgba(44,44,42,0.12)` disabled → `rgb(24,95,165)` enabled) — not just a class-name check.

## Non-obvious constraints for later tickets

- `CommentSection` has no `postId` prop — its comment data comes entirely from `HomeFeedPage`'s
  `useCommentsData(activeCommentsPostId, isOpen)` call, passed down alongside the resolved `post`/
  `sport` objects (added in the addendum above). Any future ticket touching this component should
  keep it hook-free, per the design correction earlier in this doc.
- The reply backend constraint ("a reply can never itself be replied to") is enforced purely by the
  client never rendering a "Reply" button on a non-root `CommentItem` (`comment.parentCommentId ===
  null` check) — there's no other client-side guard, since the UI structurally can't produce a
  `parentCommentId` pointing at a reply.
- `MAX_COMMENT_LENGTH` (1000) now lives in `feed/types.ts` — reuse it, don't hardcode `1000` again
  if a future ticket touches comment input validation.
- The muted-gray/solid-blue disabled-button swap (see addendum) is intentionally scoped to the
  comment composer/reply buttons via a `className` override, not a new shared `Button` variant. If
  a future ticket (e.g. FEED-3's post composer, which the design-reference file also happens to
  show using a similar swap treatment with `border-accent` instead of `accent-solid`) wants the same
  pattern in a third place, that's the point to decide whether it graduates into a real `Button`
  variant instead of a third copy-pasted override.

---

### FEED-2 · CommentSection (real)
**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-1 · **Spec:** AUTH/FEED epic § FEED-2 ·
**Summary:** `client/docs/FEED-2_COMMENTSECTION_REAL.md`

De-mocks nothing (no `CommentSection` existed before this ticket) — wires a new modal comment thread
(`GET`/`POST /posts/{postId}/comments`, delete, like/unlike) from `PostCard`'s comment icon. No
`design-reference-*.html` covered this surface, so 3 scope questions were confirmed with the user
before implementation (recorded as deltas below).

**Deltas for later tickets:**
- **Modal dialog (user decision)**, not inline expand — new shared `Dialog` primitive
  (`src/shared/ui/dialog.tsx`, `@radix-ui/react-dialog`) and a new `--color-overlay` token. Any
  future modal (e.g. FEED-5's CreateGroupModal/JoinGroupModal) should reuse this primitive.
- **Reply-to-comment, one level deep, is in scope (user decision)** — the backend already enforces
  "no reply-to-a-reply" server-side and returns each root comment's `replies` fully populated, so no
  generic recursion or extra endpoint was needed.
- **"View more comments" is a plain button (user decision)**, not `Feed`'s
  `useInfiniteScrollSentinel` auto-load pattern.
- **`CommentSection` takes all data as props — no internal data hook, no `postId` prop.**
  `HomeFeedPage` owns `useCommentsData(activeCommentsPostId, isOpen)`, matching every other Home
  Feed component's presentational/controlled convention (this was a mid-implementation correction —
  see the summary doc). Any future ticket extending `CommentSection` should keep it hook-free.
- **`MAX_COMMENT_LENGTH` (1000, matches the backend's real `@Size(max = 1000)`) now lives in
  `feed/types.ts`** — reuse it, don't hardcode `1000` again.
- **Real bug found and fixed in `useDeleteComment`'s optimistic rollback** (two overlapping cache
  snapshots, one silently clobbering the other) — see the summary doc; the fix pattern (one snapshot
  scoped to `feedKeys.all`, since `feedKeys.comments(postId)` nests under it by design) is the
  reference for any future hook needing to roll back more than one cache scope at once.
- **HF-16 filed and now `DONE`** (visual-regression baselines stale — comment `<span>` became a
  `<button>` — regenerated via the `client-ci` `update-baselines` dispatch). Any ticket touching
  `PostCard` again should expect the same staleness and roll a baseline regen into itself, per the
  HF-13/14/15/16 precedent.
- **`design-reference-post-modal.html` added retroactively** (`client/design-reference/`),
  extracted from the shipped implementation rather than pre-implementation (no mockup existed for
  this ticket). Static, interactive (like/reply/delete/add-comment all wired in vanilla JS,
  mirroring the real optimistic behavior) — not yet wired into the `visual-regression` Playwright
  project (no baseline screenshots/spec file exist for it, unlike HF-10a's home-feed baselines).
  **Filed as FEED-11** (`TODO`, below) rather than left as an open question.
- **The reference was then hand-revised by the user and the implementation updated to match** (same
  day) — the dialog header now shows the commented-on post itself (author/time/sport badge, close
  button stacked above the badge) instead of a generic "Comments" title, and the post's own content
  is repeated at the top of the dialog body above the comment list. `CommentSection` gained `post`/
  `sport` props (resolved by `HomeFeedPage` from its loaded feed data) for this. The composer/reply
  "Post" buttons also picked up a muted-gray→solid-blue disabled/enabled color swap (a `className`
  override on `Button`, not a new variant — see FEED-2's summary doc addendum for why, and note for
  FEED-3 if its composer's own `border-accent`-swap button ends up wanting the same pattern a third
  time). `shared/ui/dialog.tsx`'s title-only `DialogHeader` was removed as dead code in favor of
  lower-level `DialogTitle`/`DialogClose` exports, since `CommentSection` now builds a custom header.
