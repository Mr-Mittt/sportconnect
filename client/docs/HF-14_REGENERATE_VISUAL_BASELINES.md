# HF-14 — Regenerate visual-regression baselines

**Status:** DONE (2026-07-10)
**Dependency:** AUTH-4's TopBar avatar-menu change

## Context

AUTH-4 added a logout entry point to `TopBar` — a chevron + dropdown menu on the avatar (identity
header, "Log out" item). `TopBar` renders on every page, so this changes Home Feed's already-shipped
rendering the same way AUTH-1's `cn()` fix did (HF-13). Confirmed pre-merge via `pnpm test:visual`:
all 9 committed baselines diffed at ~0.02–0.03 pixel-ratio, consistently, in the top-right corner
where the avatar sits — not flakiness, the expected shape of "one small UI element changed." Filed as
this follow-up rather than blocking AUTH-4 on it (see `client/docs/AUTH-4_PROTECTED_ROUTE_LOGOUT.md`).

## What was done

Same process as HF-12/HF-13:

1. User manually triggered the `client-ci` workflow's `update-baselines` dispatch on GitHub (Actions
   → `client-ci` → Run workflow → `update-baselines: true`, run on `master`, after AUTH-4 merged).
2. Downloaded the resulting `visual-baselines` artifact (`visual-baselines.zip`).
3. Extracted and diffed against the currently-committed baselines first (byte comparison, not just
   file size) — confirmed all 9 files actually changed, not a no-op run.
4. **Human visual check**: reviewed `home-feed-default-1280.png` and `home-feed-empty-375.png`
   directly. The avatar chevron renders correctly in the top-right corner at both breakpoints,
   nothing else in the layout shifted or broke — the diff is exactly the expected, isolated change.
5. Replaced all 9 files in `client/e2e/visual/__screenshots__/` with the regenerated Linux baselines.

## Verification

Human visual review (above) substitutes for a local `pnpm test:visual` run here — per HF-12, local
Windows rendering is known to diverge from the Linux baselines regardless of correctness, so the real
verification is (a) the CI run that produced these baselines was itself green against the real built
app (`update-baselines` mode screenshots the actual page, not just copies old ones), and (b) manual
visual review confirming no unintended second change beyond the avatar-menu addition. Actual
regression-passing confirmation happens next time `client-ci`'s normal (non-dispatch) visual step
runs against these new baselines — expected to pass now, whereas it would have failed against the old
ones post-AUTH-4.
