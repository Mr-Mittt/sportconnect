# CLIENT-MODAL-1 · Stale mutation error survives modal close/reopen

**Status:** `DONE` (2026-08-23) · **Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-08-21 — observed on `AddSportModal` (submit a sport that fails, close, reopen: the
previous error is still displayed). **Widened at filing** (user decision) from that one modal to the
whole bug class, since the same parent-owned-mutation shape is used by most dialogs in the app.

Closing a modal does not clear the error from the failed submit that preceded it, so reopening it
shows a stale error before the user has done anything. Confirmed on `AddSportModal`, reached from
`SportSwitcher`'s dashed "+" pill and from the zero-sport-profile gates on Groups, Home Feed,
Friends and Matches.

**The reset that exists resets the wrong half.** `AddSportModal`'s own doc comment says it "resets on
every open via a changing `key` prop from the parent" — and it does, but a remount only clears state
the *child* owns (the form fields). `isError` is a **prop**, derived from the parent's
`useAddSportProfile()` mutation, so the parent's `mutation.isError` stays `true` across the remount
and renders immediately on reopen. Worth stating plainly, because "it already resets on open" reads
like evidence this bug cannot happen.

That also means the fix cannot live in the modal alone: four pages own the mutation and pass it
down — `GroupsPage` (two instances), `HomeFeedPage`, `FriendsPage`, `MatchesPage`. Whether each owner
calls `reset()` on close or the reset moves behind one shared boundary is left to pickup; the second
is more robust against a future fifth caller but touches the presentational-modal +
parent-owned-mutation split `SPORT-1` chose deliberately.

**Audit the class, not just the instance.** These dialogs surface an error the same way and are the
candidate list to verify — a starting point, **not** a confirmed defect list; establishing which
actually leak is part of this ticket: `CreateGroupModal`, `CreateSessionModal`,
`SessionDiscoverModal`, `SessionDetailModal`, `HashtagPostsModal`, `DeleteGroupConfirmDialog`,
`RejectInvitationConfirmDialog`, `UpdateBroadcastConfirmDialog`, and `CommentSection`'s dialog.
Record the verdict per dialog, including the ones checked and cleared — otherwise a later reader sees
only the ones that changed and cannot tell the rest were ever looked at.

