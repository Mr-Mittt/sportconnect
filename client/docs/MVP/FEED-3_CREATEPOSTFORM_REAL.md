# FEED-3 · CreatePostForm (real)

**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-0 · **Spec:** AUTH/FEED
epic § FEED-3, with the 2026-07-14 design-review deltas recorded on the backlog entry

## Design (as approved)

**Data layer**
- `feed/types.ts`: add `MAX_POST_LENGTH = 5000` (mirrors `MAX_COMMENT_LENGTH`, matches
  `CreatePostRequest.content`'s real `@Size(max = 5000)`).
- `feed/optimisticFeedUpdates.ts`: add `prependPostToFeedCache(queryClient, queryKey, post)` —
  inserts into one specific cached query's first page, unlike the existing helpers which touch
  every mounted feed-shaped query.
- `feed/hooks/useCreatePost.ts`: replace the blanket `onSuccess: invalidateQueries` with a direct
  cache write via `prependPostToFeedCache`, targeting `personalFeed` or `groupFeed(groupId)`
  depending on the created post's own `groupId`. `onSettled` still invalidates in the background.
- `home-feed/useHomeFeedData.ts`: wire in `useCreatePost()`, expose `createPost`/`isCreatingPost`.

**Components**
- Hoist `POST_BUTTON_DISABLED_OVERRIDE` from `CommentSection.tsx` into `shared/ui/button.tsx`.
- New `home-feed/components/CreatePostForm.tsx` — presentational + controlled, owns its own
  transient textarea state (clears itself on submit, same shape as `CommentSection`'s composer).
  Auto-growing textarea, Photo/Location/Tag-sport as inert no-op buttons.

**Page wiring**
- `HomeFeedPage.tsx` renders `CreatePostForm` full-width between `SportSwitcher` and the
  two-column grid, matching the v2 design reference's layout.

**Design reference**
- Rename `design-reference-home-feed-v2.html` → `design-reference-home-feed.html`.

This is exactly what was built — no divergence from the approved design.

## What was built

| File | Change |
|---|---|
| `feed/types.ts` | `MAX_POST_LENGTH = 5000` |
| `feed/optimisticFeedUpdates.ts` | `prependPostToFeedCache()` |
| `feed/hooks/useCreatePost.ts` | `onSuccess` now prepends into the owning feed cache; `onSettled` invalidates in the background |
| `feed/hooks/useCreatePost.test.tsx` | rewritten — asserts cache-prepend (personalFeed and groupFeed cases) instead of the old blanket-invalidate assertion, plus a settle-time invalidate assertion |
| `home-feed/useHomeFeedData.ts` | `createPost(content)` / `isCreatingPost` added to the hook's return shape |
| `home-feed/useHomeFeedData.test.tsx` | new test for `createPost` end-to-end through the hook |
| `shared/ui/button.tsx` | new export `POST_BUTTON_DISABLED_OVERRIDE` |
| `home-feed/components/CommentSection.tsx` | imports the hoisted constant instead of defining it locally |
| `home-feed/components/CommentItem.tsx` | now imports the hoisted constant instead of an inlined duplicate of the same classes (was a 3rd unhoisted copy) |
| `home-feed/components/CreatePostForm.tsx` | new component |
| `home-feed/components/CreatePostForm.stories.tsx` | `Empty`, `Submitting`, `NoCurrentUser` states |
| `home-feed/components/CreatePostForm.test.tsx` | placeholder name interpolation, disabled↔enabled, submit-and-clear, `isSubmitting`, `MAX_POST_LENGTH`, inert-button click reporting |
| `home-feed/HomeFeedPage.tsx` | renders `CreatePostForm`, wires `createPost`/`isCreatingPost` |
| `home-feed/HomeFeedPage.test.tsx` | new integration test: typing + Post prepends a real article and clears the textarea |
| `design-reference/design-reference-home-feed-v2.html` → `design-reference-home-feed.html` | renamed (git mv), replacing the pre-composer v1 |

## Key decisions

- **Cache write over invalidate.** The acceptance criterion ("prepend without a full refetch")
  ruled out the scaffold's original `onSuccess: invalidateQueries`. Since post creation isn't
  optimistic in the true sense (there's no id/createdAt to fabricate before the server responds,
  unlike like/delete), the prepend happens in `onSuccess` with the real server-returned `Post`,
  not `onMutate`. `onSettled` still invalidates in the background for eventual consistency — same
  two-phase pattern `useDeletePost` already established.
- **Cache targeting generalizes to `useCreatePost`'s existing USER_FEED/GROUP_POST/GROUP_BROADCAST
  scope**, not just this ticket's personal-feed case: `post.groupId != null` routes to
  `groupFeed(groupId)` instead of `personalFeed`. Left a comment flagging that a `GROUP_BROADCAST`
  post lands in `groupFeed` but not `feedKeys.broadcasts()` — FEED-7's gap to close when it builds
  broadcast creation, not invented/solved here since it's out of this ticket's scope.
- **Composer owns its own textarea state**, not lifted to `HomeFeedPage`. This mirrors
  `CommentSection`'s composer exactly (which is itself page-local despite `CommentSection` being
  otherwise fully controlled) — `client/CLAUDE.md`'s controlled-components rule is about state
  other components need to react to (counts, like state), not a form's own transient input.
- **`POST_BUTTON_DISABLED_OVERRIDE` hoisted to `shared/ui/button.tsx`.** FEED-2's summary had
  already flagged this exact reuse as likely; this ticket was the trigger. While hoisting, found
  `CommentItem.tsx`'s reply button had its own inlined copy of the same class string (a 3rd,
  unhoisted duplicate) — consolidated that one too rather than leaving it out of sync with the new
  shared constant.
