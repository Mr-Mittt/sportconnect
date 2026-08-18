# FEED-11 · Visual regression harness for the post comment modal

**Status:** `DONE` (2026-07-18) — harness implemented, baselines generated via CI and committed.
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

## Baselines (executed 2026-07-18)

Generated via the `client-ci` workflow's `update-baselines` manual dispatch (ubuntu-latest — the
environment CI actually diffs against), same process as every prior baseline ticket (HF-12 through
HF-18). The `visual-baselines` artifact's 9 `post-modal-*.png` files were extracted into
`e2e/visual/__screenshots__/` and committed (the artifact also included the 9 `home-feed-*.png`
files — confirmed byte-identical to what was already committed, so only the new 9 needed staging).

Human visual check of `populated`/`draft`/`empty` at 1280px confirmed: the nested reply indents
correctly under its root comment (both timestamped "just now", confirming the negative-diff clock
behavior documented above holds in practice), the composer's Post button shows the correct
disabled/enabled treatment in each state, and the empty-state message renders correctly.

`pnpm exec playwright test --project=visual-regression app-post-modal.spec.ts` run locally on
Windows against these new baselines still shows all 9 as "different" (~0.02–0.03 pixel-ratio) —
expected per HF-12's own precedent (baselines are Linux-rendered; CI is the authoritative visual
environment; local Windows runs diverge on font rendering, not content).

---

### FEED-11 · Visual regression harness for the post comment modal — new ticket, not in either epic
**Status:** `DONE` (2026-07-18) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-2 (`DONE`) ·
**Origin:** raised during FEED-2's implementation — the modal has no visual-regression coverage
today, unlike Home Feed (HF-10a/b) or the auth pages (their own `a11y.spec.ts`/visual specs).

**Why this is its own ticket, not folded into FEED-2:** the comment dialog already has a
`design-reference-post-modal.html` reference and full Storybook + Vitest coverage — this ticket is
specifically about the missing Playwright `visual-regression` project coverage (pixel-diffing the
real rendered page against frozen baselines), the same layer HF-10a/b added for Home Feed. Deferred
at FEED-2 time because it's a genuine scoping decision (see below), not a quick add.

**What makes this different from HF-10a/b's harness (read before starting):**
- Home Feed's baselines are captured by `page.goto('/')` plus a query param for the empty state —
  a URL is enough. The comment modal is **not reachable by URL today** — a spec has to
  `page.goto('/')`, find a real post card, click its "View comments" button, and wait for the
  dialog's open transition to settle before screenshotting. **Check FEED-12's status before
  starting this**: if FEED-12 (above) has shipped by then, just `page.goto('/posts/{id}')` directly
  instead — simpler and removes the click-through step entirely. If FEED-12 hasn't landed yet, fall
  back to the click-through approach described here rather than blocking on it. Decide whether to
  screenshot the whole page (dialog + dimmed backdrop, matching how a user actually sees it) or just
  the dialog element (`page.locator('[role="dialog"]')`) — the former matches
  `design-reference-post-modal.html`'s own framing, the latter is cheaper to maintain if the backdrop
  content (feed posts) is expected to drift independently.
- **Meaningful states to cover** (mirroring HF-10a's "3 breakpoints × 3 states" shape): empty
  thread, populated (root comments + at least one reply, to catch indentation drift), and the
  disabled→enabled Post button treatment (FEED-2's addendum) — arguably 2 button-state captures at
  one breakpoint rather than duplicated across all 3, to keep the baseline count sane. Loading/error
  states are intentionally NOT frozen here, same precedent as Feed's own visual spec (HF-10b) never
  capturing `isLoading`/`isError` — those are Storybook's job.
- **MSW dependency:** unlike Home Feed's visual spec (which currently drives mock-internal state via
  `usePersonalFeed`'s real query against MSW handlers already wired for `e2e`), this needs the
  `feedHandlers`' `commentsState` (FEED-2) to already have deterministic fixture data seeded for
  whichever post the spec opens — reuse `mockPost`/`mockComment` from `e2e/mocks/fixtures.ts`, don't
  invent a second fixture set.
- **Freezing time still applies** — reuse the same `page.clock.setFixedTime()` pattern HF-10b
  established for Home Feed's relative timestamps, since `CommentItem` also renders
  `formatRelativeTime()`.

**Acceptance criteria (once picked up):**
- New baselines committed under `e2e/visual/__screenshots__/` (naming convention:
  `post-modal-<state>-<width>.png`, matching Home Feed's `home-feed-<state>-<width>.png` pattern).
- Baselines generated via the same `client-ci` `update-baselines` dispatch as Home Feed's (Linux-
  rendered, per HF-12's precedent) — not committed from a local Windows run.
- Wired into the existing `visual-regression` Playwright project (`playwright.config.ts`) — no new
  project/config needed, same as `app-home-feed.spec.ts`.
- A token-hardcoding audit pass over `CommentSection.tsx`/`CommentItem.tsx`/`shared/ui/dialog.tsx`,
  matching HF-10b's own "diff against tokens, not just pixels" scope.

**Executed (2026-07-18):** harness built — `e2e/visual/app-post-modal.spec.ts`, dialog-element-only
screenshots (user decision — cheaper than full-page, backdrop already covered by Home Feed's own
spec), 9 baselines (`empty`/`populated`/`draft` × 3 breakpoints, same shape as Home Feed). `populated`
adds a reply live through the real "Reply" UI onto `mockComment` (no new fixture); `draft` types text
into the composer without submitting, to capture the Post button's enabled treatment. Token audit
found nothing to fix. All 9 states ran mechanically correctly and were directly inspected (Playwright
wrote "actual" images since no baseline exists yet) — confirmed correct rendering in every case. See
`client/docs/FEED-11_POST_MODAL_VISUAL_REGRESSION.md` for the full writeup, including a non-obvious
finding about MSW-1's standalone mock server not sharing the page's frozen clock (turned out not to
matter — `formatRelativeTime`'s `minutes < 1` branch also catches negative diffs, so a live-created
reply still renders deterministic "just now" text regardless of the real run date).
**Baselines landed (2026-07-18):** `update-baselines` dispatch run, all 9 `post-modal-*.png` extracted
into `e2e/visual/__screenshots__/` and committed. Human visual check of `populated`/`draft`/`empty`
at 1280px confirmed: nested reply indents correctly under its root comment, both timestamped "just
now"; composer's Post button shows the correct enabled/disabled treatment in each state; empty-state
message renders correctly. `pnpm exec playwright test --project=visual-regression app-post-modal.spec.ts`
locally on Windows shows all 9 at ~0.02–0.03 pixel-ratio diffs — consistent with the established
Windows/Linux font-rendering noise floor documented since HF-12, not a content mismatch.
