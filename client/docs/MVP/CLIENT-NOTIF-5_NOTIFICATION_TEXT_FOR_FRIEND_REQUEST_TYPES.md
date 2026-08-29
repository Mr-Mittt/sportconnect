# CLIENT-NOTIF-5 · Notification text for `user.friend_request.created` and `user.friend_request.accepted`

**Status:** `DONE` (2026-08-29) — code + unit/e2e tests complete; the 3 `notification-bell-populated-*` visual baselines still need the `update-baselines` dispatch (see Verification).
**Type:** Bug Fix (display gap) — same shape as [CLIENT-NOTIF-3](CLIENT-NOTIF-3_NOTIFICATION_TEXT_FOR_MISSING_SESSION_TYPES.md)
**Depends on:** none — backend **U13** (`DONE` 2026-08-28) ships both events end to end (producer in
`modules/user/user-impl`, consumer in `modules/notification`).
**Filed:** 2026-08-28, at U13's `/workon` pickup (user decision: backend ships the producer +
consumer; client text case is its own ticket, exactly the habit
[CLIENT-NOTIF-4](CLIENT-NOTIF-4_NOTIFICATION_TYPE_COVERAGE_GUARD.md) exists to establish).

## The gap

U13 makes `modules/notification` write real `Notification` rows for two new routing keys:

| Type | `entityType` / `entityId` | Actor | Meaning |
|---|---|---|---|
| `user.friend_request.created` | `USER` / the sender's user id | the sender | someone sent you a friend request (a fresh one, or a re-send that reactivated a prior declined/cancelled/removed request) |
| `user.friend_request.accepted` | `USER` / the accepter's user id | the accepter | someone accepted the friend request you sent |

`client/src/features/notifications/notificationText.ts`'s `getNotificationText` switch has no case
for either, and `NotificationType` (`features/notifications/types.ts`) doesn't include them — so
today they render the generic `default:` fallback: **"You have a new notification"**. Not a crash
(the fallback is deliberate, dev-warns), just an uninformative row.

## What ships

1. **`NotificationType`** (`features/notifications/types.ts`) — add `'user.friend_request.created'`
   and `'user.friend_request.accepted'` to the union. Per CLIENT-NOTIF-4, the `const unhandled:
   never` assertion in `getNotificationText`'s `default:` branch then **fails the build** until both
   cases below exist — that's the intended forcing function, not a problem to work around.
2. **Two `getNotificationText` cases**, following the existing segment convention (bold on actor
   name(s) only — there is no entity title for a `USER` entity, so no `entitySegment` here):
   - `user.friend_request.created` → e.g. `[actor, plain(' sent you a friend request')]`
   - `user.friend_request.accepted` → e.g. `[actor, plain(' accepted your friend request')]`
   - exact wording is a product call at pickup; both have a real actor, so `actorSegment` is used
     (unlike `session.status.started`).
3. **Tests** — `notificationText.test.ts`: one case per new type. Keep the existing
   genuinely-unknown-type fallback case (its literal must stay unreal — see CLIENT-NOTIF-3/4).
4. **Storybook** — `NotificationRow` stories for the two new types if they introduce a visually
   distinct shape (both are `[actor, plain(...)]`, so likely one story is enough; match the
   precedent set by the `session.participant.joined`/`left` pair).
5. **MSW fixture** (`e2e/mocks/handlers/notifications.ts`) — add rows for the two new types if an
   e2e/visual spec renders the populated dropdown; seed them `isRead: true` so
   `notification-bell.spec.ts`'s unread-count assertions don't need rewriting (same technique
   CLIENT-NOTIF-3 used).
6. **Visual-regression baselines** — if the dropdown row count in `notification-bell-populated-*`
   changes, regenerate via the `update-baselines` dispatch (the HF-20 process), same as
   CLIENT-NOTIF-3.

## Navigation / click target (decide at pickup)

`entityType` is `USER` and `entityId` is the counterparty's user id. Whether tapping a
friend-request notification should route to that user's profile, to the Friends "pending requests"
view, or do nothing is a product/UX call — flag it, don't assume. This is display-text only unless
the pickup decides to wire navigation.

## Explicitly out of scope

