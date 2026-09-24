# CLIENT-SESSION-32 · `DiscoverLocationFilter`'s popover is clipped by the modal's right edge at 375px

**Status:** `TODO`
**Type:** Bug Fix
**Depends on:** none
**Filed:** 2026-09-24, found while eyeballing the frames for `CLIENT-SESSION-31`'s Discover
visual-regression specs: the `discover-modal-location-popover-375` frame shows the popover's right
edge (the search input's border, the popover's own border/shadow) cut off. Not fixed there —
`CLIENT-SESSION-31` is test-only and its baseline for this state currently records the clipped
rendering.

## What's broken

Open `SessionDiscoverModal` ("Join a match") at a 375px-wide viewport and open the **Location**
filter. `DiscoverLocationFilter`'s `PopoverContent` is a fixed `w-72` (288px) with `align="start"`,
so it starts at the trigger's left edge (~72px into the dialog) and runs ~17px past the dialog's
right edge. `DialogContent` is `overflow-hidden` (`shared/ui/dialog.tsx`), and since
`CLIENT-SESSION-29` a Dialog-nested popover portals into that same Content node
(`shared/ui/floatingPortalContainer.ts`), so the overhang is clipped rather than escaping to
`<body>`. Result: the search box and popover border are visibly truncated.

Only the **Location** popover was confirmed clipped. The Time popover (`w-auto`) looked fine in the
same modal; the Status and Fee popovers (in the same filter row) were **not** checked and should be
at pickup — anything wider than the space to the right of its trigger will do the same.

## Fix direction (decide at pickup)

Radix `PopoverContent` already supports collision handling (`collisionPadding`, `avoidCollisions`);
this popover most likely needs a `collisionBoundary`/`collisionPadding` that is the dialog's own box,
or a width capped to the available space (`max-w-[calc(100vw-...)]`), rather than moving it back out
of the dialog (which would reintroduce the `FocusScope` bug `CLIENT-SESSION-29` fixed). Fix at the
shared `PopoverContent` if it generalizes, not as a one-off on this filter.

## Tests

The `discover-modal-location-popover-{375,768,1280}` baselines from `CLIENT-SESSION-31` will change
at 375 (and this ticket owns regenerating them via the `update-baselines` dispatch). Add a
real-browser e2e assertion that the popover's bounding box lies within the dialog's at 375px —
jsdom can't measure this.

**Out of scope:** the Escape-closes-the-whole-modal bug (`CLIENT-SESSION-27`).
