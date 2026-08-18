# HF-19 · Regenerate visual-regression baselines — follow-up ticket, not in the epic

### HF-19 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-22) · **Type:** Infrastructure (Testing) · **Dependency:** GRP-6's
app-wide Dialog position/size/header changes · **Summary:**
`client/docs/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md` (Addendum section)

**Found during GRP-6's addendum:** the shared `Dialog`/`DialogContent` primitive
(`src/shared/ui/dialog.tsx`) changed app-wide — page-anchored positioning, a `fixedHeight` (60vh)
variant, and a new shared `DialogHeader`. `CommentSection` (the `post-modal-*` visual-regression
suite, FEED-11/FEED-12) is one of the two modals that opted into `fixedHeight`, and it renders on
Home Feed, which has a `ModalAnchorProvider`. Confirmed via SHA-256 comparison against the new
`visual-baselines.zip`: exactly the 9 `post-modal-*` baselines changed (all 3 states × 3
breakpoints — the comment dialog now renders at a fixed 60vh instead of shrink-to-fit); the 9
`home-feed-*` baselines (no modal open in those captures) are byte-identical, unaffected — same
"only the causally-connected baselines move" pattern as HF-16 (6-of-9, not all 9).

**To execute:** identical process to HF-12..HF-18 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
comment modal's fixed-height empty space (rather than shrink-to-fit) renders as intended and nothing
else drifted unexpectedly.

**Executed:** `visual-baselines.zip` provided directly (pre-downloaded, not re-triggered this
session), extracted and compared via SHA-256 against the committed set before overwriting: the 9
`post-modal-*` files differed, the 9 `home-feed-*` files were identical. Human visual check of
`post-modal-populated`/`post-modal-empty`/`post-modal-draft` at 375/1280px confirmed the comment
modal now shows a visibly taller box with empty space below its content (fixed 60vh) rather than
shrink-wrapping tightly — correct, matches the intended design, not a rendering bug. Not run through
Playwright locally this round (Windows-vs-Linux font-rendering noise floor already well-established
since HF-12 — the provided artifact is itself the Linux-rendered authoritative baseline, so a local
diff run would add noise, not signal).
