# CLIENT-SESSION-27 · Escape closes the whole `SessionDiscoverModal` instead of just the open filter popover

**Status:** `DONE` (2026-09-24) · **Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-09-22, found live while adding e2e regression coverage for `CLIENT-SESSION-22`'s
pointer-events fix (`DiscoverTimeFilter`'s Before/After buttons being unclickable inside
`SessionDiscoverModal` — see that ticket's Delta section). Same root-cause family, different Radix
subsystem — not fixed as part of that change.

## What's broken

Open `SessionDiscoverModal` (the rail's "Join a match" entry point), open either the Time or
Location filter's `Popover`, then press Escape. Expected: only the popover closes (standard
single-layer dismiss). Actual: the whole `Dialog` closes too, taking the caller back out of the
modal entirely.

**Root cause (established, not yet fixed):** `Popover`'s content (`shared/ui/popover.tsx`) is
portaled to `document.body` — a *sibling* of `Dialog`'s own content node, not a descendant of it.
Radix's `DismissableLayer`/Escape-key handling is meant to let only the top-most open layer respond
to Escape, but that layer-stack recognition apparently doesn't correctly account for a Popover
portaled outside its parent Dialog's DOM subtree, so both layers' Escape handlers fire.

**Not the same fix as the pointer-events bug** (`shared/ui/popover.tsx`'s `pointer-events-auto`,
already shipped): that was a pure CSS cascade problem. This is Radix's own Escape-key/dismissable-
layer JS logic — needs its own investigation (likely something in the
`onEscapeKeyDown`/`DismissableLayer.Branch` area of `@radix-ui/react-popover`/`@radix-ui/react-
dialog`, or explicitly stopping propagation of the Escape `keydown` at the Popover's own layer).

**Who:** Any user with `SessionDiscoverModal` open and a filter popover open inside it (Home Feed,
Groups, Friends, Profile rails).

**Entry point:** "Join a match" (rail empty state) → open Time or Location filter → press Escape.

## Explicitly out of scope

- The Location-filter focus-trap bug (typing into the search input doesn't stick) — filed
  separately as **CLIENT-SESSION-28**, a related but distinct Radix subsystem (`FocusScope`, not
  `DismissableLayer`).
- Any change to `Dialog`'s own standalone Escape behavior (with no nested Popover open) — unaffected,
  out of scope.

## Tests

Playwright e2e (real browser — this class of bug isn't reproducible in jsdom, same reasoning as
`CLIENT-SESSION-22`'s pointer-events fix): open `SessionDiscoverModal`, open the Time filter, press
Escape, assert the Time popover is closed **and** `SessionDiscoverModal`'s own dialog is still open.

---

## Implementation summary (2026-09-24)

### Root cause — the filed diagnosis was wrong

The ticket blamed a Popover portaled outside its Dialog's DOM subtree not being recognised by
`DismissableLayer`'s layer stack. That is not how the stack works (it is a plain `Set` of nodes in a
context, with no DOM-containment check) — and after CLIENT-SESSION-29 the popover is a DOM descendant of the
Dialog's Content anyway. The real cause was the **dependency graph**: two copies of
`@radix-ui/react-dismissable-layer` were installed.

| Radix package | resolved `react-dismissable-layer` |
|---|---|
| `react-dialog` 1.1.19 | 1.1.15 |
| `react-menu` 2.1.20 (DropdownMenu) | 1.1.15 |
| `react-popover` 1.1.23 | 1.1.19 |

`DismissableLayerContext` is created at module scope and used via its default value (no Provider), so each
installed copy owns its own `layers` Set. The Dialog was alone in one stack and the Popover alone in the other;
each computed `isHighestLayer === true` and registered its own `document` `keydown` (capture) Escape listener, so
one Escape dismissed both. Confirmed by reading the installed source + per-package `readlink` of the resolution,
then by the new e2e failing before the fix and passing after it.

### Approved design (as built — no divergence)

1. e2e regression test first, watched failing (dialog gone after the first Escape).
2. `client/package.json` `pnpm.overrides`: `"@radix-ui/react-dismissable-layer": "1.1.19"`; `pnpm install` →
   lockfile drops the 1.1.15 entry; dialog/popover/menu now all resolve the one copy. No component code changed.
3. Stale "CLIENT-SESSION-27 open" comments corrected (`floatingPortalContainer.ts`, both `e2e/visual/app-discover-*`
   specs, `E2E_OVERVIEW.md`), new catalog row + Related-docs entry in `E2E_OVERVIEW.md`.

Rejected: `stopPropagation` in the Popover's Escape handler (the Dialog's listener was registered first on the
same `document` capture phase — cannot stop it); a Dialog-side `onEscapeKeyDown` guard that looks for an open
popover (works, but leaves the duplicate in place — was the fallback, not needed).

### What was built

- `client/package.json` + `client/pnpm-lock.yaml` — the override.
- `e2e/flows/home-feed-journey.spec.ts` — new test: "Escape closes only the open Time/Location popover, then a
  second Escape closes the \"Join a match\" modal" (Time popover → Escape → popover gone, dialog visible; Location
  popover → same; Escape with no popover open → dialog closes).
- Comment/doc updates above.

### Key decisions / constraints

- The regression is a **dependency-graph** one: any future install that re-splits the copies (a Radix bump whose
  ranges no longer satisfy 1.1.19, or a removed override) fails the new e2e test.
- `@radix-ui/react-focus-scope` has the same split-copy duplication (Dialog/Menu 1.1.12, Popover 1.1.16). Deliberately
  **not** folded in (out of scope; CLIENT-SESSION-29's portal workaround makes it harmless today and a change could
  regress it) — filed as **CLIENT-SESSION-33** (client backlog).
- Consumer census: no API/DTO/type contract touched. Consumers of the change are every Radix Dialog / DropdownMenu /
  Popover surface (they move from dismissable-layer 1.1.15 to 1.1.19) — all **compatible as-is**, evidenced by the
  full e2e run below.

### Verification

- `tsc -b` clean; eslint clean on the touched files + `src/shared/ui`.
- Vitest, **scoped** (`src/shared/ui`, `features/{session,notifications,friends,chat}`): 52 files / 529 tests green.
  Full Vitest suite not run.
- **E2E:** `e2e` project **88 passed** (87 existing + the new one). The first run right after `pnpm install` failed all
  5 tests in `home-feed-journey.spec.ts`, including three untouched ones; the same tests passed in isolation and on an
  immediate re-run (Vite dependency re-optimisation on a cold cache is the likely reason — inferred, not proven by a
  log). The full-suite run afterwards was clean.
- **Visual-regression expectation:** no baselined surface touched and no visual code changed — no baseline change
  expected; a failing `visual-regression` run on this Windows host would be the documented noise floor, not a regression.
  The project was **not run** for this ticket.
- Real backend: not applicable — no endpoint or hook changed.
