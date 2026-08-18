# HF-16 · Regenerate visual-regression baselines — follow-up ticket, not in the epic

### HF-16 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-14) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-2's comment button + dialog ·
**Summary:** `client/docs/FEED-2_COMMENTSECTION_REAL.md`

**Found during FEED-2:** `PostCard`'s comment icon changed from a static `<span>` to a clickable
`<button>` (needed for the new comment dialog). Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (~0.01–0.02 pixel-ratio) — a small but real layout nudge from the button's
padding/focus-ring affordances. Direct image inspection of the actual render confirmed correct
content/layout, not a regression. Same reasoning as HF-13/14/15: the feature change is correct and
shouldn't be reverted, but regenerating baselines is a separate concern from the feature that caused
the drift.

**To execute:** identical process to HF-12/13/14/15 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
comment button renders correctly (no dialog-open state leaking into a static capture) and nothing
else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed via byte comparison before
overwriting). **Only 6 of the 9 actually changed** (`default`/`basketball` at all 3 breakpoints) —
the 3 `empty`-state baselines came back byte-identical to what was already committed, which makes
sense: the empty state renders zero posts, so `PostCard`'s comment button never appears in that
capture at all, nothing to shift. Human visual check of the `default`/`basketball` captures at all 3
breakpoints confirmed content, layout, sport badges, and like/comment counts all render exactly as
expected — no visible difference at normal viewing, consistent with the diff being a sub-pixel
padding nudge. `pnpm exec playwright test --project=visual-regression` still shows all 9 as
"different" when run **locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; CI is the authoritative visual environment). Confirmed via direct diff-image
inspection of the `empty` state (byte-identical to the prior baseline, so any local diff there is
*purely* Windows-vs-Linux font-rendering noise) that the same characteristic anti-aliasing pattern —
not a content mismatch — accounts for the `default`/`basketball` diffs too.
