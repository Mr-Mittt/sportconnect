# HF-9 · QA / acceptance checklist (Home Feed) — results

**Ticket:** HF-9 (`client/docs/BACKLOG_MVP.md` #14, spec in `sporthub-home-feed-tickets.md` § HF-9)
**Date:** 2026-07-07
**Status:** DONE — 6/7 items pass; item 7 conditional (see notice), follow-up ticket **HF-12**.

## Checklist results

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | All components render in isolation with mock data | ✅ | `pnpm build-storybook` clean; 9 components × per-state stories (26 stories total), each visually verified against the mockup in its own ticket (HF-1..HF-6 summaries) |
| 2 | Sport filter cascades to Feed + Upcoming; Trending/Broadcasts unfiltered | ✅ | `HomeFeedPage.test.tsx` + journey step 2; "still intended" re-confirmed — the global behavior was an explicit user decision in HF-5 and HF-6 |
| 3 | Like toggle optimistic, reversible, count math correct under repeated toggling | ✅ | Synchronous flip (HF-3/HF-7 contract = instant); new repeated-toggle test added this ticket (7 flips → exactly +1, 8th → baseline; no drift). 56/56 unit |
| 4 | Empty states: sport with zero posts / zero matches | ✅ | `Feed.test` + `UpcomingMatches.test` empty cases; full-page empty state in the visual baselines. Note: no mock sport is *partially* empty (posts-only or matches-only) — component tests cover the two empties independently |
| 5 | Responsive at mobile/tablet/desktop | ✅ | HF-8's committed gate (overflow + axe at 375/768/1280, `e2e/flows/a11y.spec.ts`) + 9 visual baselines at the same widths; 9/9 passing |
| 6 | No hardcoded colors — tokens only | ✅ | HF-10b token audit (zero hex / arbitrary px / off-palette classes in `src/`); only test files changed since. Dark mode: not in MVP scope — tokens make it a theme-block change when scoped |
| 7 | HF-11's E2E journey passes **in CI** | ✅ **RESOLVED 2026-07-08** | HF-12 executed: first runs caught + fixed a real `.gitignore` bug, Linux baselines swapped in via dispatch artifact, **fully green `client-ci` run merged (PR #2)**. See `HF-12_CI_BOOTSTRAP.md` |

## Notice — resolved (2026-07-08)

Item 7's condition is met: `client-ci` runs green on GitHub Actions (lint/tsc/unit/e2e/visual,
Linux baselines). One caveat survives: **branch protection is unavailable on the GitHub Free
plan for private repos**, so the check reports but cannot block — a red `client-ci` is
merge-blocking by convention until the repo goes public or the plan is upgraded.

## Epic closeout

HF-00 → HF-9: all 14 Home Feed tickets `DONE`. Cumulative test surface: 56 unit/component tests,
9 e2e (7-step journey + smoke + a11y gate), 9 visual-regression baselines, 26 Storybook stories,
CI workflow + PR template. Next: Phase 5 (MSW-0, AUTH-0..) — note AUTH-3/AUTH-5 remain blocked
on auth backlog A2 (verify before starting Phase 5, per the backlog's reality check).

---

### HF-9 · QA / acceptance checklist (Home Feed)
**Status:** `DONE` (2026-07-07) · **Type:** QA · **Dependency:** HF-8, HF-10b, HF-11 · **Spec:** HF epic § HF-9 ·
**Summary:** `client/docs/HF-9_QA_ACCEPTANCE_CHECKLIST.md`

6/7 items pass with evidence; item 7 (E2E green **in CI**) is conditional — CI has never
executed. **The Home Feed epic (HF-00..HF-9) is closed**; the unverified CI run is the epic's
release condition, tracked as HF-12.
