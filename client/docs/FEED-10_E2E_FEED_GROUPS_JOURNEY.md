# FEED-10 · E2E functional test — feed/groups journey

**Status:** `DONE` (2026-07-16) · **Type:** Testing · **Dependency:** MSW-0, FEED-8 · **Spec:**
AUTH/FEED epic § FEED-10

## Design (as approved)

The epic's spec: a Playwright flow through the real feed and group UI (network via MSW-0's
handlers), covering 8 numbered steps — load+paginate, like/unlike, comment, create post, switch to a
group's feed, create a group, trending/broadcasts (incl. an expired-broadcast exclusion check), and
an admin-vs-non-admin broadcast-toggle check — plus the backlog's own SPORT-1 delta (sport-profile
filtering + a zero-profiles fixture). Acceptance criteria: zero real network calls, and at least one
MSW-simulated error response to prove FEED-8's error states render.

Resolved via a scoping conversation before implementation:

1. **Error-simulation target: wire up `CreatePostForm`'s missing error UI first, then simulate a
   failed post creation** (epic's literal example) — not FEED-8's `apiErrors.ts` overrides as its own
   delta note suggested. Investigation found `CreatePostForm` had no `isError` prop wired at all
   (FEED-8 never touched it, out of its approved scope), so simulating a create failure without first
   adding the UI would prove nothing. User decision: do the small product fix, matching the epic's
   original intent, rather than substituting a different surface.
2. **Admin/non-admin broadcast-toggle check: a dedicated pre-seeded fixture**, not reusing step 6's
   newly-created group — `mockOwnedGroup`, a second group where the test user is `group_owner`
   (`mockGroup` stays `group_member`), added directly to fixtures rather than depending on the
   create-group flow's side effect.
3. **Pagination: one long journey test, extended `postsState`** — 21 posts (`usePersonalFeed`'s page
   size is 20) seeded before the test starts, so "Load more" fetches a real second page; every later
   step (like, comment, create, switch group) operates against this same larger, still-realistic feed.
4. **Zero sport profiles: a separate, small `test()` in the same spec file** — impossible to fold into
   the main journey, since the primary fixture user is already at the 3-sport cap (needed for other
   assertions elsewhere in that same journey).

This is exactly what was built — no divergence from the approved design.

## What was built

**Product fix (small, per decision #1)**
- `CreatePostForm.tsx` — new `isError?: boolean` prop, renders "Couldn't create post. Try again."
  below the composer's action row when true. Deliberately does **not** change the existing
  clear-on-submit behavior (the textarea already empties immediately on submit, before the mutation
  resolves) — this is a visibility fix, not a content-preserving retry; the user retypes and
  resubmits via the same Post button.
- `useHomeFeedData.ts`/`useGroupsPageData.ts` gained `isCreatePostError: createMutation.isError`;
  both `HomeFeedPage.tsx`/`GroupsPage.tsx` wire it into `CreatePostForm`.
- New Storybook `ErrorState` story + a component test asserting the message shows/hides correctly.

**Fixtures** (`e2e/mocks/fixtures.ts`, `e2e/mocks/handlers/groups.ts`, `e2e/mocks/handlers/feed.ts`)
- `mockOwnedGroup` — second pre-seeded group, `currentUserRole: 'group_owner'`, sportId 2 (Tennis,
  distinct from `mockGroup`'s Soccer=5) — added to `groups.ts`'s initial `userGroupsState`.
- **Found and fixed a real latent bug while planning the expiry-exclusion check**:
  `mockBroadcastPost.broadcastEndTime` was hardcoded to `'2026-07-14T07:00:00'`, already in the past
  relative to "today" (2026-07-16) — it only still rendered as "active" because the old
  `/posts/broadcast` handler hardcoded a single-item response regardless of date, not because it was
  genuinely unexpired. Fixed to `hoursFromNow(24)` (mirroring `mockClock.ts`'s relative-time
  convention), since this is exactly what the exclusion check needed to exercise honestly.
- `mockExpiredBroadcastPost` (new) — a second broadcast, genuinely expired (`hoursAgo(24)`). The
  `/posts/broadcast` handler now filters a real `broadcastsState` list by expiry (mirroring the real
  backend's contract) instead of hardcoding `[mockBroadcastPost]` — proves the exclusion is a real
  filter over multiple candidates, not just an absent fixture. `broadcastsState` is deliberately kept
  separate from `postsState` (the real personal feed never blends in `GROUP_BROADCAST` posts, per
  `usePersonalFeed`'s own doc comment) so this doesn't inflate any existing spec's article-count
  assertions. `POST /posts` now also pushes a created `GROUP_BROADCAST` into `broadcastsState` (it
  wasn't reachable there at all before this ticket), matching the real backend's dual visibility.
- **`GET /posts/feed` is now genuinely page-aware** (`pagedFeedResponse`, real `page`/`size` from the
  request) instead of `mockPageResponse`'s "always one page" shortcut — harmless for every existing
  spec's small (<20-post) fixture, since fewer posts than the page size always still fits entirely on
  page 0 with `last: true`, identical to the old behavior.
- `feed.ts` exports a new test-only `seedPostsState(posts)` (mirroring `groups.ts`/`sport.ts`'s
  existing reset-helper precedent) — lets a spec replace `postsState` wholesale before it starts,
  while every other handler (like/unlike/comment/create/delete) keeps operating on the same shared
  array unchanged. Reused by the new `e2e/mocks/paginatedFeed.ts` (21-post generator — two posts are
  special-cased: index 19, the last on page 0, is a `GROUP_POST` for `mockGroup`, reused by step 5;
  index 20, only reachable via "Load more", is Basketball rather than Soccer, reused by step 9's
  sport-filter check) and its `fixtures.ts` helper `seedPaginatedFeedOnNextLoad`.
- `e2e/mocks/emptySportProfiles.ts` + `fixtures.ts`'s `seedZeroSportProfilesOnNextLoad` — same
  `overrideFeedToEmpty`-style pattern, for the isolated zero-profiles test.
- `e2e/mocks/failCreatePostOnce.ts` + `fixtures.ts` — a one-time `POST /posts` failure via msw's
  `{ once: true }` handler option, invoked **mid-test** (not on next load, unlike every other override
  here) via `page.evaluate` against `window.__mswWorker` directly, since the failure needs to apply to
  one specific submit, not the whole page load. After it's exhausted, msw falls through to `feed.ts`'s
  real create-post handler automatically, so a retry with new content succeeds normally.

**New spec**: `e2e/flows/feed-groups-journey.spec.ts`
- One `test('Feed/groups journey', ...)` with 9 `test.step()`s mirroring the epic's numbered journey
  (steps 1–8) plus the SPORT-1 delta (step 9).
- A second, isolated `test('zero sport profiles renders without error', ...)`.

## Verified

- `tsc -b`/`eslint .`: clean.
- `pnpm test`: 341/341 (up from 340) — the new `CreatePostForm` error-state test.
- `pnpm exec playwright test --project=e2e`: 31/31 passing (29 existing + 2 new) — confirmed the
  `/posts/feed` pagination change and fixture additions don't regress any existing spec. Repeated the
  new spec 3× under parallel workers with no flakiness observed.
- `pnpm exec playwright test --project=visual-regression`: same 9 "different" results as before this
  ticket, same diff ratios — the pre-existing Windows/Linux noise floor, not new drift.
- Storybook: screenshotted the new `CreatePostForm` `ErrorState` story directly — renders correctly.
- Live walkthrough against the real running backend (`./gradlew :server:bootRun` + `pnpm dev`):
  registered a fresh user, posted via the real composer — confirmed the new `isError` wiring doesn't
  introduce a false-positive error state on the normal (successful) path.

## Deltas for later tickets

- FEED-9 (QA/acceptance checklist) can now check off "FEED-10's E2E suite passes" for real.
- The real backend's actual `/posts/broadcast` expiry-filtering behavior was **not** independently
  re-verified against a live backend in this ticket (MSW's contract was hand-verified against the
  documented DTO shape only) — worth a spot-check whenever FEED-9's manual pass covers broadcasts.
