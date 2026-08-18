# HF-11 · E2E functional test — Home Feed journey — implementation summary

**Ticket:** HF-11 (`client/docs/BACKLOG_MVP.md` #13, spec in `sporthub-home-feed-tickets.md` § HF-11)
**Date:** 2026-07-07
**Status:** DONE

## Approved design

One Playwright spec in the `e2e` project (`e2e/flows/home-feed-journey.spec.ts`) scripting the
epic's 7-step journey through the real running app, one `test.step` per journey step. Fully
mock-driven — no MSW, no network. Auto-waiting assertions only (no sleeps, per the flakiness
budget). Test-only ticket: zero app-code changes.

**Premise corrections (user-approved in Phase 1)** — three epic steps were written before later
decisions changed their ground truth, and the test asserts the observable truth instead:

1. **Step 5 (hashtag click)** — HF-7 wires hashtag callbacks as deliberate no-ops (destination
   is FEED-6's `usePostsByHashtag`). Asserts: tags in both the feed and the Trending card are
   enabled and clickable, and clicking neither navigates nor breaks the page.
2. **Step 6 (match CTAs)** — same: asserts both variants ("2 spots left, join" / "Full, view
   details") are present, distinct, enabled, and clickable without error.
3. **Step 7 ("Add sport" under the cap)** — the mock user has exactly 3 sports = AT the cap;
   per HF-2, the pill renders `aria-disabled` and doesn't fire. Asserts the at-cap behavior.
   An under-cap fixture becomes possible when SPORT-1/MSW provide per-test sport profiles.

## What the journey covers

1. Load — shell (TopBar text + primary nav), sport filter group, 4 articles, 3 match CTAs,
   4 trending rows, 2 broadcasts all render.
2. Basketball pill — feed → 1 article (Priya Shah), matches → 1 (Sunday pickup run);
   trending/broadcasts counts unchanged.
3. "All" — 4 articles, 3 CTAs restored.
4. Like toggle — 14 → 15 with `aria-pressed=true`, second click reverts to 14/false.
5–7. As per the premise corrections above.

## MSW follow-ups (the epic requires these be recorded, not scoped)

When Phases 5–6 de-mock the hooks, this spec needs handlers/upgrades:
- **Step 1**: handlers for feed (FEED-1), trending (FEED-6), broadcasts (FEED-7), sport
  profiles (SPORT-1) — page load starts hitting the network.
- **Step 4**: like/unlike mutation handler (FEED-1) — optimistic flip + server confirm.
- **Step 5**: hashtag click gains real behavior (FEED-6) — upgrade from "doesn't break" to
  asserting the filtered-posts destination.
- **Step 7**: under-cap sport-profile fixture (SPORT-1 + MSW-0) — test the enabled Add-sport
  path the epic originally described.

Also recorded on the backlog entry so FEED/SPORT tickets trip over it there.

## Verification (all passing)

- `pnpm e2e` 9/9 — the journey (7 steps) + smoke + HF-8's a11y gate, headless, in the same
  Playwright install/config as visual regression (spec acceptance criterion).
- `pnpm test` 55/55 · `pnpm exec tsc -b` · `pnpm lint` — no app code changed.

---

### HF-11 · E2E functional test — Home Feed journey
**Status:** `DONE` (2026-07-07) · **Type:** Testing · **Dependency:** HF-7 · **Spec:** HF epic § HF-11 ·
**Summary:** `client/docs/HF-11_E2E_HOME_FEED_JOURNEY.md`

7-step Playwright journey in the `e2e` project. No MSW needed while everything is mock-driven;
document on the ticket which steps need MSW handlers once Phases 5–6 make hooks hit the network.

**Deltas for later tickets:**
- **Premise corrections (user-approved):** steps 5/6 assert reachability + "click doesn't
  navigate/break" because hashtag/CTA callbacks are deliberate no-ops until FEED-6/FEED-1;
  step 7 asserts the at-cap `aria-disabled` state (mock user has 3 sports — the epic's
  under-cap premise needs SPORT-1's fixtures).
- **MSW upgrade map for this spec** (also in the spec header): step 1 → feed/trending/
  broadcasts/sport-profile handlers (FEED-1/6/7, SPORT-1); step 4 → like mutation (FEED-1);
  step 5 → real hashtag destination (FEED-6); step 7 → under-cap fixture (SPORT-1 + MSW-0).
  These tickets must update `home-feed-journey.spec.ts`, not just their own tests.
