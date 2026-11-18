# SESSION-68 · `createSession` invitees must be friends and active

**Status:** `TODO`
**Type:** Enhancement (Security)
**Depends on:** none (the rule is root `CLAUDE.md` § Account lifecycle; SESSION-66 is the model)
**Filed:** 2026-11-18, found while auditing the owner's rule "a lookup to show a user includes deactivated accounts, a lookup for a new interaction excludes them" (raised during SESSION-66). Part of the NEXT_TOPICS topic "Deactivated accounts in new interactions".

`POST /api/sessions` takes `inviteeIds` (`CreateSessionRequest`). `createSession` only drops the creator's own id and duplicates, then writes one `INVITED` participant row and one `session.invitation.created` outbox event per id. It checks **neither** that the invitee is a friend of the creator **nor** that the account is active. So through the API anyone, a stranger or a deactivated account, can be invited and notified. SESSION-66 (share a session) already enforces both for its recipients; the creation path is the older, unguarded sibling. The client's `InviteFriendField` offers friends only, so the gap is reachable only by calling the API directly, but the server must not rely on that.

**Rule to apply.** Invitees are a new interaction: keep only the creator's friends (one `UserFriendService.getAcceptedFriendIds`, never `areFriends` per id) and drop deactivated accounts (one `UserService.getActiveUserIds`, backed by the partial index of V093). No N+1.

**Open decision, to settle at pickup (owner):** silently skip what is dropped (what SESSION-66 does) or refuse the create with a coded 400. Default proposal: **skip silently**, so a stale friend list never blocks creating a session; the response has no counter today, so decide whether the dropped ids are reported at all (a `skippedInvitees` count on `SessionResponse` would be a contract addition and needs the client census). If refusing is chosen instead, the code needs its en/vi copy in `errors:codes` (client ticket filed with it).

**Check at pickup.** Whether `inviteeIds` also applies to a group-linked session at create (the seed block writes them for both kinds). Whether an existing test or e2e fixture invites a non-friend (the integration tests build sessions through the API with arbitrary ids).

**Out of scope:** the share endpoint (SESSION-66, done), the join and approve paths (U28 decides those).

**Tests:** Spock for the friend and active filters and the single-query shape; an IT in `server/src/test/java/com/sportconnect/integration/` through the real pipeline: friend invited, stranger not invited (no row, no event), deactivated friend not invited, nothing else changes; mutation-check the filters.
