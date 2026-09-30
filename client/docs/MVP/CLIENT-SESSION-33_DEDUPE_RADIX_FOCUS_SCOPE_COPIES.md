# CLIENT-SESSION-33 · Two installed copies of `@radix-ui/react-focus-scope` (Dialog vs Popover) — dedupe, then re-evaluate the portal workaround

**Status:** `DONE` (2026-09-30)
**Type:** Tech Debt / Bug Prevention
**Depends on:** none
**Filed:** 2026-09-24, found while root-causing `CLIENT-SESSION-27`. That ticket's Escape bug turned
out to be two installed copies of `@radix-ui/react-dismissable-layer` (module-level layer stack
duplicated), fixed with a `pnpm.overrides` entry. The same duplication exists for `focus-scope` and
was deliberately left out of that change (out of scope, and it could regress `CLIENT-SESSION-29`'s fix).

## What's wrong

Resolved in `client/pnpm-lock.yaml` / `node_modules/.pnpm` on 2026-09-24:

| Radix package | `react-focus-scope` copy |
|---|---|
| `react-dialog` 1.1.19 | 1.1.12 |
| `react-menu` 2.1.20 (DropdownMenu) | 1.1.12 |
| `react-popover` 1.1.23 | **1.1.16** |

`FocusScope` keeps a module-level `focusScopesStack` (so a nested trapped scope pauses its parent).
With two copies, a Popover's scope and its parent Dialog's scope are not in the same stack, so the
Dialog's trap never pauses while the Popover is open — a plausible contributor to the
"focus is yanked back into the Dialog" family (`CLIENT-SESSION-28`/`29`), which was worked around by
portaling a Dialog-nested Popover *into* the Dialog's Content node
(`shared/ui/floatingPortalContainer.ts`) and ignoring focus landing on the Dialog container
(`shared/ui/popover.tsx`). That workaround works and is left in place.

## Scope

- Add `@radix-ui/react-focus-scope` to `pnpm.overrides` (same mechanism as dismissable-layer) so one
  copy is installed; verify with `ls node_modules/.pnpm | grep focus-scope` and per-package `readlink`.
- Run the full `pnpm e2e` — the CLIENT-SESSION-28/29 popover-focus tests in `home-feed-journey.spec.ts`
  are the ones that matter most.
- Then decide, with evidence, whether `floatingPortalContainer.ts` and the `onFocusOutside` guard in
  `popover.tsx` are still needed (they may be; do not delete them on a hunch — remove only if the
  tests still pass with them gone *and* a real-browser walk of the Time/Location filters agrees).
- Consider a guard against re-splitting: e.g. a tiny check that fails CI when `node_modules/.pnpm`
  holds more than one copy of a Radix package that owns module-level state
  (`dismissable-layer`, `focus-scope`, `focus-guards`, `portal`, `presence`).

## Explicitly out of scope

- Any change to `react-dismissable-layer` (done in `CLIENT-SESSION-27`).
- Restyling or behavior changes of any Dialog/Popover.

## Scope decisions (2026-09-30, `/workon` pickup, user decision)

- Pin `@radix-ui/react-focus-scope` to the newest installed copy (**1.1.16**), same convention as the
  `dismissable-layer` override.
- The re-split guard covers only `dismissable-layer`, `focus-scope` and `focus-guards` (the packages
  verified to hold shared module-level state). `portal` / `presence` are *not* guarded or deduped here.
- The `floatingPortalContainer.ts` / `onFocusOutside` workaround is removed only if the
  CLIENT-SESSION-28/29 e2e pass without it, the full e2e is green, *and* a real-browser walk of the
  Time/Location filters agrees; otherwise it stays and the evidence is recorded here.
- Full `pnpm e2e` run for this ticket (dependency-graph change reaches every Dialog/Popover/Menu).

## Implementation summary (2026-09-30)

**Approved design:** pin `@radix-ui/react-focus-scope` to 1.1.16 in `pnpm.overrides`; add a re-split guard
for the packages with shared module-level state; re-test the portal workaround on the single copy and remove it
only if e2e, full e2e and a browser walk all agree; full `pnpm e2e`.

**Built**
- `package.json`: `pnpm.overrides` gains `react-focus-scope: 1.1.16` **and `react-focus-guards: 1.1.6`**. The
  latter was not in the filed scope: `focus-guards` holds module-level `count`/`guards` state and was also split
  (1.1.4 + 1.1.6), so the approved guard would have failed on day one without it (user-approved at the plan gate).
  `pnpm-lock.yaml` now resolves exactly one version of each of the three.
- `src/test/radixSingleCopy.test.ts` (new, 3 cases): reads `pnpm-lock.yaml` (not `node_modules/.pnpm`, which held a
  stale `dismissable-layer` 1.1.15 directory the lockfile no longer resolves) and asserts one resolved version per
  package, with a message naming the package, versions and fix. Verified to pass with the overrides and to fail
  (naming `focus-scope` 1.1.12/1.1.16 and `focus-guards`) against the pre-change lockfile.
- `shared/ui/floatingPortalContainer.ts`: doc comment updated (no longer "deliberately left alone").

**Portal workaround: kept.** Throwaway stub of `popover.tsx` (portal container -> default, `onFocusOutside` guard
disabled) on the single copy, run against `home-feed-journey.spec.ts`: the Escape-cascade test (line 364) and the
`@ 320px` inside-the-dialog test fail (output was truncated at 30 lines, so the full failing count was not
recorded). The stub was reverted; no browser walk needed since the e2e evidence already says keep. The portal is
therefore not a duplication workaround — it keeps the popover a real DOM descendant of the Dialog's Content.

**Not done, by decision:** `react-portal` (1.1.13 + 1.1.17) and `react-presence` (1.1.7/1.1.8/1.1.10) remain multi-copy
— stateless, so neither deduped nor guarded.

**Diverged from the plan:** only the `focus-guards` addition above.

**Consumer census:** package-graph change only; no source API, hook, store or DTO touched. Dialog/Menu/Popover/Select
wrappers in `shared/ui` compatible as-is, verified by the full e2e.
**Localization:** no user-visible text.
**Tests:** tsc/eslint clean; new guard test + `src/shared/ui` Vitest files green (scoped).
**E2E:** full `e2e` project — 103 passed. A first full run right after `pnpm install` (cold Vite dep re-optimization)
had 8 failures, all in `a11y.spec.ts`; that spec passed 32/32 in isolation and the clean re-run of the full project
was 103/103, so treated as a first-run flake, not a regression. `E2E_OVERVIEW.md` unchanged (no spec added/changed).
**Visual-regression expectation:** no baselined surface touched — no baseline change expected; a failing
`visual-regression` run is the Windows noise floor, not a regression. Not run locally.
