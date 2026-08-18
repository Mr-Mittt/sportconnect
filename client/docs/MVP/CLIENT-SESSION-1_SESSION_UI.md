# CLIENT-SESSION-1 · Session create/list/join/leave/cancel UI

**Status:** `DONE` (2026-07-31) · **Type:** Feature · **Dependency:** `CLIENT-LOC-1` (`DONE`) · backend
`modules/session` SESSION-1/SESSION-2/SESSION-3 (all `DONE`) · **Spec:** `client/docs/BACKLOG_MVP.md`
§ CLIENT-SESSION-1

## Design (as approved)

The backlog spec: de-mock HF-4's `UpcomingMatches` against the real `/api/sessions/**` endpoints —
group-linked (owner/admin-gated) or standalone (open to any user) sessions, using `LocationPicker`
for the required location, with status badges reflecting the real 4-state lifecycle and cancelling
surfacing `cancelReason`.

Before implementing, exploration surfaced a scope-defining fact the spec didn't anticipate: `/matches`
already had a real, reserved route (`router.tsx`) rendering `ComingSoonPage`, and the nav bar's
"Matches" tab was already wired to it. Confirmed with the user this ticket should build the real
page there (not a modal-only flow), and got explicit sign-off on three more consequences of reading
the real `SessionController`/`SessionResponse` shapes before designing:

