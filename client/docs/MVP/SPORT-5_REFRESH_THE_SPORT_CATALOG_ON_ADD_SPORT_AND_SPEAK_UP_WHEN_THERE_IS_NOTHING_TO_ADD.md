# SPORT-5 · Refresh the sport catalogue on "Add sport", and say so when there is nothing to add

**Status:** `DONE` (2026-08-23) · **Type:** Enhancement · **Depends on:** none (`SPORT-3` shipped the live
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

---

## What was built

### Three corrections to this ticket, found in Phase 2

The ticket was written from the outside; reading the code changed the design. Recorded here
rather than silently designed around, because two of the open questions dissolved.

**1. The cap is the catalogue size, not 3.** Every page passes
`maxSports={sportCatalog.data.length || undefined}`. So `atCap` (profiles ≥ catalogue) is
**exactly equivalent** to `availableSports.length === 0`. The ticket's "two different empty
states" were **one state** reached by two code paths — which answered Q3 (two copy variants
for cap vs exhausted: not needed) and Q4 (don't hardcode 3: nothing hardcodes it) by
dissolving both.

**2. `AddSportFields`' existing "you already have a profile for every sport" message was
unreachable in the normal path — and wrong where it *was* reachable.** The pill disabled
first, so it never showed. It became reachable only when the catalogue was empty or failed
to load (`|| undefined` falls back to `maxSports = 3`, re-enabling the pill) — precisely the
case where claiming completeness is false. That pre-existing flaw is what shaped the
dialog's two states.

**3. There is a real 3-profile cap the client never surfaces.**
`UserSportProfileServiceImpl` enforces max 3 server-side (MSW mirrors it), but the client's
cap is the catalogue size — 2 today — so the backend cap is unreachable client-side and
would only bind if the catalogue grew past 3. Out of scope here; noted so nobody assumes
"at cap" client-side ever meant the product's 3-sport rule.

Also confirmed, ruling out a hypothesised failure: profiles never contain deactivated
sports (`findByUserIdAndIsActiveTrue` plus an `getActiveSportsByIds` filter drops them), so
the held-count can't be inflated past the catalogue.

### The approved design, as built

**Freshness.** `useSportCatalog` gained `refetch`. The pill's handler re-reads `GET /sports`
and *then* decides what to open. Nothing opens on cached data — opening optimistically and
correcting afterwards would let the picker appear and change under the user, which is the
bug being fixed.

**Never claiming completeness on a failure.** `refetch` resolves to the cached list when the
request fails, never an empty one. Only when the cached list is *also* empty does the dialog
switch to its unavailable state with a Retry. "You have every sport" after a network error
would be false, not stale — the distinction the whole component turns on.

**Reversing HF-2.** The pill is no longer `aria-disabled` at the cap; `aria-disabled` now
marks only the in-flight re-read. HF-2's disabled pill was correct about *state* and wrong
about *communication*: the one interaction a capped user attempts produced no response
beyond a hover `title`, invisible on touch and to keyboard users.

### Files

| File | Change |
|---|---|
| `useSportCatalog.ts` | new `refetch`, resolving to the cached list on failure |
| `useAddSportLauncher.ts` | **New.** Owns re-read → decide → open picker or dialog, plus retry |
| `NoSportsToAddDialog.tsx` | **New.** Two states: everything-held, catalogue-unavailable |
| `SportSwitcher.tsx` | Always fires `onAddSport`; new `isCheckingCatalog` pending state |
| `HomeFeedPage` / `GroupsPage` / `MatchesPage` | Pill wired to the launcher; dialog rendered |
| `useCreateSessionModalData` / `useDiscoverModalData` | Re-read the catalogue on modal open |

**The nested gates needed a different trigger.** `CreateSessionModal` and
`SessionDiscoverModal` embed `AddSportFields` directly and their `onAddSport` prop is the
*submit* handler, not a pill click — there is no click to intercept. Their refresh point is
therefore modal-open, fire-and-forget: the gate renders from cache immediately and updates
if the re-read brings something new. Safe there precisely because nothing is *hidden* by
being slightly late, unlike the pill's open-picker-or-dialog decision.

### Key decisions

**One shared hook, not three page copies.** The same re-read/decide/retry logic is needed
identically on three pages. `useAddSportLauncher` takes `heldSportKeys` and `onOpenPicker`
so each page keeps its own picker-opening quirks (`addSportOpenCount` remounts,
`addSportPromptMessage`) without duplicating the async decision.

**The dialog's split is availability, not cap-vs-exhausted.** See correction 1 — those are
the same state. The real question is whether we know the catalogue at all.

## Verification

| Check | Result |
|---|---|
| `pnpm exec tsc -b` | Pass |
| `pnpm lint` | 0 errors (2 pre-existing warnings in `SessionStartTimePicker`, untouched) |
| `pnpm test` | **934 passed / 136 files** |
| `pnpm e2e` | **65 passed** |

The freshness e2e case was confirmed to fail with the re-read reverted, then pass with it
restored. Storybook stories added for all three dialog states; **not visually reviewed** —
same standing gap recorded for ADMIN-2's and ADMIN-4's stories. No live-backend run: no
endpoint or contract changed, only when an existing one is called.

### Test fixtures this forced

Three existing test files needed `GET /sports` served that previously didn't, because the
pill now reads the catalogue on click:

- `HomeFeedPage.test.tsx` — added to the shared `staticGetResponse`. **Names must match the
  catalog store seeded in `src/test/setup.ts`**, since profile keys resolve through it: id 5
  is `Football` there, so returning `Soccer` made it look like a fourth, addable sport and
  opened the picker instead of the dialog.
- `useSessionModalResets.test.tsx` (CLIENT-MODAL-1) — its blanket page-shaped mock returned
  `{ content: [] }` for every URL, so the catalogue hook mapped over a non-array and threw.

### Assertions deliberately reversed

`SportSwitcher.test.tsx` and `home-feed-journey.spec.ts` step 7 both asserted
`aria-disabled="true"` at the cap, per HF-2. Both now assert the opposite plus the dialog.
This is a deliberate product reversal, not a regression — flagged before implementation and
approved.

## Deltas for later tickets

- **`useAddSportLauncher` is the entry point for any future "Add sport" surface.** A new page
  wiring the pill directly to `setIsAddSportOpen` would reintroduce both bugs.
- **The backend's real 3-profile cap is still unsurfaced client-side.** If the catalogue ever
  exceeds 3 sports, a user could reach the picker and be rejected by the server. Unfiled.
- **`AddSportFields`' own "you already have every sport" message is now dead in the normal
  path** — the launcher intercepts before the picker opens. Left in place as a backstop for
  any caller that renders the fields without going through the launcher (the nested gates
  do exactly that), but it is no longer the primary empty-state surface.
