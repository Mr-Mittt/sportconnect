# HF-15 · Regenerate visual-regression baselines — follow-up ticket, not in the epic

### HF-15 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-14) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-1's real feed + delete menu ·
**Summary:** `client/docs/FEED-1_FEED_POSTCARD_REAL.md`

**Found during FEED-1:** Home Feed's `Feed`/`PostCard` are real now (`usePersonalFeed()`), and
`PostCard` gained a new "..." delete menu (owned-post only). Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (0.01–0.03 pixel-ratio) — real post content (different author names/text) differs
from the old mock content, and 2 of the 3 e2e fixture posts are owned by the seeded test user, so
the new delete menu icon now appears on them. Direct image inspection of the actual vs. expected
screenshots confirmed this is the correct new rendering, not a regression. Same reasoning as
HF-13/HF-14 for why this is its own ticket: the feature change is correct and shouldn't be
reverted, but regenerating baselines is a separate concern.

**To execute:** identical process to HF-12/HF-13/HF-14 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
3 real posts, their sport badges, and the 2 delete-menu icons all render as expected and nothing
else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed before overwriting). Human visual
check of the `default`/`empty` @ 1280px captures confirmed the 3 real posts, correct sport badges,
correct like/comment counts, and the 2 delete-menu icons all render exactly as expected — nothing
else drifted. `pnpm exec playwright test --project=visual-regression` still shows all 9 as
"different" when run **locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; local Windows runs diverge on font rendering; CI is the authoritative environment).
Confirmed via direct diff-image inspection that the residual local diff is sub-pixel text
positioning (anti-aliasing), not a content mismatch — same text, same layout, same data in both.
Committed on `feature/feed-1-feed-postcard-real` (not a separate branch) since the baselines and
the code that changed the rendering need to land together — this repo's `master` never had
FEED-1's changes, so there's no "baselines vs. shipped code" mismatch window to avoid, unlike the
HF-13/HF-14 case where the triggering change had already merged.