1. **No batch "sessions across my groups" endpoint, and no way to browse a standalone session
   someone else created.** Only `GET /sessions/mine` (caller's own standalone sessions) and
   `GET /sessions/group/{id}` (a specific group's sessions) exist. The list is therefore the union
   of the caller's own standalone sessions and every group they belong to's sessions — a real
   backend gap, not solved here, flagged for a follow-up ticket.
2. **No capacity/max-participants field** — the real `Session` has `participantCount` but no cap, so
   HF-4's "N spots left, join / Full, view details" CTA has no real equivalent. Replaced with a
   status badge (`SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`) + a single "View details" CTA; actual
   join/leave moved into the detail view, where participants are fetched anyway (avoids an
   N+1-style participants-per-card fetch just to show a join/leave button on every list row).
3. **Session detail** is a Dialog (`SessionDetailModal`), not a new route — matches every other
   modal-based flow in this codebase. The rail card's "View details" still gets a real destination
   via a `?session={id}` query param `MatchesPage` reads once on mount (not a path segment/new
   route — same `useParams`-seeds-page-state precedent FEED-12 used for `/posts/:postId`).

**Explicitly out of scope, confirmed during design, not the title's list:** an edit-session UI
(`useUpdateSession` hook exists per the backlog's "data hook(s) wrapping ... update ..." text, but no
UI consumes it — the ticket title lists create/list/join/leave/cancel only). Wiring group recurrence
config into the Groups page Settings tab (the backlog's own stated exclusion).

## What was built

**Types** — `shared/types/session.ts` (`Session`, `SessionParticipant`, `SessionType`,
`SessionStatus`, `ParticipantStatus`, full `SessionResponse`/`SessionParticipantResponse` shape),
`shared/types/location.ts` (new — `Location` **moved** here from `features/location/types.ts`,
re-exported from there unchanged, since `shared/types/session.ts` needed it and shared code can't
import from features — same precedent HF-2 set moving `SportKey`/`SportProfile`). `features/session/types.ts`
re-exports the shared types and adds write-only payloads (`CreateSessionPayload`,
`UpdateSessionPayload`, `CancelSessionPayload`, `SessionListItem` — a `Session` with its group's
display name resolved, computed once by the page aggregator).

**Data layer:**
- `features/session/hooks/`: `useGroupSessions`/`useGroupSessionsForGroups` (the latter a
  `useQueries` fan-out — no batch endpoint exists), `useMySessions`, `useSession`,
  `useSessionParticipants`, `useCreateSession`, `useUpdateSession`, `useCancelSession`,
  `useJoinSession`, `useLeaveSession`. Mutations invalidate `sessionKeys.all` broadly (same "blunt
  but simple" precedent `feedKeys` documents).
- `shared/hooks/useUpcomingMatches.ts` **rewritten** (was 100% mock) — composes the hooks above,
  merges group + standalone sessions, drops `COMPLETED`/`CANCELLED`, sorts by `scheduledStart`.
  Same `{ data, isLoading, isError }` shape, so `HomeFeedPage`/`GroupsPage`/`FriendsPage` needed
  only their `onSeeAll`/`onSelectMatch` wiring changed (from `noop` to real navigation), not the
  hook's call shape.
- `features/session/useMatchesPageData.ts` — the page's composed hook (list aggregation + sport
  filter, create-modal state incl. the nested `LocationPicker`'s data hook, detail-dialog state,
  join/leave/cancel).

**Components** (`features/session/components/`): `SessionListCard` (the full-list row — richer than
the rail card), `CreateSessionModal` (mode toggle standalone/group, sport or group `Select`,
`LocationPicker` for the required location, `datetime-local` start, optional duration/locationNote),
`SessionDetailModal` (full detail, participants, Join/Leave derived from whether the viewer appears
`JOINED` in the fetched participants — no such field exists on `SessionResponse` itself — and Cancel,
gated on `canManage`, with an inline reason field instead of `window.confirm`). All three have
Storybook coverage and Vitest/RTL tests.

**Page** — `MatchesPage.tsx` at `/matches` (replacing `ComingSoonPage`), `app/matchesPageStore.ts`
(own sport-pill Zustand store, same per-page-isolated pattern as `groupsPageStore`/`homeFeedStore`).

**Shared additions:** `shared/lib/mapsLinks.ts` (`directionsUrl` extracted out of `LocationPicker.tsx`
so `SessionDetailModal` doesn't duplicate it), `shared/lib/sessionStatus.ts` (status label/class maps
shared by `UpcomingMatches`/`SessionListCard`/`SessionDetailModal`), new design token
`--color-text-success` (green, for `ONGOING` — no green token existed yet).

**A real bug found and fixed while wiring this up:** `useLocationPickerData`'s returned field names
(`switchToCreate`, `setInputValue`, `movePin`, …) never matched `LocationPickerProps`' expected names
(`onSwitchToCreate`, `onInputChange`, `onMovePin`, …) — CLIENT-LOC-1 shipped with no page consuming
the hook, so this was never actually wired end-to-end and TypeScript had nothing to catch across the
two files independently. Fixed by renaming the hook's return keys to match the component (the
component's naming was correct/idiomatic); `useLocationPickerData.test.tsx` updated to match.

**E2E:** `e2e/flows/matches-journey.spec.ts` (6 steps: load, sport filter, join/leave, cancel,
group-session member-only gating, create via search-existing-location). New MSW handlers
`e2e/mocks/handlers/{locations,sessions}.ts` (stateful, same session-store pattern as `groups.ts`),
fixtures `mockLocation`/`mockSession`/`mockGroupSession` in `fixtures.ts`.

## Verification

- `tsc -b` and `eslint` clean across every touched file.
- Full Vitest suite green (110+ files) — fixed 4 pre-existing tests that broke because
  `useUpcomingMatches` now makes real HTTP calls instead of returning static mock data
  (`HomeFeedPage.test.tsx`, `useHomeFeedData.test.tsx`, `FriendsPage.test.tsx` needed a
  `MemoryRouter` it didn't have before, `useGroupsPageData.test.tsx`'s mock needed the new
  endpoints stubbed).
- `matches-journey.spec.ts` run against the real Playwright `e2e` project (not just MSW-mocked
  logic in isolation) — passes.
- Storybook: every new component's stories reviewed.

## Explicitly out of scope / follow-ups

- Backend gap: no endpoint to discover a standalone session someone else created, and no "sessions
  I've joined but didn't create" endpoint — both would need new backend work.
- Edit-session UI (hook exists, no UI).
- Wiring group recurrence config (`autoGenerateSessions`, day/time) into the Groups page Settings tab.

---

### CLIENT-SESSION-1 · Session create/list/join/leave/cancel UI
**Status:** `DONE` (2026-07-31, `client/docs/CLIENT-SESSION-1_SESSION_UI.md`) · **Type:** Feature · **Filed:** 2026-07-30, alongside CLIENT-LOC-1
**Dependency:** CLIENT-LOC-1 (`DONE`, needed for the location field on create/edit) · backend
`modules/session` SESSION-1/SESSION-2/SESSION-3 (all `DONE`) — full status lifecycle
(`SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`) and `POST /api/sessions/{id}/cancel` already exist,
build against that contract directly rather than an earlier hard-delete shape.

**What ships:** de-mocks HF-4's `UpcomingMatches` (`client/docs/HF-4_UPCOMINGMATCHES.md`, currently
`mockData.ts`-backed per the data layer convention) against the real `/api/sessions/**` endpoints —
group-linked (owner/admin-gated) or standalone (open to any user) sessions, using `LocationPicker`
for the required `locationId` field. Types + data hook(s) wrapping create/get/list-by-group/
list-mine/update/cancel/join/leave/participants. Status badges must reflect the real 4-state lifecycle
(including the automatic `ONGOING` transition, not just create-time `SCHEDULED`), and cancelling
must surface `cancelReason` where shown, matching the backend's soft-cancel-only model (there is no
delete endpoint — `SessionServiceImpl` removed it entirely in SESSION-3).

**Explicitly out of scope (may need its own follow-up ticket, not yet filed):** wiring a group's
recurring-session schedule config (`GET`/`PUT /api/groups/{id}/recurrence`, `autoGenerateSessions`
toggle) into the Groups page Settings tab — that's a separate owner-facing surface from the
session list/create/join flow this ticket covers. Also out of scope: an edit-session UI
(`useUpdateSession` hook exists, no UI consumes it — the ticket title only lists create/list/
join/leave/cancel).

**Delta (resolved during implementation, see `client/docs/CLIENT-SESSION-1_SESSION_UI.md` for the
full writeup):** `/matches` already had a real, reserved route (`ComingSoonPage`) and nav tab — this
ticket built the real page there rather than a modal-only flow. The real `Session` has no capacity/
max-participants field, so HF-4's "N spots left, join / Full" CTA has no equivalent — replaced with
a status badge + a single "View details" CTA; join/leave moved into the detail dialog. There is no
batch "sessions across my groups" endpoint and no way to discover a standalone session someone else
created (only `GET /sessions/mine` = caller's own, `GET /sessions/group/{id}` = one group) — a real
backend gap, not solved here, worth its own follow-up ticket if session discovery needs to widen.
