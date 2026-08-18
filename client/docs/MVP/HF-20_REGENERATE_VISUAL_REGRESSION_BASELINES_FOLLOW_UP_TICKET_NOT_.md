# HF-20 · Regenerate visual-regression baselines — follow-up ticket, not in the epic

### HF-20 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-08-14) · **Type:** Infrastructure (Testing) · **Dependency:** CLIENT-SESSION-9's
`UpcomingMatches` second button · **Summary:** `client/docs/CLIENT-SESSION-9_PARTICIPATION_ACTION.md`

**Found while verifying CLIENT-SESSION-9's dialog-anchor bug fix:** ran the `visual-regression`
project locally against isolated diagnostic ports (same setup used to verify the dialog fix) — all
18 baselines show diffs, but only 6 are a real content/layout change:
- **`home-feed-default-*`/`home-feed-pickleball-*` (6 of 9 home-feed baselines):** genuine
  **image-dimension change** (e.g. `home-feed-default-375`: expected 375×1566, received
  375×1546 — 20px shorter), not just anti-aliasing. Real cause: `UpcomingMatches`' rail card
  gained a second button (the participation action, next to "View details") — same
  "only the causally-connected baselines move" pattern HF-16/HF-19 already established. Both
  `default`/`pickleball` states render real session/match data (Upcoming Matches is populated);
  `home-feed-empty-*` doesn't (0 rail cards), so it's unaffected content-wise.
- **`home-feed-empty-*` (3 of 9) and all 9 `post-modal-*`:** same image dimensions as committed,
  1–3% pixel-ratio diffs — matches the already-documented Windows-vs-Linux font-rendering noise
  floor (HF-12 onward), not caused by this change. Not evidence of anything to fix.

**To execute:** identical process to HF-12..HF-19 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
Upcoming Matches rail card's new participation button renders correctly (matches `SessionListCard`'s
same button, right label per `getParticipationAction`) and nothing else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted.
Confirmed via SHA-256 comparison against the committed set before overwriting: **exactly the
predicted 6 files changed** (`home-feed-default-*`/`home-feed-pickleball-*`, all 3 breakpoints) —
the other 12 (`home-feed-empty-*` ×3, `post-modal-*` ×9) came back byte-identical to what was
already committed, confirming those were purely the local Windows-vs-Linux font-rendering noise
flagged above, not anything this dispatch needed to fix. Human visual check of
`home-feed-default-1280` confirmed each Upcoming Matches card now shows two buttons side by side
("View details" + the participation action, "Join" for all three fixture sessions since none are
JOINED/INVITED/REQUESTED for the fixture user) — correct, matches the intended
CLIENT-SESSION-9 design, nothing else drifted.
