# SPORT-5 · Refresh the sport catalogue on "Add sport", and say so when there is nothing to add

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** none (`SPORT-3` shipped the live
catalogue fetch this builds on) ·
**Filed:** 2026-08-23 — raised at the end of `CLIENT-MODAL-1`'s pickup. Deliberately **not** folded
into that ticket (user decision): CLIENT-MODAL-1 is a bug fix about mutation-error lifecycle, and
this is data freshness plus empty-state UX. Two concerns, two tickets, one queue.

Two related problems with the "Add sport" pill, both about what the user is told when they click it.

## 1. The catalogue is not re-read at click time

`useSportCatalog` (`SPORT-3`) fetches `GET /api/sports`, and each page derives `availableSports` from
it as *catalogue minus profiles already held*. A sport an admin activates mid-session can therefore
be missing from the picker until something happens to refetch.

**Be precise about how stale this actually is, because the obvious framing overstates it.**
`main.tsx:8` constructs `new QueryClient()` with **no defaults**, so TanStack Query v5's
`staleTime: 0` applies: the catalogue query already refetches on mount and on window focus. It is not
a long-lived cache. The narrow, real gap is that **nothing refetches at the moment of the click**, so
a session that stays mounted and never loses focus keeps serving whatever it last saw.

Note also that `sportCatalogStore` (Zustand) is **not** the source here. It is a synchronous mirror
that `AppShell` writes for non-hook access (`sportIdForKey`/`sportKeyForId`); the pages read the
query. A fix aimed at the store would miss.

Proposed shape: refetch (or `invalidateQueries` on `sportCatalogQueryKey`) when the pill is clicked,
then decide what to open once the result lands. Which means the pill needs a pending state — see the
open questions.

## 2. Two different "nothing to add" states, only one of which is silent

| State | Today |
|---|---|
| At the 3-profile cap (`atCap` in `SportSwitcher`) | Pill renders `aria-disabled`, the click handler early-returns. **Completely silent** apart from a `title` tooltip, which is invisible to touch users and to keyboard users who never hover. |
| Under the cap, but every catalogue sport already held | `AddSportModal` opens and `AddSportFields` renders "You already have a profile for every sport SportHub supports right now." |

The second case is *not* silent — it already explains itself, just inside the modal. Worth knowing
before "add a message" gets scoped as if nothing exists.

**Decided at filing:** both states should produce a visible, consistent response — clicking "Add
sport" always results in something appearing. A dedicated dialog for "you have added every sport
available", shown for both cases, rather than one path opening a modal-with-a-message and the other
doing nothing.

## Open questions for pickup

1. **What does the pill do while the refetch is in flight?** A spinner on the pill, an immediately
   opened modal with a loading state, or optimistically open on cached data and correct afterwards.
   The last is worst — it can flash a picker that then empties.
2. **What if the refetch fails?** Falling back to cached `availableSports` is probably right (better
   a possibly-stale picker than a dead button), but it must not silently claim "you have every
   sport" on a network error — that would be a wrong statement, not just a stale one.
3. **Does the 3-cap message differ from the catalogue-exhausted message?** They are different facts:
   "you have reached the limit of 3" versus "there are no more sports to add". Same dialog with
   different copy is likely right; confirm at pickup.
4. **Does `maxSports = 3` stay hardcoded?** It is a `SportSwitcher` prop default today. If the cap is
   really a product rule, the dialog copy should not hardcode "3" separately from it.
5. Should the same refetch apply to the **nested** zero-sport-profile gates inside
   `CreateSessionModal` / `SessionDiscoverModal`? They render the same add-sport affordance from the
   same `availableSports` (see CLIENT-MODAL-1's audit), so the staleness applies there too.

## Out of scope

- Any change to `GET /api/sports` or to how the backend marks a sport active (`A6`'s active-only
  filtering is the contract; this ticket consumes it).
- The 3-profile cap itself — this ticket explains the cap, it does not change it.
- `sportCatalogStore`'s mirroring behaviour, which is a separate concern from the picker's freshness.
- Real-time push of catalogue changes. Refetch-on-click is the scope; a websocket/notification for
  "a new sport was activated" is a much larger idea and is not implied here.

## Tests

- A Vitest/RTL test that the pill triggers a catalogue refetch before the picker opens — assert on
  the second `GET /sports`, not just on the rendered result, or a cached render passes it falsely.
- A test that a sport activated *after* initial load appears in the picker on the next click.
- One test per empty state: at-cap and catalogue-exhausted both surface the dialog.
- A refetch-failure test asserting the fallback does **not** claim the user has every sport.
- Storybook: the new dialog is a new visual state and needs a story. Both copy variants if question 3
  resolves to two.
- E2E: `feed-groups-journey.spec.ts` already drives the zero-profile fixture and the "Add sport" pill
  (see CLIENT-MODAL-1's cases there), so it is the natural host. `E2E_OVERVIEW.md` §3 + §6 need
  updating if a spec is added or materially changed.
