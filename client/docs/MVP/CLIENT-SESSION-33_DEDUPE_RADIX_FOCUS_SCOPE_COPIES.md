# CLIENT-SESSION-33 · Two installed copies of `@radix-ui/react-focus-scope` (Dialog vs Popover) — dedupe, then re-evaluate the portal workaround

**Status:** `TODO`
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