**Out of scope:** field/selection state (already correctly cleared by the `key` remount — re-verify
only, don't rebuild); in-flight/submitting state; any redesign of the error presentation itself; and
non-dialog surfaces that show mutation errors inline (e.g. ADMIN-2's sport form), which have no close
event and so cannot exhibit this.

**Tests:** a Vitest/RTL regression test that fails a submit, closes, reopens, and asserts no error is
shown — for `AddSportModal` and for each dialog the audit finds leaking. Plus one Playwright case
through the real flow: the MSW handler already returns the real 400 for a duplicate sport ("Already
has a profile for this sport"), so it reproduces end to end without new fixtures. If any spec file is
added or materially changed, `client/docs/E2E_OVERVIEW.md` §3 + §6 must be updated to match.

---

## What was built

### The approved design

Per-owner `reset()` on close, not a shared boundary — preserving the presentational-modal +
parent-owned-mutation split `SPORT-1` chose deliberately. Two scope decisions taken at pickup:

1. **The add-sport error resets on every close that can show it**, not just `AddSportModal`'s. The
   mutation feeds nested zero-sport-profile gates inside `CreateSessionModal` and
   `SessionDiscoverModal` too — `FriendsPage` in fact renders **no** standalone `AddSportModal` at
   all, only those nested gates.
2. **`SessionDetailModal` is fixed here**, not deferred, because its symptom is worse than the
   ticket described (see below) and the fix is the same one line per mutation.

### The audit — all ten candidate dialogs, including the cleared ones

The discriminator turned out to be clean and worth stating, because it decides the whole list:
**mutation-derived errors leak, query-derived ones do not.** A query refetches when the dialog
reopens, so its error reflects live state; a mutation's `isError` persists until something resets it.

| Dialog | Error source | Verdict |
|---|---|---|
| `AddSportModal` | `addSportMutation.isError` | **Leaked** — the ticket's confirmed instance |
| `CreateGroupModal` | `createGroupMutation.isError` | **Leaked** |
| `DeleteGroupConfirmDialog` | `deleteGroupMutation.isError` | **Leaked** |
| `RejectInvitationConfirmDialog` | `rejectMutation.isError` (`useGroupInvitationsData`) | **Leaked** |
| `UpdateBroadcastConfirmDialog` | `updateMutation.isError` (`useGroupsPageData`) | **Leaked** |
| `CreateSessionModal` | `createSessionMutation.isError` + `isAddSportError` | **Leaked** (both) |
| `SessionDiscoverModal` | `isAddSportError` mutation / `isDiscoverError` query | **Leaked** (add-sport half only) |
| `SessionDetailModal` | `isJoinError`/`isLeaveError`/`isCancelError` mutations | **Leaked** (mutation halves only) |
| `HashtagPostsModal` | `postsQuery.isError`, `isFetchNextPageError` — both queries | **Cleared** |
| `CommentSection` | `activeCommentsPostQuery.isError`, `commentsQuery.isError` — both queries | **Cleared** |

Also cleared, inside dialogs that otherwise leak: `SessionDetailModal`'s `isSessionError`,
`isParticipantsError`, `isRequestedParticipantsError` and `isCommentsError`, and
`SessionDiscoverModal`'s `isDiscoverError` — all query-derived.

Nothing in the app called `reset()` on close before this. The only prior `.reset()` is
`AdminSportsPage:38-39`, and it fires on *sport selection change*, not on close.

### `SessionDetailModal` is a worse bug than the ticket described

It reopens for a **different session**. A failed join on session A rendered its error against
session B — an error attributed to the wrong entity, not merely a stale one. Same root cause, same
fix, so it was folded in rather than re-filed (user decision).

### Files

| File | Change |
|---|---|
| `useCreateSessionModalData.ts` | `closeCreateModal` resets the create mutation — fixes all 4 pages |
| `useSessionDetailModalData.ts` | new `resetActionErrors()` (join/leave/cancel) |
| `useDiscoverModalData.ts` | `closeDetail` calls `resetActionErrors()` — fixes 3 pages |
| `useGroupInvitationsData.ts` | exposes `resetReject` |
| `useGroupsPageData.ts` | exposes `resetBroadcastUpdate` |
| `GroupsPage.tsx` | 6 close handlers reset; 2 composed handlers for the nested gates |
| `HomeFeedPage.tsx` / `MatchesPage.tsx` / `FriendsPage.tsx` | add-sport resets on the closes that can show it |
| `AppShell.tsx` | its own `SessionDetailModal` close calls `resetActionErrors()` |

No component changed. Every leak was page/hook wiring — the dialogs already rendered `isError`
correctly — so there are no new visual states and no new Storybook stories.

### Key decisions

**Hook-level where the hook owns both mutation and close; page-level otherwise.** Three hooks own
their own close handler, so the reset lives there and one change fixes every page that consumes
them. Two hooks own a mutation whose dialog closes on `GroupsPage`, so they expose a reset rather
than firing one — they have no close event of their own to hang it on. This is still per-owner; it
is not the shared boundary that was rejected.

**`onDirtyChange`-style prop drilling was not needed.** `useAddSportProfile` returns the raw
mutation, so `.reset()` was already available at every call site.

### Divergences from the approved design

**One, and it needed a decision.** The plan said `GroupsPage`'s four dialogs would get a new
`GroupsPage.test.tsx`. Two of them reset via hook methods and are covered at hook level. The other
two — `CreateGroupModal`, `DeleteGroupConfirmDialog` — reset inline in JSX, and **no test in this
repo has ever rendered `GroupsPage`**; it is the largest page in the app, so a first RTL harness for
it would have been a substantial build for two assertions. Covered with two extra Playwright cases
instead (user decision), which exercise the real page and are arguably stronger evidence. E2E scope
therefore went from the agreed 1 case to 3.

## Verification

| Check | Result |
|---|---|
| `pnpm exec tsc -b` | Pass |
| `pnpm lint` | 0 errors (2 pre-existing warnings in `SessionStartTimePicker`, untouched) |
| `pnpm test` | **923 passed / 134 files** |
| `pnpm e2e` | **64 passed** |

**Every regression test was confirmed to fail with its fix reverted**, then pass with it restored —
done individually for the add-sport RTL case, both session hook cases, and both `GroupsPage` e2e
cases. A regression test that passes either way is worthless, and one of these looked like a product
bug until a standalone reproduction proved the assertion was at fault (below).

Coverage: **8 of 8 leaking dialogs.** 5 RTL/hook tests + 3 e2e cases.

### A test failure that was not a product bug

The `useGroupsPageData` and `useGroupInvitationsData` reset assertions failed synchronously after
`act(() => ...reset())`. The cause was the re-render flush, not the reset — `waitFor` fixed both.
Worth recording because the first reading was "the reset does not work", which would have sent the
next person editing working code.

## Deltas for later tickets

- **The rule to apply to any new dialog:** if its error prop comes from a mutation, its close must
  reset that mutation. If it comes from a query, it must not — the query re-evaluates, and resetting
  would be noise. Nothing structural enforces this; it is a convention this ticket established.
- **`useSessionDetailModalData` now exposes `resetActionErrors()`.** Any new host for
  `SessionDetailModal` must call it on close — `AppShell` and `useDiscoverModalData` both do.
- **`GroupsPage` still has no RTL test harness.** Two of its dialogs are covered only by e2e as a
  result. Building one remains unfiled work, and would be worth it the first time a `GroupsPage`
  ticket needs component-level assertions.