- **No new E2E spec.** FEED-10 (still `TODO`, separately queued in the backlog) owns "create a
  post" as step 4 of its full feed/groups journey. Ran the existing `home-feed-journey.spec.ts` and
  `a11y.spec.ts` to confirm the new composer doesn't regress them (29/29 e2e specs pass) rather than
  writing a speculative new spec this ticket doesn't own.
- **Fixed a stray CDN icon-font link** in the v2 reference file during the rename: it pointed at
  `cdn.jsdelivr.net` (a version that may 404, the exact problem HF-10a already fixed once) instead
  of the vendored `./assets/tabler/tabler-icons.min.css` path its own header comment claims. Now
  canonical, so restored to match HF-10a's established fix. Verified every icon class the v2 file
  uses (`ti-photo`, `ti-map-pin`, `ti-ball-football`, etc.) exists in the vendored CSS before
  committing to the local path.

## Verification

- `pnpm exec vitest run`: 213/213 passed (47 files).
- `pnpm exec tsc -b`: clean.
- `pnpm lint`: clean.
- `pnpm exec playwright test --project=e2e`: 29/29 passed — confirms `home-feed-journey.spec.ts`,
  `a11y.spec.ts` (axe + overflow at 375/768/1280px), and `smoke.spec.ts` all still pass with the
  composer now part of the rendered page.
- **Live browser verification against the real backend** (not just MSW): registered a real test
  user via `POST /api/auth/register`, ran a Playwright script against `./gradlew :server:bootRun` +
  `pnpm dev`. Confirmed: composer renders with the design reference's layout at 1280px and 375px;
  Post button is disabled (gray) when empty and enabled (solid `bg-accent-solid` blue, white text —
  confirmed via a zoomed screenshot of just the button, since the full-page screenshot was too small
  to visually distinguish the two states) once text is entered; clicking Post creates the post
  against the real `/api/posts` endpoint, prepends it to the top of the feed with the correct
  author name/avatar initials/"just now" timestamp, and clears the textarea back to its placeholder
  and disabled state — matching the acceptance criteria exactly.
- Two stale `node`/Vite processes were found squatting on ports 5173/5174 (the backend's CORS
  allowlist is locked to those two origins) — confirmed with the user before stopping them, since
  they weren't started in this session and could have been the user's own work.

## Explicitly out of scope (unchanged from the ticket)

- Group posting (no `groupId` control in the composer UI) — waits on FEED-4/5's group switching,
  which doesn't exist on Home Feed yet.
- Real Photo/Location/Tag-sport pickers — inert per the 2026-07-14 design delta.
- Broadcast creation (`postType: GROUP_BROADCAST`) — FEED-7's scope.

## Follow-up required before merge

Visual-regression baseline regen: the composer card is Home Feed's only structural change from the
pre-FEED-3 layout, so all 9 committed baselines (`e2e/visual/__screenshots__/`) are now stale, same
as HF-13/14/15/16. Per user decision this session, handled HF-15/16-style (regenerated and
committed into this same branch before merge, not filed as a separate follow-up ticket) — trigger
the `client-ci` workflow's `update-baselines` manual dispatch on GitHub, download the
`visual-baselines` artifact, replace `client/e2e/visual/__screenshots__/` with its contents, and do
a human visual check against `design-reference-home-feed.html` before committing.

---

### FEED-3 · CreatePostForm (real)
**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-0 (also practically
wants FEED-1 merged first — see delta below) · **Spec:** AUTH/FEED epic § FEED-3 ·
**Summary:** `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`

Maps to `CreatePostRequest`; 5000-char limit enforced client-side; broadcast creation belongs to
FEED-7, not this composer.

