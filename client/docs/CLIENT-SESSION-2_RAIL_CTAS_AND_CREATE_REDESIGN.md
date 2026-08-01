# CLIENT-SESSION-2 · Upcoming rail create/join CTAs + standalone-only CreateSessionModal redesign

**Status:** `TODO` · **Type:** Feature · **Dependency:** none (frontend-only, no backend change) ·
**Spec:** this file · **Filed:** 2026-08-01, scoped via discussion (see "Follow-ups" below for the
backend-dependent pieces split out of it)

## Point 1 — `UpcomingMatches` empty state

`shared/components/UpcomingMatches.tsx:65` — empty-state copy changes from `"No upcoming matches for
this sport."` to `"No upcoming matches."` (the "for this sport" qualifier reads oddly once the card
also shows `activeSport === 'all'`, and the two new CTAs below make the scoping obvious from context
anyway).

Below the empty-state text, two new buttons: **"Create your match"** and **"Join a match"**. Two new
controlled props on `UpcomingMatches` (component stays presentational — no logic moves into it):

```ts
onCreateMatch: () => void;
onJoinMatch: () => void;
```

Only rendered in the empty-state branch (`visible.length === 0`), not the populated list.

**`onJoinMatch`** wires to the exact same `navigate('/matches')` all three call sites
(`HomeFeedPage`, `GroupsPage`, `FriendsPage`) already use for `onSeeAll` — there is no real
"discover a session you're not already in" surface yet (see SESSION-4 follow-up below), so for now
this button is just a more inviting entry point into the existing Matches list than "See all" is.
Kept as its own prop (not literally passed `onSeeAll` twice) so SESSION-4's eventual client ticket
can repoint it at a real discovery destination without touching `UpcomingMatches` again.

**`onCreateMatch`** opens `CreateSessionModal` inline, anchored on whichever page rendered the rail
(same below-sport-pill anchoring `HomeFeedPage`/`GroupsPage` already use for their other modals via
`ModalAnchorProvider`/`useAnchorBottom`).

The create-session data (manageable-groups — **removed by Point 2 below, see note** — `sportsByKey`,
the nested `LocationPicker` data hook, `useCreateSession()`) currently lives entirely inside
`useMatchesPageData`, private to `MatchesPage`. This ticket extracts it into a standalone hook (e.g.
`features/session/useCreateSessionModalData.ts`) that `HomeFeedPage`, `GroupsPage`, `FriendsPage`,
and `MatchesPage` all consume — `MatchesPage`'s existing "Create session" button switches to the
same hook/modal instance too, so there is exactly one create-session implementation, not two
diverging ones.

**`FriendsPage` needs `ModalAnchorProvider`/`useAnchorBottom` added** — every other page that opens a
modal already has this wired (`HomeFeedPage`, `GroupsPage`); `FriendsPage` never has, because it's
never opened one before now.

**No cache-wiring needed**: `useCreateSession` already invalidates `sessionKeys.all` on success, and
`useUpcomingMatches` (the Home Feed/Friends rail data) and `useMatchesPageData` (Matches page list)
both build on the same `useGroupSessionsForGroups`/`useMySessions` query family. A session created
from any page's inline modal refreshes every rail and the Matches page list automatically — verified
by reading `useCreateSession.ts`/`useUpcomingMatches.ts` before scoping this, not assumed.

## Point 2 — `CreateSessionModal` redesign (standalone-only)

**Drop the standalone/group mode toggle entirely.** `manageableGroups` prop removed from
`CreateSessionModalProps`; the modal always builds a `groupId`-less (`STANDALONE`) payload.

