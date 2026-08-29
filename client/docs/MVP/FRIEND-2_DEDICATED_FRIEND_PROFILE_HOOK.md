# FRIEND-2 · Dedicated friend-profile hook, off the borrowed `useUserProfile`

**Status:** `DONE` 2026-08-29 · **Type:** Cleanup · **Depends on:** ~~backend **U14**~~ — **U14
`DONE` 2026-08-29, resolved to no backend change** (see Delta below and
`modules/user/user-impl/docs/MVP/U14_DEDICATED_FRIENDS_DIRECTORY_PROFILE_ENDPOINT.md` § Resolution)

**Filed:** 2026-08-26, at `PROFILE-0` client pickup — user decision.

## Delta from U14 (2026-08-29) — read before implementing

U14 collapsed to nothing new on the backend: U11 already narrowed `GET /api/users/{userId}` to
`UserInfoResponse` — `{ id, fullName, username, avatarUrl, coverUrl, bio }`, gated
`@PreAuthorize("hasRole('USER')")` (no longer public). That is exactly what Friends needs, plus
`username`. So this ticket is purely the client feature-folder cleanup — **no new endpoint, no new
backend DTO to wait on.**

Concretely for this ticket:

1. `useFriendProfile(userId)` in `features/friends/hooks/` calls `GET /api/users/{userId}` (auth'd —
   every Friends page already sits behind `ProtectedRoute`, so the U11 auth requirement is a
   non-issue) and types its result **1:1 with `UserInfoResponse`**: all six fields, including
   `username: string | null` (user decision at U14 pickup) — even though `FriendProfilePanel`
   renders only `fullName` / `bio` / `avatarUrl` / `coverUrl` today.
2. While here, correct the three now-stale doc comments U14 deliberately left for this ticket, since
   they all still describe the pre-U11 "public / full `UserResponse`" behavior:
   `features/profile/useUserProfile.ts` docstring, `features/profile/types.ts` (`UserResponse` doc),
   `features/friends/types.ts` (`FriendUser` "sourced from `UserResponse`").
3. `useFriendsPageData.ts` switches from `@/features/profile/useUserProfile` to the new hook;
   `features/profile/useUserProfile` then has no importer outside `features/profile/` — decide at
   that point whether to inline it into `useMyProfile` / delete it (per the original step 3 below).

### Scope locked at pickup (2026-08-29, `/workon client MVP FRIEND-2`)

Three refinements decided with the user before Phase 2 — these supersede the wording above where
they differ:

- **Hook name + location:** `useUserInfo` (mirrors the backend `UserInfoResponse` DTO name), at the
  **feature root** `features/friends/useUserInfo.ts` — next to `useFriendsPageData.ts`, *not* under
  `features/friends/hooks/`. (The Delta above said `useFriendProfile` in `hooks/`; renamed here.)
- **Old hook:** **delete `features/profile/useUserProfile.ts`.** After `useFriendsPageData` moves to
  `useUserInfo` it has zero importers, and `features/profile/useMyProfile.ts` already owns the
  `GET /users/me` own-profile case for the Profile page — so it's dead code, not a generic worth
  keeping.
- **`features/profile/` split confirmed:** the Profile page keeps its own hooks (`useMyProfile` on
  `/users/me`); Friends owns `useUserInfo` on `/users/{userId}`. No shared by-id hook.

Scope-change gate: user confirmed nothing to add or remove beyond the above.

### Scope change (2026-08-29, same session, post-implementation) — unfriend action added

**Why:** while reviewing the shipped hook cleanup the user noted the Friends feature has never had
an unfriend control — `FriendProfilePanel`'s `FRIENDS` state renders no action bar at all (a
FRIEND-1 gap, not a FRIEND-2 one). User decision: fold the fix into this ticket rather than file a
separate FRIEND-3, and ship it in the same PR.

**Added requirement:** in `FriendProfilePanel`, the `FRIENDS` state shows a single `Friend ▾`
button that opens a dropdown menu (`Unfriend` only, for now). Selecting `Unfriend` opens a
chrome-light confirm dialog — no header bar / close X, just the prompt **"Do you really want to
unfriend {name}?"** and two buttons ordered **Unfriend** (danger) **then Cancel** (user decision —
reverse of `DeleteGroupConfirmDialog`). The dialog is **viewport-centered** (`DialogContent
centered`), not anchored below the Friends page's pill row like other modals there. The
`DialogTitle` is kept `sr-only` for the a11y name Radix requires. Confirming fires the
**pre-existing** `DELETE /api/users/friends/{friendId}` (U1 `removeFriend`), invalidates
`friendKeys.all`, and clears the selection (same as decline/cancel).

