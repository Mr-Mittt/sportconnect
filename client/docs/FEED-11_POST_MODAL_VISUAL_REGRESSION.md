# FEED-11 · Visual regression harness for the post comment modal

**Status:** Harness implemented; baselines pending CI generation (see "Remaining step" below).
**Dependency:** FEED-2 (`DONE`), FEED-12 (`DONE`) — picked up after FEED-12 shipped, so the simpler
`/posts/:postId` navigation path applied instead of the click-through-the-feed fallback the ticket
described for the case where FEED-12 hadn't landed yet.

## Approved design (Phase 3)

- **Screenshot scope:** the dialog element only (`page.getByRole('dialog')`), not the full page —
  user decision. The dimmed backdrop behind it is Home Feed content already covered by HF-10a/b's
  own visual spec; diffing it a second time here would be redundant surface area.
- **States — 3 × 3 breakpoints = 9 baselines**, matching Home Feed's HF-10a/b shape (user decision):
  - `empty` — a post with zero seeded comments (`mockBasketballPost`, id 4).
  - `populated` — `mockPost`'s existing root comment (`mockComment`) plus one reply added live
    through the real "Reply" UI action, to catch `CommentItem`'s nested-reply indentation. No second
    fixture set was invented, per the ticket's own constraint to reuse `mockPost`/`mockComment`.
  - `draft` — the same populated thread, with text typed into the composer (not submitted) to
    capture the Post button's enabled treatment. `empty`/`populated` already show its default
    disabled treatment, so this one extra state covers FEED-2's disabled→enabled addendum without
    needing a dedicated 4th state or duplicating both button states across all 3 breakpoints.
- **Navigation:** `page.goto('/posts/{id}')` directly via `seedAuthenticatedSession`, since FEED-12
  shipped first — no click-through-the-feed setup needed.
- **Clock freeze:** `page.clock.setFixedTime()` before navigation, same pattern as
  `app-home-feed.spec.ts`.
- **Baselines:** generated via the `client-ci` workflow's `update-baselines` manual dispatch
  (Linux-rendered), same process as every HF-12–HF-18 baseline ticket — not captured from a local
  Windows run.

## What was built

- `e2e/visual/app-post-modal.spec.ts` — new spec in the existing `visual-regression` Playwright
  project (no new project/config needed). 9 tests (3 states × 3 breakpoints), each producing one
  `post-modal-<state>-<width>.png` baseline once generated.

## A non-obvious mechanic worth documenting

MSW-1 replaced the old browser-Service-Worker mock with a **standalone Node mock server**
(`mockServer.ts`, its own process) — route handlers run there, not inside the page's JS context. So
`page.clock.setFixedTime()` only freezes the *browser's* clock; the `populated`/`draft` states'
live-added reply gets a real wall-clock `createdAt` (`new Date().toISOString()`, generated server-side
in real time whenever the suite happens to run).

This turned out not to matter: `formatRelativeTime`'s `minutes < 1 → 'just now'` branch also catches
*negative* diffs. Since the frozen page clock (`2026-07-07T19:00:00`, matching Home Feed's own
frozen time) is always in the past relative to whenever CI actually executes, the reply's real
creation timestamp is always "after" the frozen "now" — `differenceInMinutes` comes out negative,
which the `< 1` check treats the same as `0`. Result: the reply renders "just now" deterministically
regardless of what real calendar date the suite runs on. Confirmed by direct inspection of the
captured images (see below) — verified this holds, not just reasoned about it.

## Token-hardcoding audit (acceptance criteria item)

Scanned `CommentSection.tsx`, `CommentItem.tsx`, `shared/ui/dialog.tsx` for hardcoded hex/rgb values
and arbitrary Tailwind bracket syntax (`bg-[...]`, `text-[...]`, etc.) — none found in any of the
three files. Nothing to fix.

## Verification performed

- `pnpm exec tsc -b --noEmit` — clean.
- `pnpm lint` — clean.
- `pnpm exec playwright test --project=visual-regression app-post-modal.spec.ts` — all 9 tests ran
  mechanically correctly (dialog opens, reply posts, draft text enables the Post button) and failed
  only with Playwright's expected "no baseline exists yet, writing actual" — not a functional error.
  Directly inspected the 9 captured "actual" images: `empty` shows the right empty-state message and
  post header; `populated` shows the root comment correctly indented above its nested reply, both
  timestamped "just now"; `draft` shows the composer's typed text with the Post button in its enabled
  (solid) treatment. All three match the intended design.
- `pnpm e2e` (functional suite, unaffected — separate `testDir`/project) — all 34 tests still pass.

## Remaining step (not done locally, by design)

Per every prior baseline ticket (HF-12 through HF-18)'s established precedent, baselines are
generated via the `client-ci` workflow's `update-baselines` manual dispatch (ubuntu-latest — the
environment CI actually diffs against), not captured from this local Windows machine. Once
generated: download the `visual-baselines` artifact, extract the 9 `post-modal-*.png` files into
`e2e/visual/__screenshots__/`, do a quick human visual check against the captures described above,
and commit. Until then, `pnpm exec playwright test --project=visual-regression app-post-modal.spec.ts`
will keep failing locally with "no baseline exists" — that's expected, not a regression.
