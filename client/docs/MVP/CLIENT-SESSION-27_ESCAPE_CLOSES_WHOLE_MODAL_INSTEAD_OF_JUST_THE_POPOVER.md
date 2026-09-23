# CLIENT-SESSION-27 · Escape closes the whole `SessionDiscoverModal` instead of just the open filter popover

**Status:** `TODO` · **Type:** Bug Fix · **Depends on:** none ·
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