**Added acceptance criteria:** menu keyboard-reachable; confirm button + menu item disabled while
the mutation is pending; mutation error rendered inline in the dialog (`role="alert"`) and
`reset()` on dialog close so it can't survive a reopen (`CLIENT-MODAL-1`).

**Still out of scope:** any other menu item (block / report / mute); unfriend from the rail list
rows; any notification on unfriend (consistent with decline being silent, per the U13 session);
optimistic removal / undo.

### Second scope change (2026-08-29) — accept keeps the requester selected

**Why:** on the receiver's Friends page, selecting an incoming request and clicking **Accept** was
dropping the selection instead of showing the new friend. Root cause: `acceptRequest` invalidates
`friendKeys.all`, so `received` and `friends` refetch independently — with the auto-clear effect
gated only on `isLoading`, a render where `received` had lost the just-accepted person but `friends`
hadn't gained them yet looked like "resolves to nobody" and cleared the selection.

**Added requirement:** after Accept, the requester **stays selected** and the panel re-resolves them
to `FRIENDS` (their now-friend profile). After Decline, the selection clears (unchanged — already
the behaviour). Fix: widen the auto-clear effect's `hasSelectionSourcesSettled` gate from
`isLoading` to `isFetching` on the friends/received/sent (and search) queries, so a background
refetch also defers the verdict until every list has settled — by which point the accepted person
is in `friends`.

### Third bug (2026-08-29) — "Friend request unavailable" dialog after accept-then-unfriend via a notification

**Repro (notification path only):** B opens A's friend request *via the notification*, Accepts (the
`Friend` button shows), then immediately Unfriends A → the "Friend request unavailable" dialog
wrongly appears. Going to `/friends` directly (no `focusPersonId`) works fine.

**Cause:** `focusUnavailable` is purely derived from `focusPersonId` + the live lists and stayed
live for as long as the router state carried the id. After unfriend, A is in no list again →
`focusUnavailable` flips back true → dialog. The dialog is only meant for "the notification pointed
at someone already gone *on arrival*".

**Fix (in `FriendsPage`, not the hook — a render-phase ref latch tripped the `react-hooks` lint,
same wall CLIENT-NOTIF-5 hit):** the hook now also returns `focusResolved` (true once the focus
person turns up in a friend/request list). `FriendsPage` `useEffect`s on it and, when true, strips
`focusPersonId` from the router state (`navigate(pathname, { replace: true, state: null })`). So the
one-shot intent is actually consumed the first time it resolves — `focusUnavailable` can then only
fire on the arrival render(s). The genuine "gone on arrival" case never sets `focusResolved`, so the
state lingers until the dialog's own "Got it" dismiss; a re-sent request that reappears sets it and
closes the dialog, same as before.

### Fourth bug (2026-08-29) — stale "X is now your friend" notification opens the unavailable dialog

