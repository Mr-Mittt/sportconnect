# HF-10a · Visual-regression harness setup — implementation summary

**Ticket:** HF-10a (`client/docs/BACKLOG_MVP.md` #3, spec in `sporthub-home-feed-tickets.md` § HF-10a)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Wire the Playwright `visual-regression` project (installed by HF-00) to screenshot the frozen,
approved mockup at 375/768/1280px in three states (default "All", Basketball selected, empty feed)
and commit those images as the baseline set HF-10b later diffs the real page against. Three
decisions confirmed in Phase 1:

1. **Reference location:** moved `design-reference-home-feed.html` from `client/docs/` to
   `client/design-reference/` per `client/CLAUDE.md`'s convention (live path references updated:
   README, `mockData.ts` and `index.css` comments).
2. **Icon font vendored locally** (`design-reference/assets/tabler/`, webfont 2.47.0 — css +
   woff2/woff from the npm package) and the mockup's `<link>` retargeted to it. Only that line
   differs from the approved file.
3. **CI deferred:** the repo has no CI infrastructure at all; this ticket delivers the runnable
   `pnpm test:visual` check + docs. Making it a required check is HF-10b's job.

## What was built

```
client/
  design-reference/
    design-reference-home-feed.html   moved from docs/; <link> now points at local assets
    assets/tabler/                    vendored icon font (tabler-icons.min.css + fonts/*.woff2/.woff)
  e2e/visual/
    reference-home-feed.spec.ts       9 tests: 3 breakpoints × 3 states, loaded via file:// —
                                      no dev server, no app code involved
    __screenshots__/                  9 committed baseline PNGs (home-feed-<state>-<width>.png)
  playwright.config.ts                visual-regression project gains
                                      snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}'
  README.md                           new "Visual regression" section (run, regenerate, caveats)
```

State driving: Basketball via a real click on `[data-sport="basketball"]`; the empty state isn't
reachable by clicking (every mockup sport has posts), so the spec drives it at runtime with
`page.evaluate` (empties `posts` **and** `upcoming`, re-renders) — the frozen file is untouched,
and the baseline covers both the feed and matches empty states. Screenshots wait on
`document.fonts.ready` so icon glyphs never race font loading.

## Key findings & divergences

- **The mockup's icon CDN link was always a 404** — `@tabler/icons-webfont@2.47.0` has no `dist/`
  directory, so the approved mockup rendered without icon glyphs. Vendoring the same font version
  fixes that: the committed baselines show the icons the design *intended*. Flagged rather than
  silently absorbed, since the baselines are therefore "more correct" than what was literally
  reviewed.
- **`__dirname` doesn't exist in the ESM spec context** (`"type": "module"`) — the spec resolves
  the reference file via `new URL(..., import.meta.url)` instead.
- **Snapshot paths are platform/test-agnostic by design** so HF-10b's real-page test can diff
  against the *same committed files* by reusing the snapshot names. Trade-off: baselines carry no
  platform suffix, and rendering differs across OSes — the committed set was generated on
  **Windows**; when Linux CI arrives, regenerate once there and treat that as canonical.
- HF-00's `e2e/visual/placeholder.spec.ts` was removed — superseded by the real harness spec.

## Verification (all passing)

- `pnpm test:visual --update-snapshots` → 9 baselines written; immediate clean re-run → **9/9 pass**
  (deterministic on the same machine)
- Baselines visually inspected: icons render from the vendored font, sport ramps/full-vs-open CTAs/
  pill wrapping/empty-state messages all correct at all three widths
- `pnpm lint`, `pnpm test` (7/7), `pnpm e2e` (1/1), `pnpm build` — all unaffected and green

## Regeneration (also in README)

After an approved mockup change: `pnpm test:visual --update-snapshots`, commit the changed PNGs
together with the mockup change. An unexplained baseline diff in review is a red flag.
