# SESSION-25 · Server-side search + column filter on session discover

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** SESSION-24 (adds the `PREPARING` status this ticket's status filter includes)
**Filed:** 2026-09-14, user request — the "Join a match" modal (`SessionDiscoverModal`) and the
`/matches` session browser (`SessionDiscoverPanel`) need real search and filter functionality.
Today's only search is a client-side title/location substring filter over whatever single page
`GET /api/sessions/discover` already returned (CLIENT-SESSION-6/7), and the Date/Time/Location
filter pills sketched in CLIENT-SESSION-6's design export render but do nothing.

## Scope

New optional query params on `GET /api/sessions/discover`, AND-combined with each other and with
the existing `sportId` param:

- **`title`** (String) — case-insensitive substring match against `Session.title`. Replaces the
  client-side substring filter with a real server-side one, correct across the full result set
  rather than just the current page.
- **`locationId`** (Long) — exact match against `Session.locationId`.
- **`minOpenSlots`** (Integer) — a session qualifies when its remaining open slots
  (`capacity - participantCount - initialSlot`) minus `minOpenSlots` is `> 0`.
- **`feeType`** (`FeeType`) and/or **`maxFeeAmountVnd`** (Long) — `feeType` exact match;
  `maxFeeAmountVnd` upper-bounds `feeAmountVnd` (meaningful only when `feeType = FIXED`).
- **`date`** (LocalDate) — exact-day match against `scheduledStart`'s date component.
- **`startTimeFilter`** (enum: `BEFORE_OR_EQUAL` / `AFTER_OR_EQUAL`) + **`startTime`** (LocalTime)
  — compares `scheduledStart`'s time-of-day component against the given time. Independent of
  `date` — either can be used alone or together.
- **`status`** (`List<SessionStatus>`, restricted to `PREPARING`/`SCHEDULED`/`ONGOING`) — optional,
  default = all three. **This is a real behavior delta from SESSION-4's original decision**, which
  restricted `/discover` to `SCHEDULED` only ("once a session goes ONGOING it's no longer
  something to discover-and-join"). This ticket supersedes that: `ONGOING` becomes discoverable
  again by default, alongside the new `PREPARING`. Flag this explicitly to whoever reviews/tests
  this ticket — it's an intentional, user-requested change, not a regression.

**Default lower bound:** when neither `date` nor `startTimeFilter` narrows a lower bound,
`/discover` implicitly filters to `scheduledStart >= now()` — both server-side (this ticket) and
client-side as the panel/modal's initial filter state (**CLIENT-SESSION-22**), per the user's
explicit answer during scoping.

**Sort order:** replaces today's plain `scheduledStart ASC` `@PageableDefault` with a 3-level
order, applied on every `/discover` call regardless of which filters are set: `scheduledStart ASC`
→ remaining open slots `ASC` → `createdAt ASC`.

**Who:** Normal User — both existing client surfaces that consume `/discover` via
`useDiscoverModalData`.

**Entry point:** `GET /api/sessions/discover` (existing endpoint, extended — not a new one).

**Edge cases:**
- No filters passed → same response shape as today except the new default status list (all 3),
  the `now()` lower bound, and the new 3-level sort.
- A filter combination matching nothing → empty page, not an error (consistent with SESSION-4's
  existing `sportId`-no-match precedent).
- Invalid values (negative `minOpenSlots`/`maxFeeAmountVnd`, malformed `date`/`startTime`) → 400,
  consistent with existing request validation conventions.
- Deactivated caller: no new endpoint, same accepted JWT-window gap as the rest of this
  controller — not compounded here.

**Out of scope:**
- Session-attribute filtering — **SESSION-26**.
- SESSION-8's ranking algorithm (still `TODO`, unaffected by this ticket) — flagging for whoever
  picks up SESSION-8 next that the sort baseline it plans to replace will have moved to this
  3-level order by the time it lands.
- `/joined` and `/group` endpoints — unchanged.
- Client wiring — **CLIENT-SESSION-22**.

**Cross-domain concept precedent:** the `locationId` filter reuses the session's own existing
`locationId` column (already an established cross-domain id reference since SESSION-1) — no new
precedent needed.

**Tests:** Spock coverage per new param (each filter alone, and at least one combined case), the
3-level sort order, the default status list (all 3 including the new `PREPARING`/`ONGOING`
inclusion), the `now()` lower bound, and empty-page-on-no-match.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
