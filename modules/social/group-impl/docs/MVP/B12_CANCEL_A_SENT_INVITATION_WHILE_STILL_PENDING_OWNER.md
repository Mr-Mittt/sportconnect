# B12 · Cancel a sent invitation while still `pending_owner`

**Status:** `DONE` (2026-07-24) · **Type:** New Feature · **Filed:** 2026-07-24, user-requested
directly while using GRP-7's newly-shipped invitation lifecycle.

**What ships:** `GroupService.cancelInvitation(invitationId, callerId)` — mirrors
`cancelJoinRequest` (A3) exactly: caller must be the invitation's own inviter, the group must still
be active, the invitation must still be `status="pending_owner"` (an owner/admin has not yet
approved it), then hard-deletes the row — no "cancelled" status literal introduced, same as
`cancelJoinRequest` never introducing a "cancelled" `JoinRequestStatus`. New `DELETE
/api/groups/invitations/{invitationId}` endpoint, matching `DELETE /join-requests/{requestId}`'s
convention.

**Explicit scope boundary (user-confirmed):** once an owner/admin approves an invitation
(`pending_user`), the inviter can no longer cancel it — it's out of their hands at that point.
Cancelling a `pending_user` invitation would need different semantics (closer to "revoke", not
"withdraw my own unapproved request") and is out of scope here.

**Tests:** 5 new Spock cases in `GroupServiceImplSpec` — happy path (deletes), invitation not found,
caller is not the inviter, group inactive, invitation not `pending_owner` — directly mirroring
`cancelJoinRequest`'s own 5 test cases.

**Verification:** `./gradlew :modules:social:group-impl:test` and `./gradlew :server:test` both
green; live-verified against a running `bootRun` instance (non-inviter cannot cancel, inviter
cancels their own `pending_owner` invitation successfully and it disappears from the owner's
approval queue, cancelling after approval correctly 400s).

**Client:** wired the same session as a GRP-7 addendum — see `client/docs/BACKLOG_MVP.md`.

---
