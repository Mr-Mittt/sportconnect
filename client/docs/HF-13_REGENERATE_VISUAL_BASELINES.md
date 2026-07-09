# HF-13 — Regenerate visual-regression baselines

**Status:** DONE (2026-07-09)
**Dependency:** AUTH-1's `cn()`/`border-hairline` fix

## Context

AUTH-1 fixed a real bug in `cn()` (`src/shared/lib/utils.ts`) where `tailwind-merge` silently
dropped the custom `border-hairline` utility whenever combined with a `border-{color}` class —
breaking every `Button` `default`/`outline` variant's border app-wide, invisible until AUTH-1's
borderless OAuth buttons had nothing left to mask it. The fix is correct and global, but it also
changes Home Feed's already-shipped rendering (previously-invisible borders now show), which made
HF-10b's committed visual-regression baselines stale. Filed as this follow-up rather than blocking
AUTH-1 on it (see `client/docs/AUTH-1_LOGIN.md`).

## What was done

Same process as HF-12's original bootstrap:

1. User manually triggered the `client-ci` workflow's `update-baselines` dispatch on GitHub
   (Actions → `client-ci` → Run workflow → `update-baselines: true`, run on `master`).
2. Downloaded the resulting `visual-baselines` artifact (`visual-baselines.zip`).
3. Extracted and diffed against the currently-committed baselines first — confirmed all 9 files
   actually changed (not a no-op run): each new file is slightly larger than its predecessor,
   consistent with borders now being present pixels rather than invisible.
4. **Human visual check** (per this ticket's own note, not skipped): reviewed
   `home-feed-default-1280.png` and `home-feed-empty-375.png` directly. Borders render correctly
   on post cards, sport-switcher pills (including the dashed "Add sport" pill), upcoming-match
   cards, and CTA buttons — nothing looks broken or unintentionally changed beyond the expected
   border-visibility fix.
5. Replaced all 9 files in `client/e2e/visual/__screenshots__/` with the regenerated Linux
   baselines.

## Verification

Human visual review (above) substitutes for a local `pnpm test:visual` run here — per HF-12,
local Windows rendering is known to diverge from the Linux baselines regardless of correctness, so
the only real verification is (a) the CI run that produced these baselines was itself green against
the *real built app* (that's what `update-baselines` mode does — screenshots the actual page, not
just copies old ones), and (b) manual visual review confirming no unintended second change. Actual
regression-passing confirmation happens next time `client-ci`'s normal (non-dispatch) visual step
runs against these new baselines — expected to pass now, whereas it would have failed against the
old ones post-AUTH-1.
