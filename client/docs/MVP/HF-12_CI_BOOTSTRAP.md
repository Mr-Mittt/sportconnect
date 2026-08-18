# HF-12 · CI bootstrap + first green run — summary

**Ticket:** HF-12 (`client/docs/BACKLOG_MVP.md` #14b, follow-up from HF-9 item 7)
**Date:** 2026-07-08
**Status:** DONE — `client-ci` is live with a fully green run on Linux baselines.

## What happened (the bootstrap, as executed)

1. **First push of the repo's uncommitted work** — three commits: backend user/group-spaces WIP
   (made compilable: stale `GroupControllerTest` mock fixed for the new `getPublicGroups`
   signature/return type), the complete SportHub client rebuild (HF-00..HF-9), and the CI/infra
   work. *Process note, recorded honestly: these landed on `master` directly by mistake —
   `git branch` creates without switching, so commits were made on master and a bare `git push`
   sent them up, bypassing the intended PR. Subsequent pushes used real branches + PRs.*
2. **First CI runs caught a real bug** — every `@/shared/lib/*` import failed with TS2307 on CI
   only: root `.gitignore`'s `**/lib` (meant for Java build dirs) had silently excluded
   `client/src/shared/lib/` from version control since HF-1. Local runs passed off the working
   tree; CI's fresh checkout was missing 7 files. Fixed with a scoped negation
   (`!client/src/shared/lib`) + committing the files. This alone justified the CI ticket.
3. **Expected visual failure confirmed** — with the code fixed, exactly the 9 visual tests
   failed (Windows-rendered baselines vs Linux runner), everything else green.
4. **Linux baseline swap** — `update-baselines` workflow dispatch → `visual-baselines` artifact
   → 9 PNGs reviewed (frozen-clock timestamps, all states/breakpoints correct) → committed via
   branch `linux-visual-baselines` (PR #2) → **fully green `client-ci` run → merged**.

## Standing outcomes

- **CI is live and green**: every PR/push touching `client/**` runs lint, `tsc -b`, 56 unit
  tests, 9 e2e tests (incl. the a11y gate), and 9 visual diffs on `ubuntu-latest`.
- **Baselines are Linux-rendered** — CI is the authoritative visual-diff environment; local
  Windows `pnpm test:visual` will report false diffs (use `--update-snapshots` locally only to
  *preview* changes; committed baselines come from the dispatch artifact).
- **Branch protection is unavailable** — GitHub Free plan + private repo. The check reports
  red/green but cannot physically block merges or direct pushes. Hard enforcement = make the
  repo public or upgrade the plan (owner's call, out of scope). Until then a red `client-ci` is
  merge-blocking **by convention**.
- HF-9's checklist item 7 ("HF-11's E2E journey passes in CI") is now **verified** — the Home
  Feed epic's release condition is met.

---

### HF-12 · CI bootstrap + first green run — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-08) · **Type:** Infrastructure (ops) · **Dependency:** HF-10b, HF-9 ·
**Summary:** `client/docs/HF-12_CI_BOOTSTRAP.md`

Executed: work pushed, first `client-ci` runs surfaced and fixed a real bug (root `.gitignore`'s
`**/lib` had swallowed `client/src/shared/lib` — CI-only TS2307s), `update-baselines` dispatch →
Linux baselines committed via PR #2 → **fully green run, merged**. HF-9's item 7 is resolved.

**Deltas:**
- **Branch protection is NOT available** (GitHub Free + private repo) — `client-ci` runs on every
  PR/push and reports red/green, but nothing physically blocks merging on red. Hard enforcement
  requires making the repo public or upgrading the plan. Until then: a red check is
  merge-blocking by convention.
- Baselines are now **Linux-rendered**: local Windows `pnpm test:visual` will show diffs — CI is
  the authoritative visual environment (working model in HF-10b's summary).
- Root `.gitignore` has a scoped negation keeping `client/src/shared/lib` tracked — don't
  "clean up" the `!client/src/shared/lib` lines.