**Known consequence, accepted:** this mode toggle is currently the *only* UI in the app that creates
a `GROUP_RECURRING` session. Removing it means group owners/admins have no path to create a
group-linked session until the group recurrence-config settings UI ships (`GET`/`PUT
/api/groups/{id}/recurrence`, `autoGenerateSessions` toggle — already flagged as an unbuilt
follow-up back in CLIENT-SESSION-1's "explicitly out of scope" list, still unbuilt). That settings UI
is the intended real path back to group-linked sessions, not this modal. Not blocking this ticket,
but worth surfacing to whoever prioritizes that settings UI next.

**Two collapsible sections**, replacing the current flat field list:
- **"Session basic information"** — open by default, contains every field below.
- **"Session detail"** — collapsed by default. Meant to prefill from the user's profile data where
  it exists; for now, ships as a plain **"Coming soon"** placeholder — no real fields, no backend
  read. A later ticket (not filed) wires actual profile-derived prefill once there's a concrete field
  list to prefill.

No accordion/collapsible primitive exists in `shared/ui/` yet — add one via
`pnpm dlx shadcn@latest add accordion`, restyled to tokens per `client/CLAUDE.md`'s shadcn-first
convention, rather than hand-rolling a bespoke collapsible.

### "Session basic information" fields

1. **Sport** — pre-set from the hosting page's `activeSport` pill when it isn't `'all'`; otherwise,
   if the caller has exactly one sport profile, pre-set to that regardless of the active pill.
   Falls back to today's blank `"Select a sport"` state only when neither condition holds. Replaces
   the current always-blank default.
2. **Session title** — becomes **required** (was "Title (optional)"). Frontend validation only —
   `CreateSessionRequest.title` already accepts a value backend-side, no backend change needed.
3. **Location** — replaces the current single "Choose location"/"Change location" button with a
   dropdown of the caller's favorite locations for the effective sport, plus a trailing "Choose a
   location" entry that opens the existing `LocationPicker` flow unchanged. **Ships now with zero
   favorites** (favorite locations don't exist yet — see LOC-2 follow-up below) — the dropdown is
   effectively just the trailing button until LOC-2 ships, at which point it populates for free, no
   second pass on this field. The favorite-toggle heart on `LocationPicker`'s search-result rows is
   **not** part of this ticket — it has no backend to call yet, so it ships as part of LOC-2
   (bundled backend + the heart UI together, same reasoning Point 2's own excluded fields below
   follow).
4. **Starts at** — replaces the current `datetime-local` input with a wheel-picker: a date wheel
   (8 options — "Today" default, "Tomorrow", the next 5 days as `"DD/MM"`, and a final "Pick a date"
   entry that opens a full date picker for anything further out) plus separate hour and minute
   wheels. No wheel-picker or date-picker component exists anywhere in this codebase today (the
   current field is a plain native `<input type="datetime-local">`) — this is a new shared component,
   comparable in scope to `LocationPicker`, and should be built and Storybook-covered on its own
   before being wired into this modal (same "component ships ahead of the page that uses it"
   precedent CLIENT-LOC-1 set).
5. **Duration** — becomes **required** (was "optional"). Frontend validation only, same reasoning as
   title.

### Fields explicitly excluded from this ticket

None of the below have any backend representation today (confirmed against `Session.java` and
`CreateSessionRequest` — no capacity, no fee, no invite/approval concept exists in `modules/session`
at all). Shipping their inputs now would mean a user fills them in and they're silently dropped on
submit — actively misleading rather than just incomplete. Each moves into its paired backend
follow-up instead, landing together with the backend support it needs:

- **"Taken slot" / "Open slot"** (capacity) and **"Fee"** (Free / Split cost / fixed VND amount) —
  ship with **SESSION-5** below.
- **"Invite your friend"** (friend search + multi-select with dismissible badges) and the **"Auto
  approve join request"** checkbox + confirm-warning — ship with **SESSION-6** below. (The friend
  search itself needs no new endpoint — `GET /api/users/friends` already returns the caller's full
  friend list unpaginated, so "search by fullname, 3+ characters" is a client-side filter over
  `useFriends()`'s existing result, same as `SESSION-6`'s eventual client ticket will build it.)

## Verification plan (once implemented)

- Vitest/RTL coverage for `UpcomingMatches`'s new empty-state buttons and props, the extracted
  create-session hook, and `CreateSessionModal`'s new field set/validation.
- Storybook stories for the new accordion sections and the new wheel-picker component's states.
- `matches-journey.spec.ts` (e2e) updated for the removed group-mode toggle; a new e2e step or spec
  covering "create from the Home Feed rail" (previously only reachable from `/matches`).
- Visual regression: `UpcomingMatches` renders on Home Feed/Groups/Friends — expect baseline diffs on
  every empty-state capture across all three, same "regenerate baselines" follow-up precedent
  HF-13..HF-19 established for shared-component changes.

## Follow-ups filed alongside this ticket (backend-dependent, not built here)

| Ticket | Where | What |
|---|---|---|
| SESSION-4 | `modules/session/docs/BACKLOG_MVP.md` | Standalone session discovery (real "Join a match") |
| SESSION-5 | `modules/session/docs/BACKLOG_MVP.md` | Session capacity + fee/pricing |
| SESSION-6 | `modules/session/docs/BACKLOG_MVP.md` | Join-approval workflow + invite-friends-at-creation |
| LOC-2 | `modules/location/docs/BACKLOG_MVP.md` | Favorite locations |

Each backend ticket's own entry lists the client-side follow-up work it unblocks; none of those
client tickets are filed yet, per this project's established cadence (file the client ticket once the
backend it needs has actually shipped — see SPORT-1/CLIENT-LOC-1/CLIENT-SESSION-1 for precedent).
