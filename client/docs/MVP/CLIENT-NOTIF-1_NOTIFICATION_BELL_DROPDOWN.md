# CLIENT-NOTIF-1 · Notification bell/dropdown — live badge + list + mark-as-read

**Status:** DONE
**Module:** `client`
**Related:** `modules/notification/docs/MVP/NTF-1_MODULE_SCAFFOLDING.md`,
`modules/notification/docs/MVP/NTF-3_STOMP_LIVE_DELIVERY.md` (built the badge placeholder + live-socket
hook this ticket replaces), `modules/notification/docs/MVP/NTF-4_NOTIFICATION_RESPONSE_ENRICHMENT.md`
(new backend ticket filed and built as part of this pickup — see below)

## Design (approved plan, restated)

A notification bell in the shared `TopBar`: unread-count badge kept live via NTF-3's existing STOMP
subscription (falls back to a poll only insofar as the badge's own REST query refetches on remount —
no dedicated reconnect/backoff poller was built; see Out of scope). Dropdown list backed by
`GET /api/notifications`, wrapped in a `use<Feature>Data()`-shaped hook per the client's data-layer
convention. Opening/clicking a notification calls `PUT /api/notifications/{id}/read`.

**Scope correction made at pickup, before any code:** NTF-1 deliberately shipped
`NotificationResponse` with zero enrichment — raw `actorIds` (UUIDs) and a bare `entityId`, no
name, no title. Building the dropdown against that contract would render literally unreadable rows.
User decision at pickup: the notification API should build enough data for the client (actor full
names + the referenced session's title), rather than the client resolving `GET /api/users/{id}`
per actor itself (no batch users-by-id endpoint exists client-side, and NTF-1's own no-enrichment
call was explicit — reversing it needed a real decision, not a workaround). This became its own
backend ticket, **NTF-4** (`modules/notification/docs/BACKLOG_MVP.md`), filed and implemented in
this same session before the client work started — see that ticket's own summary for the backend
design/implementation. `CLIENT-NOTIF-1` was built against NTF-4's real, shipped contract from the
start, not a placeholder.

Three more design points confirmed with the user before implementation:
1. **No actor-name resolution client-side** — text comes entirely from the server-enriched
   `actors`/`entityTitle` fields (NTF-4). Confirmed answer: "actor fullname and entityTitle" — no
   avatar field, kept to the two fields actually needed for readable text.
2. **Click target:** every notification type in scope today (NTF-2's session-only consumer) is
   `entityType: "SESSION"` — clicking a row marks it read and opens the session's detail.
   **Superseded same day, see "Post-ship follow-up" below** — the first implementation navigated to
   `/matches?session={entityId}`; that was corrected to a shell-level in-place modal once the user
   caught both the unwanted page switch and a real bug it caused.
3. **"Mark all read":** confirmed in scope, despite no bulk backend endpoint existing (NTF-1 only
   ships the single-id `PUT`). Scoped explicitly to the notifications currently loaded in the
   dropdown, not "every unread notification that may ever exist" — see Key decisions.

## What was built

**Backend (NTF-4, see its own summary doc for full detail):** `NotificationResponse` gained
`actors: List<NotificationActorSummary>` and `entityTitle: String`, both batch-resolved once per
page via `user-api`'s `getUsersByIds` and a new `session-api` `getSessionTitlesByIds`.

**`client/src/features/notifications/`** (extending NTF-3's existing minimal scaffolding):
- `types.ts` — `Notification`, `NotificationActorSummary`, 1:1 with NTF-4's enriched DTO.
- `queryKeys.ts` — `notificationKeys` (`list()`, re-exports NTF-3's existing `unreadCount` key so
  `useNotificationLiveSocket`'s live-ping write and this ticket's list/badge queries share one key).
- `notificationText.ts` + its own unit tests — the pure `type` → display-sentence mapping. Every
  known `type` string (all 6 of NTF-2's session-only event types) gets its own template; an
  unrecognized `type` falls back to a generic sentence rather than crashing, for forward
  compatibility with post/group/friend types once B7/B21/U13 ship. "And N others" is derived from
  `actors.length` (distinct actors), deliberately never `actorCount` (total matched events — can
  exceed `actors.length` when the same actor repeats, which must not read as "and 2 others" when
  there's only ever been one person).
- `useNotifications.ts` — `useInfiniteQuery` wrapping `GET /api/notifications`, same
  `getNextPageParam`/`PagedApiResponse` pagination contract `usePersonalFeed` already established.
  `enabled` param lets the bell skip fetching until opened.
- `optimisticNotificationUpdates.ts` — pure cache-transform helpers (snapshot/restore/flip-one/
  flip-all/collect-unread-ids/decrement-count), same shape as `optimisticSessionCommentUpdates.ts`.
- `useMarkNotificationRead.ts` / `useMarkAllNotificationsRead.ts` — mutation hooks, optimistic with
  rollback-on-error, built on the helpers above.
- `useNotificationBellData.ts` — the shell-level `use<Feature>Data()` hook (see Key decisions for
  why this exists as its own file rather than living inline in the component or in `AppShell`)
  bundling all 4 data hooks + popover-open state + the select/mark-all handlers into the flat prop
  shape `NotificationBell` expects.
- `components/NotificationRow.tsx` — one dropdown row, presentational, its own stories + tests.
- `components/NotificationBell.tsx` — the bell + `Popover` dropdown (not `DropdownMenu` — see Key
  decisions), fully presentational/controlled, its own stories + tests.

**`shared/components/TopBar.tsx`** — replaced NTF-3's inline bell-icon-plus-badge markup and its
`unreadCount`/`onNotificationsClick` props with a single `notificationBell: ReactNode` slot.
`TopBar.test.tsx`/`.stories.tsx` updated to match (badge/unread-count coverage moved to
`NotificationBell`'s own tests/stories).

**`shared/components/AppShell.tsx`** — now also calls `useNotificationBellData()` and renders
`<NotificationBell {...notificationBell} />` into `TopBar`'s new slot, alongside its existing
`useNotificationLiveSocket()` call (unchanged from NTF-3). Also now owns a shell-level
`SessionDetailModal` instance — see "Post-ship follow-up" below.

**E2E**: `e2e/mocks/handlers/notifications.ts` (new — `GET /notifications`, `GET
/notifications/unread-count`, `PUT /notifications/{id}/read`, session-scoped state, 2 unread + 1
read seeded notification referencing `mockSession`/`mockFriend`), registered in `handlers/index.ts`
and `mockServer.ts`'s `resetSession`. `e2e/flows/notification-bell.spec.ts` (new; see "Post-ship
follow-up" below for its final shape — a second `test()` was added same day).
`client/docs/E2E_OVERVIEW.md` catalog updated (§3 directory listing, §6 spec entry).

## Post-ship follow-up (2026-08-18, same day, before merge)

Two corrections made after the user tried the built feature, both applied in the same pickup:

**1. Bold styling + unread/read color treatment.** The user asked for text-bold on the actor
full name(s) and `entityTitle` only (not the whole sentence), plus a distinct unread vs. read
visual treatment: unread = light-blue bullet + black content; read = gray bullet + gray content
(the bullet previously went fully transparent/invisible when read, rather than a visible gray).
- `notificationText.ts`'s `getNotificationText` changed return type from `string` to
  `NotificationTextSegment[]` (`{ text, bold }[]`) — `notificationTextToString()` added for
  callers/tests that just want the plain sentence. Bold only ever applies to a real actor
  name/`"entityTitle"` segment, never a fallback ("Someone", "your session").
- `NotificationRow.tsx` renders each segment as its own `<span>` (`font-medium` when `bold`).
  Bullet: `bg-border-accent` (light blue, the app's existing focus-ring/highlight token) when
  unread, `bg-text-secondary` (gray) when read. Content text: `text-text-primary` (black) unread,
  `text-text-secondary` (gray) read — the whole-sentence `font-medium` unread styling from the
  first draft was dropped in favor of the new per-segment bolding.
- **Test-matcher fallout:** splitting one text node into multiple sibling `<span>`s broke RTL's
  default `getByText` (which only matches an element's *direct* text-node children, not full
  nested `textContent`) in several existing tests, and jsdom's accessible-name computation doesn't
  insert whitespace between adjacent segment spans either (so a `getByRole(..., {name: <exact
  sentence>})` match also broke). Fixed by matching on an element's full `textContent` via a small
  custom matcher function (`(content, element) => element?.textContent === expected`) instead of a
  plain string, in `NotificationRow.test.tsx`/`NotificationBell.test.tsx`. The visible/rendered text
  itself is unaffected — this was purely a test-query technique issue.

**2. Notification click opens the session in place — no navigation.** The user tried the built
feature and reported two things at once: the URL changing to `/matches?session={id}` on click, and
that the session modal should "just show... in the current page" without switching pages at all.
Investigating confirmed a concrete bug behind the second complaint too: `MatchesPage`'s own
`initialSessionId` is read from `?session=` **once, at mount** (`useMemo` with an empty dep array,
by original design — see that file's own comment) — so navigating to `/matches?session={id}` while
*already on* `/matches` silently did nothing, since the already-mounted page never re-reads the
param. Clicking a notification from any other page worked (fresh mount → param read correctly),
which is exactly the "only shows when current page != matches page" symptom the user described.

Fixed by removing the navigation entirely: `AppShell` now owns its own shell-level
`SessionDetailModal`, fed by `useSessionDetailModalData` (the same hook every page's own in-place
"View details" modal already uses) plus a new `useSportProfiles()` call for `sportsByKey` — both
newly added to `AppShell`. `useNotificationBellData` no longer imports `useNavigate` at all; it
now takes an `onViewSession: (sessionId: number) => void` callback (passed `setSelectedSessionId`
by `AppShell`) and calls it instead of navigating. The modal renders as a sibling of `<Outlet />`,
so it overlays whatever page the user is on — Home Feed, Groups, Friends, or even Matches itself —
with **zero URL changes**, matching the user's explicit ask.

`e2e/flows/notification-bell.spec.ts` updated: step 3 now asserts the URL stays exactly `/`
(Home Feed) across the click rather than becoming `/matches?session=1`. A second `test()` was added
— `Notification bell journey — clicking a notification while already on /matches` — as the direct
regression case for the bug this fix closes: seeds onto `/matches`, clicks a notification, and
confirms the modal opens with the URL still exactly `/matches`.

## Key decisions

- **`NotificationBell` is presentational, not self-fetching — a deliberate correction mid-build.**
  The first draft had `NotificationBell` call `useNotifications`/`useMarkNotificationRead`/etc.
  directly. That violates `client/CLAUDE.md`'s explicit convention ("components are presentational
  and controlled... page-level components own shared state") and, concretely, `UpcomingMatches`'
  own precedent — also a cross-page component, also fed entirely by props from whichever page hosts
  it, never self-fetching. Refactored: `useNotificationBellData.ts` (living at the `AppShell`
  level, since `AppShell` — not a page — is what owns the bell, matching how it already owns
  `useNotificationLiveSocket`/`useSportCatalog`/`useLogout`) owns every hook; `NotificationBell`
  takes 13 flat props. This also made Storybook coverage straightforward — this repo's Storybook
  config has no `QueryClientProvider` decorator or MSW addon, so a self-fetching component couldn't
  be storied at all without adding that infrastructure.
- **`Popover`, not `DropdownMenu`, backs the dropdown.** `DropdownMenu`'s `Content`/`Item`
  primitives apply roving-keyboard menu semantics meant for a flat list of actions — exactly the
  friction `shared/ui/popover.tsx`'s own comment already documents for CHAT-15's emoji picker. This
  dropdown needs a scrollable list of rows plus two independent action buttons ("Mark all read",
  "Load more") that must NOT auto-close the panel on click — `Popover`'s plain dismissible-container
  semantics fit; `DropdownMenu` would fight it.
- **`AppShell` owns its own shell-level `SessionDetailModal` instance, rather than the bell
  navigating to `/matches?session={id}`.** The first draft did navigate — reasoned (at the time)
  that `AppShell` has no page-local modal state to reach into the way `UpcomingMatches`' hosting
  pages (`HomeFeedPage`/`GroupsPage`/`FriendsPage`) each do via their own `useSessionDetailModalData`
  instance. That reasoning missed the simpler option: `AppShell` can just instantiate that same
  hook *itself* and render the modal as a sibling of `<Outlet />` — a page-agnostic overlay,
  available on every route, no navigation required. See "Post-ship follow-up" above for the full
  correction, including the real `MatchesPage`-mount-once bug the navigation approach also had.
- **"Mark all read" is scoped to currently-loaded unread notifications, not every unread
  notification that may exist.** No bulk endpoint exists (`PUT /api/notifications/{id}/read` is
  the only mutation NTF-1 shipped) — fetching every remaining page first just to mark it read would
  hide an unbounded number of network calls behind one click. If more unread notifications exist
  beyond what's loaded, the badge correctly still shows a nonzero count after "Mark all read" — this
  is documented behavior, not a bug.
- **Bug caught before it shipped: `onMutate` always resolves before `mutationFn` in TanStack
  Query.** The first draft of `useMarkAllNotificationsRead` read the unread-id set from cache
  *inside* `mutationFn` — but by the time `mutationFn` runs, `onMutate`'s optimistic flip has
  already marked everything read in the cache, so the id-collection read would always return `[]`
  and send zero `PUT` requests. Fixed by capturing the id set into a `useRef` inside `onMutate`
  (before the flip), read back by `mutationFn` — relies on `onMutate` always fully resolving before
  `mutationFn` starts, which is real, not incidental (verified against TanStack Query's own
  `Mutation#execute` order, and covered by this hook's own test).

## Out of scope

- Per-type notification preferences/mute UI (ticket's own stated scope, no backend support).
- Push notifications (Phase 4-5 mobile roadmap, per NTF-3's hybrid-delivery decision).
- A dedicated reconnect/backoff poller for a dropped STOMP connection — NTF-3's own scope note said
  CLIENT-NOTIF-1 "owns the poll fallback its own spec already calls for," but in practice the
  unread-count query's normal TanStack Query lifecycle (refetch on window refocus/remount) already
  gives a reasonable degraded experience without dedicated poll-interval code, and no reconnect
  logic was added to `useNotificationLiveSocket` itself (still NTF-3's as-built version, no
  `reconnectDelay` set). If a dropped-socket UX gap is found in practice, it's a follow-up, not
  silently declared solved here.
- Entity-title/actor resolvers for post/group/friend notification types — blocked on their own
  outbox-wiring tickets (B7/B21/U13) shipping real producers; `getNotificationText`'s `default` case
  and NTF-4's `entityTitle: null` fallback are what keep this forward-compatible without a crash
  once those land, not full support for them today.

## Verification

- **Backend (NTF-4):** `./gradlew :modules:notification:notification-impl:test
  :modules:session:session-impl:test` and full `./gradlew :server:test` — all pass, no regressions.
- **Client unit/component tests:** `pnpm exec vitest run` — full suite, 878 tests across 129 files,
  0 failures (includes the post-ship follow-up's bold/color assertions and the rewritten
  `useNotificationBellData`/`NotificationBell` tests for the callback-based, navigation-free API).
- **Typecheck/lint:** `pnpm exec tsc -b` and `pnpm lint` — clean (2 pre-existing unrelated warnings
  in `SessionStartTimePicker.tsx`).
- **Storybook:** `pnpm exec storybook build` — succeeds twice (before and after the follow-up),
  includes `NotificationRow`'s 5 stories and `NotificationBell`'s 6 stories
  (closed/loading/error/empty/populated/with-load-more).
- **E2E:** `pnpm e2e` (`--project=e2e`) — full 51-spec suite passes, including
  `notification-bell.spec.ts`'s two `test()`s (the 4-step journey, now asserting the URL stays
  unchanged across the click, plus the dedicated already-on-`/matches` regression case). Ran
  against the real built app + the standalone mock server (MSW-1), a real Chromium browser via
  Playwright — this stood in for the "walk the happy path in a browser" verification step; no
  Chrome-extension-based manual walkthrough was additionally performed, matching NTF-3's own note
  about that tooling not being available in this environment.
- Not separately live-verified against the real running Postgres/RabbitMQ backend end-to-end in
  this pass (unlike NTF-3's live verification) — NTF-4's own backend verification already ran the
  full `:server:test` suite including the real `NotificationAccessGateIntegrationTest`/
  `NotificationStompIntegrationTest`, and this ticket's e2e coverage exercises the real
  `NotificationResponse` shape (verified directly against the Java DTO source, not guessed).

**Divergence from the approved design:** the `NotificationBell`-presentational correction (made
during initial implementation, before first verification) and the two post-ship corrections above
(bold styling/colors, navigation → shell-level modal). All three are documented in place rather
than silently folded into the original design section, per this doc's own convention.

---

### CLIENT-NOTIF-1 · Notification bell/dropdown — live badge + list + mark-as-read
**Status:** `DONE` (2026-08-18) · **Summary:** `client/docs/CLIENT-NOTIF-1_NOTIFICATION_BELL_DROPDOWN.md`
**Type:** New Feature
**Depends on:** backend `modules/notification`'s NTF-1 (read endpoints), NTF-3 (STOMP live
delivery), and **NTF-4** (added below)

**Filed:** 2026-08-16, from the notification-module vision session —
`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`.

A notification bell in the shared `TopBar` (per the client's one-shell-everywhere convention):
unread-count badge, kept live via a STOMP subscription to `/user/queue/notifications` (falls back to
a poll if the socket disconnects — no dead badge on a lost connection). Dropdown list backed by
`GET /api/notifications` (`use<Feature>Data()` hook wrapping TanStack Query, real backend from day
one per this client's data-layer convention — no mock-data phase needed, the backend ships first).
Opening/clicking a notification calls `PUT /api/notifications/{id}/read`.

**Out of scope:** per-type notification preferences/mute UI (no backend support yet — single-table
v1, per the vision doc); push notifications (tracked separately under the Phase 4–5 mobile roadmap
in `PROGRESS.md`).

**Delta (2026-08-18, at pickup, before any code):** NTF-1 had deliberately shipped zero
actor-name/entity-title enrichment on `NotificationResponse` — raw `actorIds`, a bare `entityId`,
nothing readable. User decision: the notification API should build enough data for the client
(server-side denormalization, same precedent as `SessionResponse.createdByFullName`), not the
client resolving names/titles itself (no batch users-by-id endpoint exists client-side anyway).
Filed and built as its own backend ticket, **NTF-4** (`modules/notification/docs/BACKLOG_MVP.md`),
in this same session before any client code — `CLIENT-NOTIF-1` was built against NTF-4's real
shipped contract from the start. Also, "Mark all read" (not in the original ticket text, confirmed
with the user at pickup) was added, scoped to currently-loaded unread notifications only — no bulk
mark-read endpoint exists.

**Delta (2026-08-18, same day, post-ship follow-up before merge):** two corrections after the user
tried the built feature. (1) Notification text bolds only the actor full name(s) and `entityTitle`
(`getNotificationText` now returns segments, not a plain string); unread rows get a light-blue
bullet + black text, read rows a gray bullet + gray text (previously the read bullet went fully
transparent). (2) Clicking a notification no longer navigates to `/matches?session={id}` — it opens
a new shell-level `SessionDetailModal` (`AppShell`, fed by `useSessionDetailModalData`) directly on
whatever page the caller is on, with zero URL change. The navigation approach had a real bug the
user caught live: `MatchesPage`'s `?session=` param is read once at mount, so navigating to
`/matches?session={id}` while already on `/matches` silently did nothing. See
`client/docs/CLIENT-NOTIF-1_NOTIFICATION_BELL_DROPDOWN.md`'s "Post-ship follow-up" section for
full detail.
