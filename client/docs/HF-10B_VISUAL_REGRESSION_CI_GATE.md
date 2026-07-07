# HF-10b · Full-page visual regression + CI gate — implementation summary

**Ticket:** HF-10b (`client/docs/BACKLOG_MVP.md` #12, spec in `sporthub-home-feed-tickets.md` § HF-10b)
**Date:** 2026-07-07
**Status:** DONE

## Approved design (two user decisions up front)

1. **Baselines capture the real page, not the mockup.** The app can never pixel-match HF-10a's
   mockup baselines: the mockup hardcodes match times ("Sun, 9:00 AM") that the app computes from
   the clock with mutually inconsistent offsets, and the mockup renders icons via the Tabler
   webfont vs the app's SVGs. Instead: a **one-time human parity review** certified mockup
   fidelity (screenshots below), then the 9 baselines were re-taken from the real page. The
   ongoing gate is **self-regression at Playwright's tight default threshold** — unintended drift
   fails; intended changes re-baseline consciously. *This supersedes HF-10a's "diff the real page
   against the mockup baselines" delta; the 9 snapshot names are unchanged.*
2. **Linux baseline bootstrap via artifact.** Committed baselines are OS-specific and currently
   Windows-rendered; CI runs Linux. The workflow's `update-baselines` dispatch input regenerates
   them on Linux and uploads a `visual-baselines` artifact to commit (procedure below).

## What was built

```
client/e2e/visual/app-home-feed.spec.ts   replaces reference-home-feed.spec.ts (retired — its
                                          job ended with the parity review; the mockup HTML
                                          remains the design artifact). Frozen clock
                                          (page.clock.setFixedTime → deterministic "2h ago" /
                                          "Tomorrow, 7:00 PM"), 3 breakpoints × 3 states,
                                          same 9 snapshot names, fullPage.
client/e2e/visual/__screenshots__/        9 baselines regenerated from the real page (Windows;
                                          swap for the Linux set after CI bootstrap)
client/src/.../useHomeFeedData.ts         `?visual-state=empty` seam in the mock internals —
                                          no mock sport is empty, so the empty state is
                                          otherwise unreachable; empties posts + matches only
                                          (the subset HF-10a's mockup empty state cleared)
.github/workflows/client-ci.yml           the repo's FIRST CI: on PRs/pushes touching client/**
                                          → pnpm install, lint, tsc -b, vitest, playwright
                                          e2e (incl. HF-8's a11y gate), visual; failure uploads
                                          the Playwright report; dispatch input regenerates
                                          baselines as an artifact
.github/PULL_REQUEST_TEMPLATE.md          PR checklist incl. the spec-required "compared against
                                          design-reference-*.html" line
```

## Spec process steps — results

1. **Automated pixel diff** — in place as above; 9/9 pass deterministically (two consecutive
   clean runs verified).
2. **Storybook coverage confirmation** — complete: TopBar, NavTabs, SportSwitcher, PostCard,
   Feed, UpcomingMatches, TrendingHashtags, GroupBroadcasts (+ ComingSoonPage) all have stories
   per visual state.
3. **Manual parity walkthrough** — mockup vs app compared side-by-side at 1280px
   (default/basketball) + empty state. Match on layout, spacing, chrome, ramp colors, badges.
   Known accepted deltas: match date strings (computed vs hardcoded), broadcasts read "1h ago"
   vs the mockup's bare "1h" (HF-3's single shared formatter), no reference-banner, SVG icons.
4. **Token audit** — clean: zero hardcoded hex, zero arbitrary px/rem classes, zero off-palette
   Tailwind colors in `src/**/*.{ts,tsx}`.

## CI bootstrap (do once, after this merges)

1. GitHub → Actions → **client-ci** → Run workflow → `update-baselines: true`.
2. Download the `visual-baselines` artifact; replace `client/e2e/visual/__screenshots__/`; commit.
3. GitHub → Settings → Branches → protect `master` → require the **client-ci / test** check.
   (Repo settings can't be changed from code — this is the manual step that makes it a *gate*.)
4. Note: local `pnpm test:visual` on Windows will then diff against Linux baselines and fail —
   regenerate locally only for intended changes, and let the dispatch workflow produce the
   committed set. (If this friction grows, split per-OS baseline dirs — decide when it hurts.)

## Non-obvious details

- `page.clock.setFixedTime` must be called **before** `page.goto` — mock timestamps are computed
  at module load.
- The empty-state seam reads `window.location.search` inside the hook (not module scope) so
  jsdom tests and client-side navigation stay predictable; FEED-1 removes it in favor of MSW.
- The visual spec waits on actual content (`article` visible / empty-state text) before
  screenshotting — `toHaveScreenshot`'s stability check alone won't catch a not-yet-rendered
  React tree.

## Verification (all passing)

`pnpm exec tsc -b` · `pnpm lint` · `pnpm test` 55/55 · `pnpm e2e` 8/8 · `pnpm test:visual` 9/9
(regenerate + clean verify). Workflow YAML reviewed; it first executes on the next push touching
`client/**`.
