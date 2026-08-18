# HF-18 · Regenerate visual-regression baselines — follow-up ticket, not in the epic

### HF-18 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-16) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-7's real group broadcasts ·
**Summary:** `client/docs/FEED-7_GROUPBROADCASTS_REAL.md`

**Found during FEED-7:** `shared/hooks/useGroupBroadcasts.ts` swapped its hardcoded 2-broadcast mock
array for the real `GET /api/posts/broadcast` hook. Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff further — the Group broadcasts card now renders 1 real row (MSW's single
`mockBroadcastPost`/`mockGroup` fixture pair, "Friday Night Football") instead of the old mock
data's 2 rows ("Riverside Ballers"/"FC Weekend Warriors"), shortening the page further on top of
HF-17's already-executed causes. Confirmed via direct image inspection this is the correct new
rendering (real group name/initials/content, correctly shortened layout, nothing else shifted), not
a regression. Same reasoning as HF-13..HF-17 for why this is its own ticket.

**To execute:** identical process to HF-12..HF-17 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
Group broadcasts card's single real row renders correctly and nothing else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run on `docs/hf-18-regenerate-visual-baselines`,
`visual-baselines.zip` downloaded and extracted over `client/e2e/visual/__screenshots__/` (same 9
filenames, confirmed via SHA-256 comparison before overwriting — all 9 changed, consistent with the
broadcasts card being a global rail element present in every state, same reasoning as HF-17's
Trending-card change touching all 9). Human visual check of `default`/`basketball`/`empty` at
1280px confirmed: the Group broadcasts card's single real "Friday Night Football" row (correct
group name, initials, message text), correct Trending row, correct posts/sport badges, and the
empty state all render exactly as expected — nothing else drifted. `pnpm exec playwright test
--project=visual-regression` still shows all 9 as "different" when run **locally on Windows** —
expected per HF-12's own note (baselines are Linux-rendered; CI is the authoritative visual
environment). Diff ratios (0.01–0.04) are consistent with the established sub-pixel font-rendering
noise floor; one case (`empty-768`) showed an 11px height difference from font-metric line-wrapping
divergence, confirmed via direct image inspection to be identical content/layout, not a mismatch.
