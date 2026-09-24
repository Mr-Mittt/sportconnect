# CLIENT-SESSION-32 · `DiscoverLocationFilter`'s popover is clipped by the modal's right edge at 375px

**Status:** `DONE` (2026-09-24)
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

---

## Delta (2026-09-24, at pickup)

- **Status/Fee:** with the fix both stay inside the dialog at 375px and 320px (asserted by the new test). Whether they
  overhung *without* it was not established — the without-fix run stops at the first failing trigger (Location, 2nd of 4).
  The Time popover (`w-auto`) fits at 375px without the fix (it was asserted before Location failed) but **also overhangs at 320px** (34 + 274 = 308 > the 304px dialog interior), so the fix and the new test cover it.
- The ticket's guess at the mechanism was right: Radix Popper's boundary defaults to the *viewport* (an empty
  `collisionBoundary` list), not the dialog's `overflow-hidden` box.

## Implementation summary

### Approved design

Fix once in the shared `shared/ui/popover.tsx` `PopoverContent`, not per filter; keep the popover portaled inside the
Dialog (moving it out would reintroduce the `FocusScope` bug of CLIENT-SESSION-29); add a real-browser e2e assertion.

### What was built

- **`shared/ui/popover.tsx`**
  - `collisionBoundary={dialogContainer ?? undefined}` and `collisionPadding={dialogContainer !== null ? 8 : undefined}` —
    the Dialog's own Content node (already provided by `floatingPortalContainer`) becomes the collision boundary, so
    Radix shifts/flips the popover to stay inside it. `undefined` outside a Dialog = Radix defaults, so `NotificationBell`,
    `EmojiPickerButton` and the panel's `DiscoverDatePicker` are unchanged. Both props sit before `{...props}`, so a
    caller can still override.
  - Base class `max-w-[var(--radix-popover-content-available-width)]`: the fixed `w-*` shrinks instead of overhanging when
    even a shifted popover can't fit (320px). `cn()`/tailwind-merge lets a caller's own `max-w-*` win
    (`NotificationBell`'s `max-w-[calc(100vw-2rem)]` still does).
- **`e2e/flows/home-feed-journey.spec.ts`** — one test looped over 375px and 320px: for Time / Location / Status / Fee,
  open → poll until the popover's bounding box lies within the dialog's (±0.5px) → Escape → dialog still open.
- **Docs:** `E2E_OVERVIEW.md` (related-docs line + a §6 row), `PROGRESS.md`, backlog row moved to Done.

No filter component changed. No jsdom component test was added: collision geometry isn't observable there, so it would
only assert prop wiring.

### Divergence from the approved design

None. The vertical-flip risk named in the plan did not materialise: the other 11 modal frames (time/location popovers at
768/1280, time at 375, default/empty) render with identical pixel-diff counts with and without the change.

### Consumer census

`PopoverContent` importers: `SessionDiscoverModal`'s four filters — **updated in this change** (via the primitive);
`EmojiPickerButton`, `NotificationBell`, `DiscoverDatePicker` (panel) — not Dialog-nested, `dialogContainer` is `null` —
**compatible as-is** (panel visual spec: identical with/without the change, 48 lines of diff output compared).
No backend, DTO, enum or notification impact; no follow-up tickets.

### Verification

- `tsc -b` and eslint on the touched files: clean.
- **Unit:** scoped Vitest (`src/features/session/components`, `src/shared/ui`, `src/features/notifications`,
  `src/features/chat`) — 33 files / 358 tests passed. Full Vitest suite not run (scoped-tests rule).
- **E2E:** `e2e` project, scoped — the 2 new tests plus all of `home-feed-journey.spec.ts` and
  `notification-bell.spec.ts` (the only flow specs the diff-grep returned): **12 passed**. The new test was confirmed to
  **fail without the fix** at both widths (Location: popover x 87 + w 288 = 375 vs dialog right edge 359). Full `e2e`
  project not run. (Every Playwright run printed a libuv `UV_HANDLE_CLOSING` assertion at process teardown — Windows
  noise after the results, not a test failure.)
- **Visual-regression expectation:** baseline **`discover-modal-location-popover-375`** legitimately changes (the frame's
  clip no longer extends past the dialog: 359×540 → 343×540, popover fully inside with its right border) — expected to fail
  until the `update-baselines` GitHub dispatch regenerates exactly that file; every other baseline must come back
  byte-identical. Checked on this Windows host (where the whole project fails on the font-rendering noise floor) by
  running `app-discover-modal.spec.ts` and `app-discover-panel.spec.ts` with and without the `popover.tsx` change and
  diffing per-test pixel-diff counts: the **only** difference is the Location-375 frame (the size change); all other
  frames are identical.
- **Executed (2026-09-24, `/updatebaseline`):** the `update-baselines` dispatch's `visual-baselines` artifact (150 PNGs) was
  applied, SHA-256 confirmed **exactly the predicted 1 file changed** — `discover-modal-location-popover-375.png` — and the
  other **149 byte-identical** (0 NEW, 0 MISSING), so every other local Windows diff was pure noise floor. Human visual
  check of the CI frame: 343px wide, popover fully inside the dialog with its right border intact (Fee wraps to a second
  filter row under Linux font metrics — expected, not a regression). Committed as `cf40a8d`.
- **Manual walk:** the happy path was exercised by the Playwright tests in a real Chromium, and the new 375px frame
  was inspected by eye. No separate Vite-dev-server / live-backend session — no API contract is involved.