No backend change — U13 already emits and consumes both events. No change to the `default:` fallback
or its dev warning. No notification aggregation/display changes beyond the switch cases (+ the
navigation decision above, if taken).

---

## Implementation (2026-08-29)

### Decisions locked at pickup

| Question | Decision |
|---|---|
| Text wording | `created` → `[**actor**, ' wants to be your friend']`; `accepted` → `[**actor**, ' is now your friend']`. Warmer than the terse verb-first session copy (user choice). |
| Click target | **Navigate to `/friends`** — the one notification type that navigates rather than opening a shell-level modal. |
| MSW / visual | Add fixture ids 6 + 7 (`isRead: true`); regenerate the 3 `notification-bell-populated-*` baselines via the `update-baselines` dispatch. |

**"Friends pending-requests view" resolved to `navigate('/friends')`.** There is no route, tab, or
deep-link for pending requests — they're the `friendRequestRows` section in `FriendRail`, which
defaults **expanded** (`useFriendsPageData`'s `collapsedSections.friendRequests: false`, local
state). So landing on `/friends` already shows incoming requests in the rail. Not pre-selecting the
sender in `friendsPageStore` — plain navigate, consistent with how the session case passes only an
id without pre-filling its target. A pre-select could be a later enhancement.

### What was built

1. **`types.ts`** — `'user.friend_request.created'` / `'user.friend_request.accepted'` added to the
   `NotificationType` union; comment updated to name both backend consumers (`SessionEventsConsumer`
   NTF-2, `UserEventsConsumer` U13). CLIENT-NOTIF-4's `const unhandled: never` guard then forced
   step 2 — `tsc -b` failed until the two cases existed (verified: the build was red on the union
   change alone, green after the cases).
2. **`notificationText.ts`** — two cases before `default:`:
   - `user.friend_request.created` → `[actor, plain(' wants to be your friend')]`
   - `user.friend_request.accepted` → `[actor, plain(' is now your friend')]`
   No `entitySegment` (a `USER` entity has no title); `actor` is `actorSegment` (bold name, or the
   bold-suppressed `'Someone'` fallback, which can't happen in practice — a self-request is
   rejected upstream). Function doc updated.
3. **`useNotificationBellData.ts`** — second param `onViewFriendRequests: () => void`; `onSelect`
   gains `else if (notification.entityType === 'USER') onViewFriendRequests();` after
   `setIsOpen(false)`. Doc comment rewritten to spell out the three `entityType` branches and that
   `USER` is the one that changes the route.
4. **`AppShell.tsx`** — `useNotificationBellData(setSelectedSessionId, () => navigate('/friends'))`;
   the CLIENT-NOTIF-1 comment block extended to note the friend-request navigation exception.
5. **`e2e/mocks/handlers/notifications.ts`** — fixture ids 6 (`user.friend_request.created`) and 7
   (`user.friend_request.accepted`), `entityType: 'USER'`, `entityId: mockFriend.id`,
   `isRead: true`, one actor (`mockFriend` / Priya Shah). The CLIENT-NOTIF-3 comment block extended
   to cover them. Unread count stays 2 — `notification-bell.spec.ts`'s badge/mark-all-read
   assertions untouched.
6. **Tests**
   - `notificationText.test.ts` — 2 rows added to the `it.each` render table; a new `it.each`
     asserting the friend cases bold only the actor (no entity segment). Fallback tests untouched
     (their literal stays unreal).
   - `useNotificationBellData.test.tsx` — `onViewFriendRequests` (`vi.fn()`) added to all 5 call
     sites; new test: `USER` entityType calls `onViewFriendRequests`, not `onViewSession`; the
     former "non-SESSION" (POST) test now also asserts `onViewFriendRequests` is not called.
   - `NotificationRow.stories.tsx` — `FriendRequestReceived` + `FriendRequestAccepted` stories
     (`entityType: 'USER'`, `entityTitle: null`).
   - `e2e/flows/notification-bell.spec.ts` — third `test()`: click the friend-request row → URL
     becomes `/friends`, popover closes.
7. **`docs/E2E_OVERVIEW.md`** — §3 listing, the per-file description + step table, and the
   `populated` visual-fixture row-count note all updated for the third test and the two new
   fixture rows.

### Divergence from the approved plan

None.

### Verification