**Deltas (2026-07-14, from design review — not yet implemented):**
- **New visual spec:** `client/design-reference/design-reference-home-feed-v2.html` — adds a
  composer card (avatar + auto-growing textarea, placeholder "What's on your mind, {name}?") between
  the SportSwitcher and the feed. Action row: Photo / Location / Tag sport buttons, plus a Post
  button that's disabled until there's text (enabled state: `border-accent` fill, white text).
  Diffed against the original mockup — this composer card is the **only** structural change;
  everything else (nav, switcher, feed cards, rail) is identical.
- **User decision: v2 replaces v1 as the canonical reference.** When this ticket is picked up,
  rename `design-reference-home-feed-v2.html` → `design-reference-home-feed.html` (replacing the
  old file) rather than keeping both — matches HF-10a's "one frozen reference per page" convention.
  This means HF-10b/FEED-1's existing visual-regression baselines need regenerating for the
  composer too, on top of the already-filed **HF-15** (FEED-1's real-content diff) — likely worth
  doing as one combined baseline regen once this ticket's UI lands, not two separate passes.
- **User decision: Photo / Location / Tag sport buttons stay as inert mockup buttons for this
  ticket** — same pattern as HF-3/HF-4's `sendPrompt`-style no-ops for affordances with no
  destination yet, not real pickers. Only the textarea + Post button are functionally wired to
  `useCreatePost()`.
- **Practical sequencing note:** formal dependency is still just FEED-0, but implementation should
  branch off `feature/feed-1-feed-postcard-real` (not `master`) once picked up — that branch has the
  real `Post` type, `usePersonalFeed()` cache, and `optimisticFeedUpdates.ts` helpers this ticket's
  "prepend the new post to the current feed view without a full refetch" acceptance criterion needs
  to hook into. Building against `master`'s still-mock `Feed` would be throwaway work. Rebase onto
  `master` once FEED-1 actually merges.

**Executed (2026-07-14):** by the time this ticket was picked up, FEED-1 and FEED-2 had already
merged into `master` (PRs #28/#29 and #32), so the sequencing note above was moot — branched off
`master` directly, which already had the real `Post` type/`usePersonalFeed()`/
`optimisticFeedUpdates.ts` this ticket needed. `design-reference-home-feed-v2.html` renamed to
canonical `design-reference-home-feed.html` (git mv) as specified; also fixed a stray CDN icon-font
`<link>` the v2 file shipped with back to HF-10a's vendored `./assets/tabler/` path (the file's own
header comment claimed the vendored path but the actual `href` still pointed at jsdelivr — the same
404-risk class of bug HF-10a already fixed once elsewhere). `useCreatePost`'s `onSuccess` now
prepends the real server-returned post directly into the owning feed cache (`personalFeed` or
`groupFeed(groupId)`) instead of a blanket invalidate, satisfying the "without a full refetch"
criterion; `onSettled` still invalidates in the background. Live-verified end-to-end against the
real running backend (registered a test user, Playwright-driven browser walkthrough) — composer
renders, Post button's enabled/disabled states render correctly, posting prepends the real post and
clears the textarea, renders cleanly at 375px. Full details: `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`.

**Deltas for later tickets:**
- **`POST_BUTTON_DISABLED_OVERRIDE` now lives in `shared/ui/button.tsx`** (named export), not
  locally defined in `CommentSection.tsx` — this ticket was the 3rd call site FEED-2's own summary
  anticipated, so it's hoisted now. While hoisting, also consolidated `CommentItem.tsx`'s reply
  button, which had its own unhoisted inline copy of the same classes. Any future "Post"-style
  composer button should import this constant, not redefine the disabled-state classes again.
- **Visual-regression baseline regen (2026-07-15):** the plan was to do this HF-15/16-style
  (committed into the FEED-3 branch before merge), but the PR merged first — same situation as
  HF-13/14 in the end. Regenerated via the `client-ci` `update-baselines` dispatch on a separate
  branch (`docs/feed-3-regenerate-visual-baselines`) after merge. All 9 baselines changed
  byte-for-byte this time (unlike HF-16's 6-of-9) — the composer renders on every state including
  `empty`, unlike HF-16's comment button which only appeared on rendered posts. Human-verified
  `default`/`empty`/`basketball` at all 3 breakpoints: composer placeholder/action row/Post button,
  correct sport badges, correct like/comment counts, nothing else drifted.
  `pnpm exec playwright test --project=visual-regression` still reports all 9 as "different" locally
  on Windows — expected per HF-12's note (CI is the authoritative Linux-rendered environment);
  confirmed via diff-image inspection the local diff is pure sub-pixel font-rendering ghosting
  (same layout/content/structure), not a content mismatch.
- **`useCreatePost`'s cache-targeting logic (personalFeed vs. groupFeed by `post.groupId`) is a
  known gap for `GROUP_BROADCAST` posts** — they land in `groupFeed(groupId)` but not
  `feedKeys.broadcasts()`. FEED-7 (broadcast creation) needs to either extend
  `useCreatePost`'s onSuccess or add its own targeted cache write when it ships.
