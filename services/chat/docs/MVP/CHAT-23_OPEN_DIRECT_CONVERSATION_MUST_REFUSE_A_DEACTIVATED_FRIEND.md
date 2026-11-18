# CHAT-23 · Opening a direct conversation must refuse a deactivated friend

**Status:** `TODO`
**Type:** Enhancement (Security) · **Depends on:** none (the rule is root `CLAUDE.md` § Account lifecycle)
**Filed:** 2026-11-18, found while auditing the owner's rule "a lookup to show a user includes deactivated accounts, a lookup for a new interaction excludes them" (raised during SESSION-66). Part of the NEXT_TOPICS topic "Deactivated accounts in new interactions".

`conversation.Service.OpenDirect(callerID, otherUserID)` authorizes with the friendship cache only (`s.cache.AreFriends`, `ErrNotFriends` otherwise). The chat service knows nothing about whether `otherUserID` is still active: the sync design carries friendships, group members and profile data, and the monolith publishes no event when an account is deactivated (`user.profile_updated` is the only user event; `deactivate` makes none). So a deactivated friend's direct conversation can be opened and messages can be written to them (they cannot read them, a deactivated user is refused at the gate, but the interaction still happens and the rows pile up). CHAT-17 and `internal/auth/auth.go` already document the accepted five-minute window for a deactivated **caller's** token; nothing records the **target** case.

**Fix shape (per `SYNC_DESIGN.md`: new data needs an event and a cache, never a live call at request time).** The monolith publishes the account's active state (a new event on deactivate and reactivate, or an `is_active` field on the existing profile event, decided at pickup), `user_profiles_cache` stores it, and `OpenDirect` (and sending into an existing DIRECT conversation, decide) refuses a deactivated target with a coded 403 or 404 the client can show (needs its en/vi copy). A backfill of `is_active` for existing cache rows is part of the migration (golang-migrate pair). Java side: the publish site in `UserServiceImpl.deactivate` / `reactivateUser` after commit, next to the cache eviction (A25).

**Check at pickup.** Whether a group conversation needs anything (a deactivated member stays a member; sending *to* the group is not an interaction with that person, so likely nothing). Whether an existing DIRECT conversation with a now-deactivated friend should become read-only for the other side.

**Out of scope:** the deactivated caller's own token window (CHAT-17, accepted).

**Tests:** Go unit and integration tests for the cache column and the refusal; a Java IT proving the event is published on deactivate and reactivate; the sync check against a real Redis stream (`redis-cli XRANGE`), as the chat verification rules require.