**Repro (a variant the third fix doesn't cover):** A sends B a request and **stays on `/friends`**.
B accepts then unfriends. A then clicks the (now-outdated) "B is now your friend" notification →
"friend request unavailable" dialog shows. If A had *left* `/friends` and come back via the
notification, no dialog — because the fresh mount vs. a same-route re-navigation behave differently
around `hasSelectionSourcesSettled`.

**Cause + fix:** the dialog was firing for **both** friend-request notification types. It only makes
sense for `user.friend_request.created` ("wants to be your friend" — a pending request that may be
gone). For `user.friend_request.accepted` ("is now your friend") there is no request for
"no longer available" to describe, and "they unfriended you since" isn't a modal-worthy error — it
should just land on `/friends`. So the notification type now rides along as
`location.state.focusReason` (`'created' | 'accepted'`, set in `useNotificationBellData` →
`AppShell`), and `useFriendsPageData` only computes `focusUnavailable` when `focusReason !==
'accepted'`. This makes the "stayed on the page" and "left and came back" paths behave the same for
an `accepted` notification (no dialog either way).

### Fifth enhancement (2026-08-29) — cancelling your own request keeps the person selected

**Ask:** withdrawing your own outgoing request (`PENDING_SENT` → "Cancel request") was dropping the
selection back to the empty "Select a friend…" placeholder. Keep the person selected instead — an
accidental cancel or a change of mind is common, and the panel re-resolving them to `NONE` ("Send a
friend request") is the useful next step.

**Fix:** `cancelRequest`'s `onSuccess` records the id in a new `keepSelectedAfterCancelIdRef`
instead of nulling `selectedPersonId`; the auto-clear effect skips any id that matches the ref, so
the person survives and re-resolves to `NONE`. A **ref, not `useState`** — a first `useState`
attempt worked in unit tests but not e2e: RQ v5's `useQuery` uses `useSyncExternalStore`, so the
post-`onSettled` refetch forces a synchronous re-render that can run the auto-clear effect *before*
the `onSuccess` `setState` flushes, clearing the selection anyway. The ref is written synchronously
in `onSuccess` (before `onSettled` even starts the refetch), so the effect always sees it. It's
mount-scoped, so a stale selection restored from `sessionStorage` on a later visit still clears, and
`selectPerson` clears the ref when the user picks someone else. Decline and unfriend still clear
(unchanged — different intent).

**Scope-change gate:** user confirmed nothing further to add or remove.

## Why

`useFriendsPageData.ts`'s directory-search profile popup calls `useUserProfile(userId)`, which now
lives in `features/profile/` (moved there at `PROFILE-0` pickup, since it's a generic "look up any
user's public profile by id" concern, not friends-specific) but is still typed to Friends' own
narrow `FriendUser` shape and still hits the same public `GET /api/users/{userId}` endpoint
`useMyProfile()` uses for the logged-in user's own full profile. Friends borrowing a hook that now
belongs to a different feature, off an endpoint shaped for someone else's use case, is exactly the
kind of coupling this repo's feature-folder convention exists to avoid — it just hasn't been fixed
yet, and doesn't need to block `PROFILE-0`.

## What ships

Once backend **U14** lands (a Friends-specific endpoint, or confirmation that U11's
`PublicUserResponse` narrowing of the shared endpoint already covers everything `FriendUser` needs
— see U14's own doc for which):

1. A `useFriendProfile(userId)` hook (or a rename of the existing call site, if U14 collapsed to no
   new endpoint) living in `features/friends/hooks/`, typed against whatever U14 actually shipped.
2. `useFriendsPageData.ts` switches from `@/features/profile/useUserProfile` to this new hook.
3. `features/profile/useUserProfile` stops being imported outside `features/profile/` — if nothing
   else in the app still needs the generic by-id public lookup at that point, evaluate whether it
   should be inlined into `useMyProfile`/deleted rather than kept as an unused generic export
   (decide at pickup, don't assume either way now).

## Explicitly out of scope

Any change to `useMyProfile()` or anything else in `features/profile/` — this ticket only touches
the Friends feature's own consumption. Designing U14's actual response shape — that's U14's own
ticket, this one just consumes whatever it ships.

---

## Implementation summary (2026-08-29 · `DONE`)

### Approved plan (Phase 3)

Pure client feature-folder cleanup, no backend surface touched. `GET /api/users/{userId}` was
verified to return `ApiResponse<UserInfoResponse>` = `{ id, fullName, username, avatarUrl, coverUrl,
bio }`, `@PreAuthorize("hasRole('USER')")` — a superset of what the Friends directory-search popup
needs, and `useMyProfile` already owns the own-profile case via `GET /api/users/me`, so the by-id
hook has exactly one consumer.

1. **Types** — add `UserInfo` to `features/friends/types.ts`, doc'd 1:1 with backend
   `UserInfoResponse` (six fields, `username: string | null`). Correct `FriendUser`'s stale comment
   to say it's the projection of `GET /api/users/friends`'s `UserResponse[]` **list rows**
   specifically, cross-referencing `UserInfo` for the by-id case.
2. **New hook** — `features/friends/useUserInfo.ts` at the feature root (next to
   `useFriendsPageData.ts`, not under `hooks/`), mirroring the old hook exactly: `useQuery`, key
   `friendKeys.profile(userId ?? '')`, `apiClient.get<ApiResponse<UserInfo>>('/users/${userId}')`,
   `enabled: userId !== undefined`.
3. **New test** — `features/friends/useUserInfo.test.tsx`: `enabled` gating + URL + envelope
   unwrap, matching the `features/profile/useMyProfile.test.tsx` sibling pattern.
4. **`useFriendsPageData.ts`** — swap the import to `./useUserInfo`, rename the call and the three
   doc-comment mentions. `baseSelectedPerson: FriendUser | undefined` left unchanged (`UserInfo` is
   structurally assignable to `FriendUser`).
5. **Delete `features/profile/useUserProfile.ts`** — zero importers after step 4.
6. **`features/profile/types.ts`** — drop the `useUserProfile … narrows to FriendUser` sentence
   from the `UserResponse` docstring; note that by-id lookups return `UserInfoResponse`, and
   `useMyProfile` is the sole `UserResponse` consumer.
7. **MSW** — add `username` to `e2e/mocks/handlers/friends.ts`'s `GET /api/users/:userId` response
   so the mock stays 1:1 with the real `UserInfoResponse` (`KNOWN_USERS` already carries it).

### What was built

Built exactly as planned, no divergence. Files:

- `client/src/features/friends/types.ts` — added `UserInfo` interface; rewrote the `FriendUser`
  comment.
- `client/src/features/friends/useUserInfo.ts` — **new**, the Friends-owned by-id hook.
- `client/src/features/friends/useUserInfo.test.tsx` — **new**, 2 cases.
- `client/src/features/friends/useFriendsPageData.ts` — import + call renamed to `useUserInfo`;
  3 doc comments updated. No logic change.
- `client/src/features/profile/useUserProfile.ts` — **deleted**.
- `client/src/features/profile/types.ts` — `UserResponse` docstring corrected.
- `client/e2e/mocks/handlers/friends.ts` — `GET /api/users/:userId` now returns a `UserInfo`
  (adds `username`); import widened.

### Key decisions

- **`UserInfo` is a new interface, not a reshaped `FriendUser`.** The two map to genuinely
  different backend DTOs (`UserResponse` list rows from `/users/friends` vs. `UserInfoResponse`
  from `/users/{userId}`), so per this repo's "type 1:1 against the real DTO" convention they stay
  distinct even though `UserInfo` = `FriendUser` + `username`.
- **Query key `friendKeys.profile` kept as-is.** It was referenced only by the deleted hook; no
  mutation targets it by name (they blunt-invalidate `friendKeys.all`, a prefix), so reusing it in
  `useUserInfo` keeps invalidation working with zero churn.
- **`baseSelectedPerson` annotation left at `FriendUser | undefined`.** `UserInfo` is structurally
  assignable; `selectedPerson` stays `FriendUser`-shaped and the unrendered extra `username` is
  harmless. Widening it would have rippled into `SelectedPerson` for no user-visible gain — out of
  scope.
- **No dedicated live-backend browser walk.** `GET /api/users/{userId}` is unchanged by this
  ticket — same URL, method, and (already-verified at U11 / PROFILE-0) `UserInfoResponse` shape;
  the only client-side delta is adding the `username` field the real response already carries.
  Re-confirmed via the `notification-bell` + `friends-journey` e2e flows against the updated MSW
  handler rather than spinning up `:server:bootRun` for an endpoint with no backend change.

### Verification

- `pnpm exec tsc -b` — clean.
- `pnpm lint` — 0 errors (2 pre-existing warnings in unrelated `SessionStartTimePicker.tsx`).
- `pnpm test` — 155 files / 1044 tests pass, incl. new `useUserInfo.test.tsx` and the unchanged
  `useFriendsPageData.test.tsx` / `FriendsPage.test.tsx` (both spy `apiClient.get` at the URL
  level, so the hook rename is invisible to them).
- `pnpm e2e friends-journey` — 1 pass. `pnpm e2e notification-bell` — 4 pass (covers the
  friend-request focus → `GET /api/users/:id` 404 → unavailable-dialog path).

### Visual-regression expectation (hook cleanup)

No baselined surface touched — so no baseline change is expected; a failing `visual-regression` run
would be the Windows font-rendering noise floor, not a regression. Not run.

---

## Implementation summary — unfriend action (2026-08-29 scope change)

### What was built

Built as planned in the scope-change block above. Files:

- `client/src/features/friends/hooks/useUnfriend.ts` — **new** mutation hook: `DELETE
  /users/friends/{friendId}`, `onSettled` → invalidate `friendKeys.all`. In `hooks/` with the
  other 4 friend mutations (the "feature root" location was `useUserInfo`-specific). No standalone
  test — covered via `useFriendsPageData.test.tsx`, same as `useAccept/Decline/Cancel/Send`.
- `client/src/features/friends/components/UnfriendConfirmDialog.tsx` (+`.test.tsx` +`.stories.tsx`)
  — **new**. Chrome-light (user decision): `Dialog`/`DialogContent centered` + an `sr-only`
  `DialogTitle` (`Unfriend {name}?`, for the a11y name Radix requires) — **no `DialogHeader`**, so
  no visible title bar or close X. Visible body is a single prompt, `"Do you really want to unfriend
  {name}?"`; `isError` still renders an inline `role="alert"` line. Buttons ordered **Unfriend then
  Cancel** (user decision). `isOpen/onClose/onConfirm/isSubmitting/isError/personName` props;
  danger-outline confirm button labelled `Unfriend` / `Unfriending…`. Dismissable via Cancel /
  Escape / outside-click. **`onOpenAutoFocus` is prevented so no button is focused on open** (user
  decision) — Radix's default would focus the DOM-first `Unfriend` button, and pre-focusing a
  destructive action invites a stray Enter. Radix still traps Tab within the dialog and Escape
  still dismisses.
- `client/src/shared/ui/dialog.tsx` — **new `centered?: boolean` prop** on `DialogContent`
  (default `false`, so every existing modal is unchanged): forces the viewport-centered position
  even inside a `ModalAnchorProvider`. `dialog.test.tsx` gains a case for it.
- `client/src/features/friends/components/FriendRequestUnavailableDialog.tsx` — CLIENT-NOTIF-5's
  dialog, opted into `centered` in the same pass (user request) so it too sits dead-centre on the
  Friends page instead of anchoring below the pill row. No other change; no visual baseline covers
  it.
- `client/src/features/friends/components/FriendProfilePanel.tsx` — the `FRIENDS` branch of the
  action bar now renders a compact `Friend ▾` `Button` (`variant="outline"`, `size="sm"` + `h-7`
  ≈80% of default height per user review, `IconChevronDown` `size-3.5` aria-hidden) → `DropdownMenu`
  (this instance restyled via `className`: `w-42` ≈70% of the shared `w-60`, tighter `p-1` / item
  `py-1.5` ≈80% height — the shared `dropdown-menu.tsx` primitive is untouched) → one danger
  `Unfriend` `DropdownMenuItem` → local `isUnfriendConfirmOpen` state → `UnfriendConfirmDialog`.
  New props: `onUnfriend`, `onUnfriendDialogClose` (calls the parent's `resetUnfriend`),
  `isUnfriendError`. Pending stays folded into the existing `isActionPending`.
- `client/src/features/friends/components/FriendProfilePanel.test.tsx` — the old "renders no action
  bar for an existing friend" case became "shows only the Friend menu button"; +3 cases (menu →
  dialog → confirm calls `onUnfriend`; dialog close calls `onUnfriendDialogClose`; error renders in
  the dialog).
- `client/src/features/friends/components/FriendProfilePanel.stories.tsx` — `Friends` story comment
  updated; new props added to `meta.args`.
- `client/src/features/friends/useFriendsPageData.ts` — wires `useUnfriend`; exposes
  `unfriend(friendId)` (`onSuccess` → clear selection, like decline/cancel), `isUnfriending`
  (OR'd into the panel's pending), `isUnfriendError`, `resetUnfriend`. **Second scope change:**
  `hasSelectionSourcesSettled` now gates on `isFetching` (not `isLoading`) for the
  friends/received/sent/search queries, so the auto-clear effect waits out a background refetch —
  this is what keeps the just-accepted requester selected instead of dropping them in the window
  between `received` losing them and `friends` gaining them. `acceptRequest` gains an explaining
  comment (it deliberately does *not* clear, unlike decline/cancel/unfriend). **Third bug fix:** the
  hook returns `focusResolved` (focus person is in a friend/request list); the fix lives in
  `FriendsPage` (below). **Fourth bug fix:** new `focusReason?: 'created' | 'accepted'` param —
  `focusUnavailable` is now `false` whenever `focusReason === 'accepted'`. **Fifth enhancement:**
  `cancelRequest` `onSuccess` records `keepSelectedAfterCancelIdRef` (a new mount-scoped `useRef` —
  see the section above for why a ref, not state) instead of clearing the selection; the auto-clear
  effect skips a `selectedPersonId` matching the ref, and the person re-resolves to `NONE`.
  `selectPerson` (now wrapped) clears the ref on the next selection. (`useRef` added to the react
  import.)
- `client/src/features/friends/FriendsPage.tsx` — `useEffect` on `data.focusResolved`: once true,
  strips `focusPersonId` from the router state, so a later user-caused disappearance
  (accept-then-unfriend) can't re-raise `focusUnavailable`. (`useEffect` added to the react import.)
  Also reads `location.state.focusReason` and passes it to `useFriendsPageData`.
- `client/src/features/notifications/useNotificationBellData.ts` — `onViewFriendRequests` gains a
  `kind: 'created' | 'accepted'` arg (from `notification.type`).
- `client/src/shared/components/AppShell.tsx` — forwards `kind` as `state.focusReason`.
- `client/src/features/friends/useFriendsPageData.test.tsx` — +1 (unfriend DELETEs + clears
  selection); +1 (accept keeps the requester selected → `FRIENDS`); +2 (`focusResolved` true/false);
  +1 (an `'accepted'` focus never raises `focusUnavailable`); the cancel test now asserts the person
  **stays** selected, re-resolved to `NONE` (was "clears the selection").
- `client/src/features/notifications/useNotificationBellData.test.tsx` — the `created` case asserts
  `('hana-kim', 'created')`; +1 case for `('diego', 'accepted')`.
- `client/src/features/friends/FriendsPage.test.tsx` — +1 (`focusPersonId` arrival, Accept →
  Unfriend, no dialog); +1 (`focusReason: 'accepted'` arrival for a vanished person, no dialog).
  New `focusWrapper(personId, reason?)` helper seeds `location.state`.
- `client/e2e/mocks/mockServer.ts` / `fixtures.ts` — new `seed-stale-accepted-friend-notification`
  admin action (`user.friend_request.accepted`, `entityId` matches nobody).
- `client/e2e/flows/notification-bell.spec.ts` — the "pre-selects the requester" test now also
  Accepts + Unfriends Hana and asserts no unavailable dialog (third-bug guard); **new test**: a
  stale "is now your friend" notification lands on `/friends` with no dialog (fourth-bug guard).
- `client/src/features/friends/FriendsPage.tsx` — passes the 3 new props; `data.isUnfriending`
  added to the `isActionPending` OR.
- `client/src/features/friends/FriendsPage.test.tsx` — the stale "no action bar (already friends)"
  case retitled + now asserts the `Friend` menu button is present.
- `client/e2e/mocks/handlers/friends.ts` — **new** `http.delete('/api/users/friends/:friendId')`:
  drops the row from `friendsState`, `400` if the pair aren't in `friendsState`. Single-segment
  `:friendId` never shadows the earlier `requests/:requestId` route.
- `client/e2e/flows/friends-journey.spec.ts` — step 3 now also asserts the `Friend` button; **step
  5** now asserts a cancelled request keeps the person selected (panel shows "Send a friend
  request", not the placeholder); **step 7** now asserts the accepted requester stays selected
  (panel shows the `Friend` button, not the empty-selection placeholder); **new step 8** drives
  Friend → Unfriend → confirm and asserts the friend leaves the list + the panel clears.
  `client/docs/E2E_OVERVIEW.md` §6 updated (7 → 8 steps).

### Key decisions

- **Folded into FRIEND-2, not a new FRIEND-3** (user decision) — ships in the same PR. FRIEND-2's
  title/summary were amended so the Done record reflects the added action.
- **Confirm-dialog back-out labelled `Cancel`, not `Discard`** (user decision) — matches every
  other confirm dialog in the client (`DeleteGroupConfirmDialog`, `RejectInvitationConfirmDialog`).
- **Dialog copy + chrome iterated with the user (2026-08-29).** Landed on a single reconsider-style
  question, `"Do you really want to unfriend {name}?"` — verb kept as `unfriend` (not `disconnect`)
  to match the button/menu/title vocabulary, and no trailing "you can re-add later" reassurance
  (user decision). Visible title bar dropped entirely; the `sr-only` `DialogTitle` keeps the dialog
  named for assistive tech. Buttons reordered to **Unfriend then Cancel**. Dialog forced
  viewport-centered via a new `DialogContent centered` prop (the Friends page's `ModalAnchorProvider`
  would otherwise pin it below the pill row). `Friend` button and the menu were also shrunk to
  ~80% / ~70% after a Storybook review.
- **`Friend` menu button is the whole `FRIENDS` action bar** — no separate always-visible
  "Unfriend". The menu is deliberately a single item now; block/report/mute are explicit
  non-goals, but the `DropdownMenu` is the extension point when they're scoped.
- **Mutation-error lifecycle follows `CLIENT-MODAL-1`** — `FriendProfilePanel` calls
  `onUnfriendDialogClose` (→ `unfriendMutation.reset()`) whenever the confirm dialog closes, so a
  failed attempt's error can't reappear when the dialog is reopened for the same person. The panel
  is also `key={person.id}`-remounted per selection, which resets the local `isUnfriendConfirmOpen`
  for free.
- **Pending folded into the existing `isActionPending` prop** rather than a new `isUnfriendPending`
  — the panel only ever has one action in flight at a time, and the existing prop already gates
  every other action button the same way.

### Verification (unfriend action — final, after all UI iterations)

The `Friend` button size, the menu size, the dialog copy/chrome, the button order, the
viewport-centering, and the no-autofocus behaviour were each iterated with the user against
Storybook before this final run.

- `pnpm exec tsc -b` — clean.
- `pnpm lint` — 0 errors (same 2 pre-existing warnings in `SessionStartTimePicker.tsx`).
- `pnpm test` — **156 files / 1056 tests pass** (was 155 / 1044 → +`UnfriendConfirmDialog.test.tsx`
  with 7 cases, +1 `dialog.test.tsx` `centered` case, +1 `FriendProfilePanel` menu/dialog case,
  +1 `useFriendsPageData` unfriend case; net after the `useUserInfo` cleanup's own +9).
- `pnpm e2e friends-journey` — **1 pass** with the new step 8 (real built app + MSW: `Friend` →
  `Unfriend` menuitem → confirm dialog → `DELETE /users/friends/{id}` → friend row gone, panel back
  to the placeholder). An earlier run failed at `page.goto` — CPU contention with a
  concurrently-running full `vitest` suite, not a real failure; passed clean in isolation, same
  Windows flake class noted in CLIENT-NOTIF-5's write-up.
- `pnpm e2e notification-bell` — **4 pass**, including the vanished-requester →
  `FriendRequestUnavailableDialog` path (that dialog is now `centered` too).
- No separate live-backend walk: `DELETE /api/users/friends/{friendId}` is a pre-existing,
  unchanged U1 endpoint (`removeFriend`, `ApiResponse<Void>`, `hasRole('USER')`); the e2e flow
  drives the real built React app end to end against it via MSW.

### Visual-regression expectation (unfriend action)

`FriendProfilePanel`'s `FRIENDS` state gains a rendered `Friend` button, but **no `visual/` spec
covers `FriendProfilePanel`** — there is no `app-friends.spec.ts`, and the `profile-*` / friends
`notification-bell` baselines don't render this panel. So no baseline changes; any
`visual-regression` failure would be the Windows noise floor. Not run.

### Delta for later tickets

- `features/profile/useUserProfile` no longer exists. The generic "look up any user by id" concern
  is now `features/friends/useUserInfo` (typed to `UserInfo` / `UserInfoResponse`). A future
  non-Friends consumer of a by-id public profile should either import `useUserInfo` or, if that
  cross-feature import is undesirable, promote it to `shared/hooks/` — don't resurrect a
  `features/profile/` variant.
- `GET /api/users/{userId}` returns `UserInfoResponse` (`id, fullName, username, avatarUrl,
  coverUrl, bio`), `hasRole('USER')`-gated — **not** a full `UserResponse` and **not** public.
  Only `GET /api/users/me` returns the full `UserResponse` (own profile only).
