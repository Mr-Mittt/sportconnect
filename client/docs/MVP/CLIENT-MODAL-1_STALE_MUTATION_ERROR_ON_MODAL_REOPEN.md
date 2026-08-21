# CLIENT-MODAL-1 · Stale mutation error survives modal close/reopen

**Status:** `TODO` · **Type:** Bug Fix · **Depends on:** none ·
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
