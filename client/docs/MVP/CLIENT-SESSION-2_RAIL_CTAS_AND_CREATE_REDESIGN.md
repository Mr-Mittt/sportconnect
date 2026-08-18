# CLIENT-SESSION-2 · Standalone-only CreateSessionModal redesign (core fields)

**Status:** `DONE` (2026-08-03) · **Type:** Feature · **Dependency:** none (frontend-only, no
backend change) · **Spec:** this file · **Filed:** 2026-08-01, scoped via discussion (see
"Follow-ups" below for the backend-dependent pieces split out of it)

**Delta (2026-08-03, at pickup):** the four backend-dependent follow-ups below (SESSION-4/5/6, LOC-2)
all shipped 2026-08-01/02. They're now filed as concrete client tickets — CLIENT-SESSION-3
(capacity/fee), CLIENT-SESSION-4 (invite/auto-approve + approval queue), CLIENT-SESSION-5 (favorite
locations), CLIENT-SESSION-6 (discover browse UI) — see `client/docs/BACKLOG_MVP.md` for each one's
scope.

**Delta (2026-08-03, at close-out):** Point 1 below (rail CTAs + hook extraction) was **not**
built this session (user decision: build Point 2, the modal redesign, first) — split out as its
own ticket, **CLIENT-SESSION-7**, rather than leave it unstarted blocking this otherwise-`DONE`
ticket. Point 2 shipped, but diverged from this file's original plan in three real ways —
see "Implementation notes (2026-08-03)" right after Point 2 below for what changed and why.

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
  ships with **CLIENT-SESSION-3** (`client/docs/BACKLOG_MVP.md`), backend: **SESSION-5**.
- **"Invite your friend"** (friend search + multi-select with dismissible badges) and the **"Auto
  approve join request"** checkbox + confirm-warning — ships with **CLIENT-SESSION-4**
  (`client/docs/BACKLOG_MVP.md`), backend: **SESSION-6**. (The friend search itself needs no new
  endpoint — `GET /api/users/friends` already returns the caller's full friend list unpaginated, so
  "search by fullname, 3+ characters" is a client-side filter over `useFriends()`'s existing result.)

## Implementation notes (2026-08-03) — where the build diverged from the plan above

Point 2 shipped, but three pieces of the original plan changed during implementation, each for a
concrete reason found live, not a stylistic preference:

1. **No shadcn Accordion was added.** `shared/ui/collapsible.tsx` (Radix `Collapsible`) already
   existed — already used by `GroupSettingsTab`/`FriendRail`/`FriendProfilePanel` — and fits two
   independent open/closed sections better than a single-select Accordion group anyway. Zero new
   dependency needed.
2. **The favorites-dropdown shell (item 3) was built, then reverted.** A `DropdownMenu` wrapping
   just the "Choose a location" entry (ready to receive real favorite rows later) never opened at
   all once live-tested against the running dev server — confirmed the menu genuinely doesn't
   fire, not a styling/z-index issue. Since it had zero favorite rows to show anyway
   (pre-CLIENT-SESSION-5), reverted to the plain `Button` this field had before. CLIENT-SESSION-5
   now owns building a working favorites dropdown from scratch, not just wiring data into this
   shell.
3. **The wheel-picker (item 4) became three independent native `<select>`s**, not one trigger
   opening a shared Popover with three wheel columns inside. The Popover version, nested inside
   this modal's own `Dialog`, first silently failed to open at all in tests; forcing it `modal` to
   fix that instead caused two competing focus traps to recurse into a real stack overflow
   (confirmed live too — an outside click while the wheel was open left the whole page
   permanently unclickable). Given the same nesting problem broke the favorites dropdown
   independently, native `<select>`s (no portal/dismissable-layer involved) replaced the Popover
   entirely — Date/Hour/Minute are three plain selects; "Pick a date…" reveals a small hand-built
   calendar inline (no calendar library exists in this codebase) instead of in a popover.

Two more changes came from direct user feedback after the initial build, not backend/nesting
issues: the modal widened to `max-w-2xl` with Sport/Title and Location/Starts-at paired into
2:8 and 7:3 rows respectively (Duration paired with Starts-at, Location note with Location); the
Date/Hour/Minute selects default to Today/one-hour-from-now/:00 instead of starting blank; and
"Create session" is always clickable, validating on submit with per-field error messages, rather
than staying disabled until the whole form is valid.

## Verification (Point 2 — what actually shipped)

- Vitest/RTL: `CreateSessionModal.test.tsx` (sport pre-select, required-field errors, submit
  payload shape, no `groupId`), `SessionStartTimePicker.test.tsx` (all three selects, defaults,
  inline calendar), `SessionStartTimeCalendar.test.tsx` (month nav, min-date disabling). Typecheck
  clean; full `src/features/session` suite green.
- Storybook: `CreateSessionModal.stories.tsx`, `SessionStartTimePicker.stories.tsx`,
  `SessionStartTimeCalendar.stories.tsx` — every new visual state covered.
- Not done this ticket (belongs to CLIENT-SESSION-7, since Point 1 wasn't built): the removed
  group-mode toggle's `matches-journey.spec.ts` e2e update, any "create from the Home Feed rail"
  e2e step, and `UpcomingMatches` visual-regression baseline updates. `MatchesPage`'s own existing
  create-flow e2e/visual coverage was not re-verified against the new modal layout in this
  session — worth a pass before the next release.

## Follow-ups split out of this ticket (backend-dependent, not built here)

| Backend ticket | Status | Client ticket | Client status |
|---|---|---|---|
| SESSION-4 (`modules/session/docs/BACKLOG_MVP.md`) — standalone session discovery | `DONE` | CLIENT-SESSION-6 | `TODO` |
| SESSION-5 (`modules/session/docs/BACKLOG_MVP.md`) — capacity + fee/pricing | `DONE` | CLIENT-SESSION-3 | `TODO` |
| SESSION-6 (`modules/session/docs/BACKLOG_MVP.md`) — join-approval + invite-at-creation | `DONE` | CLIENT-SESSION-4 | `TODO` |
| LOC-2 (`modules/location/docs/BACKLOG_MVP.md`) — favorite locations | `DONE` | CLIENT-SESSION-5 | `TODO` |

All four backends shipped 2026-08-01/02 (after this ticket was filed 2026-08-01). Per this project's
established cadence (file the client ticket once the backend it needs has actually shipped — see
SPORT-1/CLIENT-LOC-1/CLIENT-SESSION-1 for precedent), each is now a filed client ticket in
`client/docs/BACKLOG_MVP.md`, depending on this ticket rather than folded into it (this repo's usual
pattern for splitting a large scope, e.g. GRP-1..GRP-8).

---

### CLIENT-SESSION-2 · Standalone-only `CreateSessionModal` redesign (core fields)
**Status:** `DONE` (2026-08-03) · **Type:** Feature · **Dependency:** none (frontend-only) ·
**Filed:** 2026-08-01 · **Spec:** `client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`

**What shipped:** `CreateSessionModal` drops its standalone/group mode toggle (standalone-only —
group-linked session creation has no UI until the still-unbuilt group recurrence-config settings
surface ships), widens to `max-w-2xl`, and restructures into two collapsible sections styled after
the Friends page rail's own section headers (`FriendSection` — small muted trigger label, chevron
centered next to it, underlined, not a bold heading): "Session basic information" (open by
default) and "Session detail" (collapsed, "Coming soon" placeholder for a later
profile-derived-prefill ticket). Four rows inside the first section (ratios per user decision):
Sport(2)/Title(8); Location(7, selected name + button on one line)/Location note(3); "Starts
at"(7)/Duration(3); Description alone, full width. Sport pre-selects from the hosting page's active
pill, or the caller's sole sport profile, or blank. Required fields (Sport/Title/Location/Starts
at/Duration) show a red `*`; "Create session" is always clickable rather than disabled until
valid — clicking it while invalid sets a per-field error under whichever required fields are still
empty, each clearing on its own the moment that field is filled in.

