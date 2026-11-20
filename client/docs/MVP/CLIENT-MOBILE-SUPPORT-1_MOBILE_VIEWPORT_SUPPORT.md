# CLIENT-MOBILE-SUPPORT-1 · Mobile viewport support (standing collector)

**Status:** `TODO`
**Type:** Enhancement (standing collector, the same shape as `BASELINE-UPDATE-1`) · **Depends on:** none
**Filed:** 2026-11-20, raised by the owner while CLIENT-GROUP-SESSION-2 (the group Sessions tab) was built: the app is designed and checked at desktop widths (the visual specs run at 375, 768 and 1280, but a client ticket is built and eyeballed on a wide screen), so mobile-viewport problems are noticed one at a time and in passing. The owner's decision: **collect them here as they come up and solve them together later**; the first three points were given on the spot and are recorded **without investigation**.

## What this ticket is (standing ticket)

A list, not a piece of work to start now. Whenever someone implementing or reviewing a client ticket notices something that does not work or look right on a small screen (a horizontal scroll, a control that does not fit, a layout that wastes width), they add **one row** to the table below: the surface, the point, and the ticket they were in. A defect with its own functional impact stays its own ticket (as `CLIENT-SESSION-32` did for the Discover popover at 375px) and is only linked here.

**Before adding a row, check for a duplicate** (owner, 2026-11-20): read this table and the open client backlog for the same surface or the same point, and extend the existing row instead of adding a second one.

At pickup (`/workon client`), the first step is to decide the target widths (the visual specs use 375, 768 and 1280), then to investigate each collected point against them, fix them together, and add e2e and visual checks at the mobile widths. The baselines that change go into the open `BASELINE-UPDATE-<n>` ticket, as for any visual change.

## Collected points (add a row per point)

| # | Surface | Point (as the owner gave it; not investigated yet) | Found in |
|---|---|---|---|
| 1 | App shell: the main div under the root | Reduce the horizontal padding (`px`) of the main div under the root to 0.5, so there is more width on a small screen. | CLIENT-GROUP-SESSION-2 |
| 2 | Group page: the group tabs (`GroupTabs`) | Switch the tabs from the vertical list to a **horizontal row under the group banner**: the selected tab shows its icon and its label, the other tabs show the icon only. | CLIENT-GROUP-SESSION-2 |
| 3 | Main app navigator (`NavTabs`: Home, Groups, ...) | Adjust its margin and padding so it causes no horizontal scroll. | CLIENT-GROUP-SESSION-2 |

**Out of scope:** the native mobile app; fixing any point before the pickup decides the target widths; a point that needs its own functional change (file it separately and link it here).

**Tests (at pickup):** an e2e check at each target width that the page has no horizontal scroll and the changed controls are reachable by keyboard and touch-sized; new or changed visual baselines recorded in `BASELINE-UPDATE-<n>`; a Storybook story per changed state.
