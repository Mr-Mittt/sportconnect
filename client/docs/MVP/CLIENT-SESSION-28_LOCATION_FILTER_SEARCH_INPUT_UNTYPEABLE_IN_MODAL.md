# CLIENT-SESSION-28 · `DiscoverLocationFilter`'s search input can't be typed into inside `SessionDiscoverModal`

**Status:** `SUPERSEDED` (2026-09-23, by CLIENT-SESSION-29)

**Superseded 2026-09-23 (user decision, at CLIENT-SESSION-29's filing):** CLIENT-SESSION-29's
Location filter redesign drops the search box this bug lives in entirely, replacing it with a
"Choose a location" flow — this fix is moot once that ships. No further action needed on this
ticket.
**Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-09-22, found live while adding e2e regression coverage for `CLIENT-SESSION-22`'s
pointer-events fix (`DiscoverTimeFilter`'s Before/After buttons being unclickable inside
`SessionDiscoverModal` — see that ticket's Delta section, and `CLIENT-SESSION-27` for a sibling
finding from the same investigation). Same root-cause family (a `Popover` portaled outside the
`Dialog` it's nested in), a third distinct Radix subsystem.

## What's broken

Open `SessionDiscoverModal`, open the Location filter, click into its "Search locations…" text
input, and try to type. Expected: normal typing. Actual: the click focuses the input for at most an
instant — `document.activeElement` right after the click is already back on some other element
inside the `Dialog`, not the input — so keystrokes land nowhere useful and the field never fills in.

**Root cause (established, not yet fixed):** `Dialog`'s `modal=true` (default) enables a
`FocusScope` that actively traps focus inside the Dialog's own DOM subtree — any focus event
landing outside that subtree gets redirected back inside. Since `Popover`'s portaled content
(including this search input) lives outside `Dialog`'s content DOM subtree (a sibling under
`document.body`, not a descendant — see `CLIENT-SESSION-22`'s pointer-events fix and
`CLIENT-SESSION-27` for the same structural fact hitting two other subsystems), focusing that input
looks to the Dialog's `FocusScope` like "focus escaped the boundary," and it's yanked back inside.

**Unlike the two related bugs, this one blocks more than clicking** — `DiscoverTimeFilter`'s
Before/After (plain buttons, fixed) and even a `DiscoverLocationFilter` favorite-location checkbox
click still work today (a click's mousedown/mouseup/click sequence completes and fires `onClick`
regardless of where focus lands afterward), but sustained typing genuinely cannot work while focus
keeps getting redirected away from the input on every keystroke-driven refocus cycle.

**Likely fix direction (not yet designed):** something in Radix `FocusScope`'s trap boundary needs
to treat the Popover's portaled content as "inside" the Dialog's boundary despite the DOM structure
— e.g. via `container`/`asChild` composition changes, or Radix's own escape hatches for exactly this
nested-portal case if one exists in the installed version (`@radix-ui/react-dialog` 1.1.19,
`@radix-ui/react-popover` 1.1.23 as of filing). Needs real investigation, not a guess — same
"root-cause first" bar the pointer-events fix used.

**Who:** Any user with `SessionDiscoverModal` open, on a specific sport pill (Location filter is
disabled entirely on the "all" pill), trying to search for a location by name rather than picking a
pre-favorited one.

**Entry point:** "Join a match" (rail empty state) → a specific sport pill selected → Location
filter → click the search input → type.

## Explicitly out of scope

- The Escape-cascades-to-the-whole-Dialog bug — filed separately as **CLIENT-SESSION-27**.
- Checkbox/button clicks inside the Location filter's popover (favorites list, "Remove" chip
  button) — already working (confirmed live during this same investigation), unaffected by this bug.

## Tests

Playwright e2e (real browser — jsdom can't reproduce Radix `FocusScope`/portal focus-trap
interactions any more than it could reproduce the pointer-events bug): open `SessionDiscoverModal`
on a specific sport pill, open the Location filter, click the search input, type a query, assert the
input's value actually reflects what was typed and the matching result renders.

---
