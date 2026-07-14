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
