# U29 · Search the caller's friends by name (for the Share dialog)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** none (CLIENT-SESSION-53 is its client)
**Filed:** 2026-11-20, from the pickup of CLIENT-GROUP-SESSION-3: the Share dialog of a standalone session filters the whole friend list on the client, and the owner asked for an API search for both friends and group members (the member side, B23, exists; this is the friend side).

`GET /api/users/friends` returns every active friend with no filter and no paging (`UserFriendServiceImpl.getFriends`). Add an optional `q` and `size` to it: with `q`, only friends whose first or last name match are returned, by the app's one name rule (word-start, ignoring case and accents, the rule of `users/search` and the group member search, SESSION-GL-64): through `UserNameSearch` / `UserNameSearchRepository` scoped to the caller's friend ids, never a new `LIKE` (`user-impl/CLAUDE.md`, "One name-search rule"), at most `size` (default 5, ceiling 20, like B23); without them the answer is unchanged, so the friends rail and every other consumer keep working. Active friends only (a deactivated friend is excluded, as today). A deactivated caller is already refused by the per-request gate (A25). Batch query, no per-friend lookups.

**Out of scope:** paging the plain list, searching non-friends (that is `users/search`).

**Tests:** Spock for the filter and the cap; an IT through MockMvc (a friend found by a second-word prefix and an accent-free query, a non-friend and a deactivated friend never returned, no `q` unchanged); consumer census of `useFriends` and the MSW `/users/friends` handler at pickup; client ticket CLIENT-SESSION-53.