- `pnpm build` (`tsc -b` + vite) — clean. The exhaustiveness guard was confirmed to fire on the
  union change before the cases were added.
- `pnpm lint` — 0 errors (2 pre-existing warnings in an untouched `SessionStartTimePicker.tsx`).
- `pnpm test` (Vitest) — **1034/1034** (153 files), was 1029 (+5).
- `pnpm e2e` — **75/75**, including the new
  `Notification bell journey — clicking a friend-request notification routes to /friends`. Full
  project run confirms the 2 added fixture rows broke nothing.
- **Storybook** — the two new stories typecheck via `tsc -b` (stories are in the main tsconfig);
  they're trivial `baseNotification` variants of the existing `NotificationRow` stories.
- **Visual regression — remaining step (not a pass).** The `notification-bell-populated-{375,768,1280}.png`
  baselines render `defaultNotificationsState`, now 7 rows instead of 5, so those 3 screenshots
  genuinely need regenerating. This cannot be done on a Windows host (the whole `visual-regression`
  project fails there on the documented Windows-vs-Linux font-rendering noise floor — see
  CLIENT-NOTIF-3's write-up). **To execute:** the HF-20 process — trigger the `client-ci` workflow's
  `update-baselines` manual dispatch, download the `visual-baselines` artifact, expect **exactly 3
  files** to change (`notification-bell-populated-*`) with everything else byte-identical, verify by
  SHA-256 + a human look that the two new rows read "Priya Shah wants to be your friend" /
  "Priya Shah is now your friend", commit. `notification-bell-empty-*` and
  `notification-bell-with-load-more-*` are unaffected (empty uses an override; with-load-more uses
  its own separate 11-item fixture).

### Delta for the epic spec

None — CLIENT-NOTIF-5 is a client-only display/nav ticket with no epic doc. The U13 backend
contract it consumes was already live-verified end to end at U13's own pickup.

---

## Scope expansion (2026-08-29, user request, same session)

After the plain-navigate version above was built, the user asked for more: clicking a friend-request
notification should **pre-select the requester** on the Friends page, and if that person can't be
resolved (request cancelled, or account deactivated) show an **info dialog** that the request is no
longer available — no pre-selection in that case.

### Decisions at pickup

| Question | Decision |
|---|---|
| Notice UI (no toast system exists) | **shadcn `Dialog`** — `FriendRequestUnavailableDialog`, modelled on `NoSportsToAddDialog`. Not adding a toast dependency (a `client/CLAUDE.md` stack conversation). |
| `user.friend_request.accepted` too? | **Yes** — `entityId` is a counterparty user id for both `USER` types, so both pre-select (the pending requester → Accept/Decline panel; the accepter → their friend profile) with the same fallback. |

### What was built (on top of the base implementation)

1. **`useNotificationBellData`** — `onViewFriendRequests` now takes the counterparty user id
   (`notification.entityId`); `AppShell` passes it as router state:
   `navigate('/friends', { state: { focusPersonId } })`.
2. **`FriendsPage`** — reads `location.state.focusPersonId` **live** (not copied into state — a
   React-Compiler-friendly choice, see below), passes it to `useFriendsPageData`, and exposes
   `clearFocusState` (`navigate(pathname, { replace: true, state: null })`) as the dialog's
   `onClose`.
3. **`useFriendsPageData(focusPersonId?)`** — one effect seeds `selectedPersonId` from the focus id
   (Zustand setter only, same shape as the existing auto-clear effect). `focusUnavailable` is
   **purely derived** each render: `focusPersonId set && lists settled && that id is in none of
   friends/received/sent`. It flips true on its own once the lists settle without the person, and
   back to false when the person reappears or `FriendsPage` drops the router state. No stored flag,
   no `setState` inside an effect, no `ref` reads during render — the first two attempts
   (`useState` + effect, then `ref` + derived) each hit a distinct React-Compiler lint error
   (`Calling setState synchronously within an effect`, then `Cannot access refs during render`);
   deriving straight from the prop is what the linter actually wants.
4. **`FriendRequestUnavailableDialog`** (`features/friends/components/`) — `Dialog` +
   `DialogHeader title="Friend request unavailable"` + copy + a "Got it" button. `.test.tsx`
   (3 cases) + `.stories.tsx` (Open).
5. **MSW** — notification fixture id 6's actor changed to **Hana Kim** (`hana-kim`, who has a real
   pending incoming request in `handlers/friends.ts`) so the happy pre-select path resolves to the
   Accept/Decline panel. New mockServer action `seed-unavailable-friend-request-notification` +
   `seedUnavailableFriendRequestNotification(sessionId)` helper — one unread notification pointing
   at `ghost-requester` (unknown to `handlers/friends.ts`, 404s from `GET /api/users/{id}`).
