# SESSION-37 · `/discover`'s `date` becomes an open-ended lower bound, drop `ONGOING`, smart today/future time floor

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** SESSION-35 (`DONE`) — changes the exact `date` semantics that ticket just shipped
**Filed:** 2026-09-18, user request following SESSION-35's implementation and merge — a real
follow-up refinement to the `date`-required contract SESSION-35 just introduced, not a bug in it.

SESSION-35 made `/discover`'s `date` a required param matching *exactly* one calendar day
(`[dayStart, dayEnd)`). This ticket changes `date` from an exact-day match into an **inclusive
lower bound** — sessions from `date` onward, open-ended (no end date), paginated the normal
`page`/`size` way (the client calls `loadMore()` for the next page until it runs out of sessions).
`date` stays required (SESSION-35's requirement itself isn't reversed), but a single request can
now surface sessions across many days, not just one — much closer to the pre-SESSION-25 "browse
upcoming sessions" behavior, just with an explicit, caller-chosen starting point instead of an
implicit `now()`.

**Who/entry point:** Normal User, via `GET /api/sessions/discover` (Matches page's Discover panel
and the rail-triggered Discover modal, both CLIENT-SESSION-6 — this backend change is also the
likely fix for **CLIENT-SESSION-25**'s stopgap "today only" narrowing, since `date=today` under
this new model returns everything from today forward, not just today; worth re-checking
CLIENT-SESSION-25's scope once this ships, not decided here).

## Scope

1. **`status`: drop `ONGOING` from discoverable sessions.**
   - `ONGOING` is no longer part of the default status list (currently
     `PREPARING`/`SCHEDULED`/`ONGOING` → becomes `PREPARING`/`SCHEDULED`).
   - An explicit `status` list containing `ONGOING` does **not** 400 — `ONGOING` is silently
     stripped out of the list instead (never a validation error for this specific value, unlike a
     genuinely invalid one like `CANCELLED`, which still 400s).
   - If stripping `ONGOING` empties the list entirely (e.g. `status=ONGOING` alone), treat it the
     same as `status` being omitted — fall back to the default list (`PREPARING`/`SCHEDULED`), not
     an empty result.

2. **`date` becomes an inclusive lower bound, not an exact-day match.**
   - `scheduledStart >= <resolved instant for date>`, no upper bound — replaces SESSION-35's
     `[dayStart, dayEnd)` range entirely.
   - Still a required param (SESSION-35's requirement stands) — just no longer restricts to one day.
   - Normal pagination (`page`/`size`, the existing `Pageable`) — the client's "load more" pages
     forward through the open-ended result set exactly like every other listing endpoint already
     does, not a new response shape.

3. **Smart default time floor when `startTimeFilter`/`startTime` are omitted** (only applies when
   the caller doesn't explicitly set them — an explicit `startTimeFilter`/`startTime` still
   overrides, same optional-pair contract as today):
   - `date` resolves to **today** (in the resolved `viewerZoneId`, falling back to UTC per
     SESSION-35) → floor = the current server instant (`now()`, computed against the caller's
     resolved zone then compared as the same UTC instant already used everywhere else) — excludes
     sessions that already started earlier today.
   - `date` resolves to **any other day** (necessarily a future day, since `date` is a lower bound)
     → floor = `date`'s own start-of-day (00:00) — i.e. no additional restriction beyond the
     `date` bound itself for that first day.

## Open questions — resolve at pickup, don't guess

- **Exact interaction between the new implicit floor and an explicit `startTimeFilter`/`startTime`
  across an open-ended, multi-day result set.** Previously (SESSION-35, single exact day),
  `startTimeFilter` only ever needed to mean "this time-of-day, on this one day." Now that a
  request can span many days, does an explicit `startTimeFilter` mean "this time-of-day, every day
  in the open-ended range" (reverting to the pre-SESSION-35 semantics `startTimeFilter` originally
  had) — or something narrower? Needs a real decision before implementing, not assumed.
- Sort order interaction: the existing 3-level sort (`scheduledStart ASC`, open slots `ASC`,
  `createdAt ASC`) presumably still applies unchanged across the open-ended range, but confirm at
  pickup rather than assume, given how much else about `date` is changing.

## Out of scope

Any change to `/upcoming`'s or `/history`'s `date` params (both SESSION-35's own scope, both stay
an exact single-day match) — this ticket is `/discover`-only. Reversing SESSION-35's
"`date` is required" decision itself — that stays required, only its exact-day-vs-lower-bound
shape changes.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
