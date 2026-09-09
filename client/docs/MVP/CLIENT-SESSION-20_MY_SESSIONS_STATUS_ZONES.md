# CLIENT-SESSION-20 · "My sessions" — split active vs. history into two status zones

**Status:** `DONE` (2026-09-09)
**Type:** UX fix
**Filed:** 2026-09-09, from a live-env observation (user): a *completed* session sits at the top of
"My sessions" today, above the live/upcoming ones.
**Depends on:** nothing. Queue position not a user decision — filed IN PROGRESS and built the same
session it was raised.

## The problem

`groupSessionsByDate` (Matches page "My sessions" panel, CLIENT-SESSION-6) splits sessions into
**date** zones — today-and-future vs. before-today — and, *within a calendar day*, sorts purely by
`scheduledStart` ascending, **mixing all statuses**. So on "Today", a `COMPLETED` 10:00 session
sorts above an `ONGOING`/`SCHEDULED` 11:00 session, i.e. a finished session is at the top of the
panel. The current module doc calls this intentional ("folding Scheduled/Ongoing in alongside
Completed/Cancelled … regardless of zone").

## The new sort strategy (user decision 2026-09-09)

Split by **status**, not by date. Two zones, each grouped by calendar day of `scheduledStart`:

1. **Active zone** — `SCHEDULED` + `ONGOING` sessions. Date groups **ascending** (soonest day
   first). Renders on top.
2. **History zone** — `COMPLETED` + `CANCELLED` sessions. Date groups **descending** (most-recent
   day first). Renders below the active zone.

Within a day: **active zone ascending** by start time, **history zone descending** by start time
(user decision — the whole history zone reads newest → oldest top to bottom).

Consequence, and the exact case this ticket exists for: **the same calendar day can appear in
both zones** — a "Today" group up top for its Scheduled/Ongoing sessions, and a separate "Today"
group further down for its Completed/Cancelled ones. **No zone divider / section header** (user
decision) — just the existing per-day collapsible headers.

## Scope

- `src/features/session/groupSessionsByDate.ts` — rewrite `groupSessionsByDate`. `SessionDateGroup`
  gains `zone: 'active' | 'history'`; `dateKey` becomes the composite `${zone}:${yyyy-MM-dd}` (it's
  the collapse-state identity, consumed opaquely — a day in two zones needs two keys). `dateLabel`
  unchanged (`"Today"` / `"MMM d, yyyy"` — now legitimately repeats).
- `groupSessionsByDate.test.ts` — rewrite the `groupSessionsByDate` describe block for the
  status-zone model (the date-zone cases no longer hold); add the both-zones-same-day case and
  per-status routing (`ONGOING` → active, `CANCELLED` → history).
- No change to `SessionDateGroup.tsx` / `MatchesPage.tsx` (`dateKey` is opaque there) beyond
  whatever a `key`/type tweak needs.

## Out of scope

- Zone section headers / dividers.
- Any change to *which* sessions appear in "My sessions" (`useMySessions` / `useJoinedSessions` /
  group sessions — unchanged).
- Discover panel ordering.
- A stale `SCHEDULED` session with a past date (backend status-derivation lag) lands in the active
  zone at the top under "dates ascending" — accepted as-is; not special-cased.

## Tests

Vitest: the rewritten `groupSessionsByDate.test.ts`. `MatchesPage` has no RTL test; the Matches
e2e (`matches-journey.spec.ts`) asserts session presence, not per-day order — check it still
passes and add an ordering assertion only if it's cheap.

---

## Implementation (2026-09-09)

### As built — matches the plan

- **`groupSessionsByDate.ts`** — bucket every session into `activeByDate` / `historyByDate` by
  `ACTIVE_STATUSES = {SCHEDULED, ONGOING}` (everything else is history). Then emit the active
  groups (date keys `localeCompare` asc, each day's sessions asc by `scheduledStart`) followed by
  the history groups (date keys desc, each day's sessions desc). `SessionDateGroup` gains
  `zone: 'active' | 'history'` and its `dateKey` is now `${zone}:${yyyy-MM-dd}`; `dateLabel`
  is unchanged (so `"Today"` can appear twice). `SessionZone` exported.
- **`SessionDateGroup.tsx`** — the props type was `extends SessionDateGroup` (the data type);
  narrowed to `Pick<…, 'dateKey' | 'dateLabel' | 'sessions'>` since the component never renders
  `zone` and `MatchesPage` passes props individually (not spread). No render change — `dateKey`
  is still an opaque collapse-state identity, now zone-qualified so a two-zone day collapses
  independently. No `MatchesPage` change.
- **`groupSessionsByDate.test.ts`** — the `groupSessionsByDate` describe block rewritten for the
  status-zone model (7 cases incl. per-status routing, within-zone ordering both directions, the
  whole-active-above-whole-history case, and **the same calendar day in both zones**).
- **`useMatchesPageData.test.tsx`** — the "merges … into date groups, sorted descending" case
  became "… into status zones — active (asc) above history (desc)": id 1 (`SCHEDULED`) + id 2
  (`ONGOING`) → `active:2026-08-01` / `active:2026-08-05`; id 3 (`COMPLETED`) → `history:2026-07-20`.
  Group-name enrichment assertions moved to the group they now land in.

### Verification

- `tsc -b` + `eslint` clean.
- Vitest: `groupSessionsByDate.test.ts` (13), `useMatchesPageData.test.tsx`, `MatchesPage.test.tsx`
  green; **full suite 164 files / 1157 passed, 0 failures**.
- e2e: `matches-journey.spec.ts` green (asserts presence, not per-day order — unchanged).
- **Live** (real dev env, HMR): "My sessions" now shows an active zone on top (`Today` Ongoing/
  Scheduled, then `Sep 10` Scheduled), then a history zone below (`Today` Completed×4, `Sep 8`,
  `Sep 7`, … dates descending). Two "Today" headers, active above history — exactly as specced.