6. **Tests** — `useNotificationBellData.test.tsx`: the USER test asserts `onViewFriendRequests` is
   called *with* the entityId. `useFriendsPageData.test.tsx` +4: pre-select resolves to
   `PENDING_RECEIVED`; `focusUnavailable` raised for an id in no list (and `selectedPersonId`
   cleared); a plain stale sessionStorage selection still clears **silently** (no dialog);
   `focusUnavailable` derives back to false once the focus prop is dropped.
   `notification-bell.spec.ts`: the pre-select test (Hana Kim → Accept/Decline visible) and a new
   unavailable-dialog test (Sam Rivera → dialog → "Got it" → placeholder).

### Known minor behavior

The router `location.state` is kept until dismiss / navigate-away (it has to persist for
`focusUnavailable` to stay truthful). A literal browser **reload** on `/friends` while that state
is live re-seeds the same selection — benign (the person is still there, or the dialog re-shows for
a still-missing one). A normal in-app navigation to `/friends` carries no state, so this only
affects an explicit reload.

### Follow-on: "Cancel request" button (2026-08-29, user request, same session)

To actually exercise the "unavailable" dialog end to end you need a way to withdraw an outgoing
request (sender cancels → recipient's `friend_request.created` notification goes stale). The client
had no such control — `FriendProfilePanel`'s `PENDING_SENT` state was a lone disabled "Waiting for
response" button. Backend endpoint already exists (`DELETE /api/users/friends/requests/{requestId}`,
U1's `cancelFriendRequest`), so this is client-only:

- **`useCancelFriendRequest`** hook — `DELETE`, invalidates `friendKeys.all`; same shape as
  `useDeclineFriendRequest` / `feed`'s `useCancelJoinRequest`.
- **`useFriendsPageData`** — the `PENDING_SENT` branch of `selectedPerson` now carries the real
  `requestId` (was hard-coded `null` — only `PENDING_RECEIVED` needed it before); adds
  `cancelRequest` / `isCancellingRequest`, and clears the selection on success (same as decline).
  `SelectedPerson.requestId`'s doc updated.
- **`FriendProfilePanel`** — `PENDING_SENT` now renders a "Waiting for response" status label + a
  "Cancel request" outline button (`onCancel` prop). `FriendsPage` wires it like `onDecline` and
  folds `isCancellingRequest` into `isActionPending`.
- **MSW** — new `DELETE /api/users/friends/requests/:requestId` handler in `handlers/friends.ts`
  (drops the row from `sentRequestsState`).
- **Tests** — `FriendProfilePanel.test/stories` PENDING_SENT updated (status + Cancel button);
  `useFriendsPageData.test` — PENDING_SENT now asserts the real `requestId`, plus a cancel test
  (DELETE called, selection cleared); `friends-journey.spec.ts` gains a step (select the outgoing
  Diego Alvarez request → Cancel → row gone).

### Verification (re-run after both expansions)

- `pnpm build` (`tsc -b` + vite) — clean.
- `pnpm lint` — 0 errors (2 pre-existing warnings, untouched file). Both intermediate
  `focusUnavailable` implementations that tripped React-Compiler lint errors were reworked, not
  suppressed.
- `pnpm test` — **1042/1042** (154 files).
- `pnpm e2e` — **76/76**, incl. the new/changed `notification-bell.spec.ts` and
  `friends-journey.spec.ts` (now 7 steps) cases.
- Visual baselines: the `notification-bell-populated-*` set still needs the `update-baselines`
  dispatch (id 6's actor name changed from "Priya Shah" to "Hana Kim" on top of the two added
  rows; still exactly the 3 `-populated-` files). The Cancel button is on `/friends`, not in any
  baselined screenshot.
