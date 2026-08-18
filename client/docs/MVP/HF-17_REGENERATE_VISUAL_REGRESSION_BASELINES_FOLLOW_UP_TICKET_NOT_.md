# HF-17 · Regenerate visual-regression baselines — follow-up ticket, not in the epic

### HF-17 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-15) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-6's real trending hashtags ·
**Summary:** `client/docs/FEED-6_TRENDINGHASHTAGS_REAL.md`

**Found during FEED-6:** `shared/hooks/useTrendingHashtags.ts` swapped its hardcoded 4-hashtag mock
array for the real `GET /api/hashtags/trending` hook. Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (0.02–0.03 pixel-ratio, and a genuine image-height reduction — the Trending card
now renders 1 row instead of 4, shortening the page) — MSW's `mockHashtag` fixture is the only
trending row today, replacing the old mock data's `fridayrun`/`tournament`/`pickup`/`tennislife`
set. Direct image inspection of the actual vs. expected screenshots confirmed this is the correct
new rendering (real content, correctly shortened layout, nothing else shifted), not a regression.
Same reasoning as HF-13/14/15/16 for why this is its own ticket: the feature change is correct and
shouldn't be reverted, but regenerating baselines is a separate concern from the feature that
caused the drift.

**Second cause added (same ticket, follow-up UX request before merge):** `PostCard` no longer
renders a separate row of hashtag pill buttons below the content — hashtags are now inline within
the content text itself (`HashtagText`, see the ticket's summary doc). Every post whose content
contains a hashtag (all 3 Home Feed e2e fixtures do) is now one row shorter. Confirmed via the same
`visual-regression` run — no new/different failures, just a slightly larger diff ratio on top of
the trending-card cause above.

**To execute:** identical process to HF-12/13/14/15/16 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
Trending card's single real row renders correctly, hashtags render inline within post content (not
as a separate row), and nothing else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed via SHA-256 comparison before
overwriting — all 9 changed). Human visual check of `default`/`basketball`/`empty` at a spread of
breakpoints confirmed: hashtags render inline within post content (no separate row), correct sport
badges/like/comment counts, Trending card's single real `#fridayrun` row, and the empty state all
render exactly as expected — nothing else drifted. `pnpm exec playwright test
--project=visual-regression` still shows all 9 as "different" when run **locally on Windows** —
expected per HF-12's own note (baselines are Linux-rendered; CI is the authoritative visual
environment); diff ratios dropped back to the established ~0.01–0.02 sub-pixel noise floor,
consistent with font-rendering divergence rather than a content mismatch.
