# GRP-5 · Join Group modal — show the active sport filter

### GRP-5 · Join Group modal — show the active sport filter
**Status:** `SUPERSEDED` by GRP-6 (above), 2026-07-21 · **Type:** Enhancement · **Filed:** 2026-07-21,
found while explaining existing behavior (not a bug report — the filter itself works correctly, only
its visibility doesn't)

**Origin:** confirmed via code read (`GroupsPage.tsx`/`useJoinGroupModalData.ts`/`usePublicGroups.ts`)
that `JoinGroupModal`'s search **does** apply the Groups page's active sport filter server-side —
`GroupsPage` computes `lockedSport = activeSport !== 'all' ? activeSport : null` and passes its
`sportId` through `useJoinGroupModalData` into `usePublicGroups`, which sends it as a `GET
/api/groups/public?sportId=...` query param. When `activeSport === 'all'`, no `sportId` is sent and
results span every sport.

**The gap:** `CreateGroupModal` already receives this same `lockedSport` value and visibly shows/locks
the sport in its form — `JoinGroupModal` does not. It has no `lockedSport` prop at all; the filtering
happens silently. A user on, say, the Basketball tab who opens Join Group and doesn't see a football
group they expected has no indication in the modal itself that results are scoped to Basketball —
they'd have to notice the sport tab underneath to infer why.

**What ships:** thread `lockedSport` (already computed in `GroupsPage.tsx`, same value
`CreateGroupModal` already takes) into `JoinGroupModal` and render a visible indicator when it's
non-null — e.g. "Searching in {sport}" near the search input — matching whatever visual treatment
`CreateGroupModal`'s locked-sport display already uses, for consistency rather than inventing a new
pattern.

**Design questions to resolve at pickup:**
- Exact copy/placement — mirror `CreateGroupModal`'s locked-sport UI verbatim, or does the modal's
  layout call for something lighter (e.g. a small badge vs. a full form field, since Join Group has no
  sport dropdown to replace the way Create Group does)?
- Should the indicator be static text, or does it need its own `aria-label`/live-region treatment so
  a screen-reader user searching gets the same "why are results limited" context sighted users would
  infer from the page's sport tab?

**Out of scope:**
- Changing the filtering behavior itself — it already works correctly; this is a visibility-only fix.
- Any change to `CreateGroupModal`'s existing locked-sport display.

---

| Item | Decision |
|---|---|
| De-mock HF-4 (UpcomingMatches) | No longer deferred — the Session/Location backend shipped 2026-07-30 (`modules/session`, `modules/location`, GROUP-RECUR-1). Filed as **CLIENT-LOC-1**/**CLIENT-SESSION-1** (Phase 10, `TODO`), see entries below. |
| Forgot/reset password screens | Deferred — `POST /api/auth/forgot-password` is a non-functional server-side placeholder; building UI against it now would do nothing. |
| OAuth2 social login (Google/Facebook) | Deferred — scaffolded server-side but unverified; own ticket if prioritized. |
| Group invitations / pinned posts / ownership transfer UI | Deferred — real endpoints exist; **GRP-1 is the Groups-page epic's first ticket, but does not itself cover invitations, pinned posts, or ownership transfer** — those remain deferred beyond GRP-1. |
| Add-sport flow screen | Deferred — only the entry-point callback is wired (HF-2/SPORT-1); `POST /api/sports/profiles` is ready when this gets scoped. |
| Group member blacklist/ban | Deferred — no schema, repository query, or endpoint exists for banning/blocking a group member. GRP-3 ships its Blacklist section as a permanent "coming soon" empty state; real functionality needs a backend design pass before a follow-up client ticket. |

---