New shared-within-feature component `SessionStartTimePicker` replaces the old native
`datetime-local` input with three fully independent native `<select>`s (Date/Hour/Minute) —
**not** a Radix Popover-based wheel as originally planned. Nesting Radix floating UI inside this
modal's own Dialog caused two separate confirmed-live bugs during implementation: a `Popover`
stopped opening at all once made to cooperate with the Dialog's focus trap (forcing it `modal`
"fixed" the open bug but caused a stack-overflow from two competing focus traps — reverted), and a
`DropdownMenu`-based location-favorites shell never opened live either, with nothing to show in it
anyway pre-CLIENT-SESSION-5 (reverted to the plain button). Native `<select>`s have no
portal/dismissable-layer involved, so that whole bug class doesn't apply — the Date select offers
Today/Tomorrow/next 5 days/"Pick a date…" (the last revealing a small hand-built inline calendar,
no calendar library exists in this codebase), and defaults to Today/one-hour-from-now/:00 on open
rather than starting blank.

**Why the original plan (favorites dropdown shell, Popover wheel) changed:** both were designed
before implementation surfaced that Radix floating UI doesn't reliably nest inside this specific
modal's Dialog in this app's current Radix versions — confirmed live twice, not a jsdom-only
artifact. Favor simple, proven primitives (native `<select>`, plain `Button`) over a broken shell
for either don't-yet-exist data (favorites) or a "nicer" picker.

**Delta (2026-08-03, at pickup):** the backends for four originally-excluded fields
(SESSION-4/5/6, LOC-2 — capacity/fee, invite/auto-approve, favorites, discover) shipped
2026-08-01/02, after this ticket was originally filed. Rather than re-scope this already-reviewed
ticket mid-flight or fold everything into one oversized PR, those four areas are filed as their
own tickets (CLIENT-SESSION-3/4/5/6, below), each depending on this one.

**Delta (2026-08-03, at close-out):** this ticket's original scope also included Point 1 —
`UpcomingMatches`'s empty-state rail CTAs ("Create your match"/"Join a match") and extracting the
create-session hook out of `useMatchesPageData` so Home Feed/Groups/Friends/Matches share one
modal instance. That work wasn't started this session (user decision: build the modal redesign —
Point 2 — first, then close out what was actually done rather than leave an unstarted part
blocking the rest) — split into its own ticket, **CLIENT-SESSION-7**, below.
