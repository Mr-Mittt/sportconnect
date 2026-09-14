# CLIENT-SESSION-21 · PREPARING-session warning + completion UI

**Status:** `TODO`
**Type:** Client feature
**Depends on:** backend **SESSION-24** — hard.
**Filed:** 2026-09-14, companion to SESSION-24. Notable finding at scoping time: there is **no
edit-session UI at all today** — `useUpdateSession.ts` exists but is unconsumed ("No edit UI
consumes this yet... provided for a follow-up edit-UI ticket to build against"), so this ticket is
the first thing to build against it, scoped narrowly to the `PREPARING`-completion case rather than
a general session editor.

## Scope

1. `CreateSessionModal`: when location and/or fee are left blank at submission (now optional per
   SESSION-24), show a warning (exact copy/placement TBD at pickup) that the session will be
   created as `PREPARING` and needs completing before its start time, or it will be auto-cancelled.
2. A minimal "complete session setup" surface for a `PREPARING` session the caller created —
   likely a banner/section in `SessionDetailModal` (creator-only, shown only when
   `session.status === 'PREPARING'`) with inputs for whichever of location/fee is still missing,
   submitting via the existing (currently unconsumed) `useUpdateSession` hook. Exact placement/
   component shape TBD at pickup — no prior "edit session" UI pattern exists to follow.
3. After a completion update that still leaves one field missing (partial completion — SESSION-24
   keeps the session `PREPARING` until both are set), re-show the same warning reflecting what's
   still outstanding.
4. **Add `PREPARING` to `client/src/shared/types/session.ts`'s `SessionStatus` union**, and fix the
   two call sites that would otherwise silently misbehave (found during SESSION-24's `/workon`
   Phase 1 client-visible-enum check, not caught by the compiler since neither site is an
   exhaustive switch):
   - `SessionDetailModal.tsx`'s `canJoinOrLeave` (`status === 'SCHEDULED' || status === 'ONGOING'`)
     — must include `'PREPARING'`, since SESSION-24 spec's it as fully joinable like `SCHEDULED`.
     Omitting it would hide the Join button on a joinable session.
   - `groupSessionsByDate.ts`'s `ACTIVE_STATUSES` Set (`SCHEDULED`/`ONGOING`) — must include
     `'PREPARING'`, otherwise a session still being set up falls into the "history" zone
     (CLIENT-SESSION-20) instead of "active".

5. **Add `'session.details.updated'` to the `NotificationType` union** (`client/src/features/notifications/types.ts`)
   and a `getNotificationText` case (`client/src/features/notifications/notificationText.ts`):
   `[actor, plain(' updated '), entity]` (same shape as `session.participant.joined`/`left`) —
   deliberately field-agnostic, matches the backend event's own design (SESSION-24). Compiler-
   enforced (CLIENT-NOTIF-4's exhaustiveness check) — omitting the union member entirely avoids
   the build error but silently degrades to the generic fallback text, the exact gap CLIENT-NOTIF-3
   already fixed twice; don't repeat it a third time.

6. **`client/src/shared/types/session.ts`'s `Session.location`/`.feeType` become nullable**
   (`Location | null` / `FeeType | null`, matching the existing `feeAmountVnd: number | null`
   pattern) — a `PREPARING` session's `SessionResponse.location`/`.feeType` are genuinely `null`
   backend-side (found during SESSION-24's Phase 4 consumer census: neither Java field carries
   `@NotNull`, so nothing stops a `PREPARING` row's response from actually having `null` there).
   Audit every read of `session.location.*`/`session.feeType` across `src/features/session/` and
   `src/shared/components/UpcomingMatches.tsx` for a null-safe guard.

**Scope change (2026-09-14, at SESSION-24 pickup):** items 4-6 added — originally this ticket only
covered the warning/completion UI; the `SessionStatus` union + the two call sites (item 4), the new
`session.updated` notification type (item 5), and the now-nullable `location`/`feeType` fields
(item 6) were found missing coverage during SESSION-24's Phase 1/3/4 client-visible-enum and
consumer-census checks, and folded in here rather than filed separately, since they're all the same
"the client needs to know about PREPARING/its update path" concern.

**Out of scope:**
- A general session editor for already-`SCHEDULED` sessions — SESSION-24 makes `locationId`/
  `feeType` immutable outside `PREPARING` anyway, so no such editor is implied by this ticket.
- SESSION-25/CLIENT-SESSION-22's search/filter work.

**Tests:** Vitest for the warning component (missing-location / missing-fee / missing-both
states) and the completion form; a `notificationText.test.ts` case for `session.updated`; MSW
handler for a `PREPARING` session fixture + the update flow; `matches-journey` (or a new) e2e
covering create-without-location → warning → complete → status becomes `SCHEDULED`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
