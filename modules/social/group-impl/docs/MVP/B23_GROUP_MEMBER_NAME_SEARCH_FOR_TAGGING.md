# B23 · Group member name search for tagging

**Status:** `DONE` (2026-11-16)
**Type:** New Feature · **Depends on:** SESSION-GL-64 (done: the name rule, `UserService.searchUserSummaries`, `GroupService.getMemberUserIds`) · **Blocks:** CLIENT-GL-50 part 2 (client backlog)
**Filed:** 2026-11-16, owner request while building CLIENT-GL-50: tagging also works in posts, and a group post tags the group's members. `GET /api/groups/{id}/members` is paged and unfiltered (the client loads 100 of up to 500), so a name search over the members is needed.

New read endpoint `GET /api/groups/{groupId}/members/search?q=&size=` returns the group's active members whose name matches `q`: each item is `userId`, `fullName`, `avatarUrl` and nothing else (no role, email or status). Same shape and rule as `GET /api/sessions/{id}/thread-people`: first and last name only, word-start, accent- and case-insensitive, every typed word must match, `size` default 5, ceiling 20, at least 1, `q` cut to 100 characters; an empty `q` gives the first page by name; the caller may appear; deactivated users are never returned. The search runs in the database (`UserService.searchUserSummaries` with the member ids from `GroupService.getMemberUserIds` as the scope), never by loading the members into memory.

Rules: the group must be available (404, a deleted or inactive group) and the caller an active member of it (403), reusing the group module's existing gate (B18: `isGroupMember` requires an active group); a deactivated caller is refused by the JWT filter as on every authenticated path. Cross-domain: `-api` interfaces only, ids only. Error codes: none new unless the gate's codes differ (decide at pickup). Client-visible enum: none; the client use is CLIENT-GL-50 part 2 (and its MSW mock).

**Out of scope:** changing `GET /members`; notifying a tagged person (NOTIF-12); paging beyond the cap; searching non-members, pending requests or invitations.

**Tests:** Spock for the service (gate, scope from member ids, caps); an integration test in `server/src/test/java/com/sportconnect/integration/`: a member finds members (accents, word-start, several words), a non-member gets 403, a missing or inactive group 404, a deactivated user is not listed, default 5 / ceiling 20 / at least 1. Release note under Unreleased in `documentation/release-notes/SERVER.md` (an endpoint, no migration).

---

## Implementation summary (2026-11-16)

**Design as approved, built as designed.** No divergence.

- `group-api`: `GroupMemberSearchResultResponse { userId, fullName, avatarUrl }` and `GroupService.searchGroupMembers(groupId, callerId, query, size)` (Javadoc: flow, caps, what is never returned).
- `GroupServiceImpl.searchGroupMembers`: `isGroupActive` first (404 `GROUP_NOT_FOUND`), then `isGroupMember` (403 `GROUP_MEMBER_REQUIRED`); the order matters because `isGroupMember` is also false for an inactive group (B18) and would turn the 404 into a 403. `size` null gives 5, otherwise clamped to 1..20; `q` cut to 100 characters; then `UserService.searchUserSummaries(getMemberUserIds(groupId), q, limit)` mapped to the DTO. One database search, nothing loaded per member, so no N+1. The constants are `MEMBER_SEARCH_*` next to the method.
- `GroupController`: `GET /api/groups/{groupId}/members/search` (`hasRole('USER')`, Swagger 200/401/403/404), declared beside `GET /{groupId}/members`; the other `/members/...` routes are PUT/DELETE with `{targetUserId}`, so no clash. `SecurityConfig` unchanged (authenticated by default).
- Reused as is: the app's one name rule and its `is_active = true` filter (a deactivated member is never listed, proved by the IT), `GROUP_NOT_FOUND` / `GROUP_MEMBER_REQUIRED` (no new error code, so no `ERROR_CODES.md` or client `errors:codes` change).
- Not changed: `GET /members`, `getMemberUserIds`, migrations, the client.

**Census:** one method added to `GroupService` (no other implementation of it exists in `modules` or `server`), one route, one DTO; nothing existing changes. Client: `/members` is read by `useGroupMembers`, the members tab and the invite modal and is untouched; the new path has no client caller until CLIENT-GL-50 part 2 (client backlog), which also owns its MSW mock.

**Tests:**
- `GroupServiceImplSpec` (+5 features, 195 in the spec, all green): the member ids are the scope and only id, name and avatar are mapped; inactive group is a 404 with no membership check or search; a non-member is a 403 with no search; size table (null, 1, 0, -3, 20, 21, 500); a 150-character query is cut to 100.
- `GroupMemberSearchIntegrationTest` (new, 12, all green; real controller, service, `UserServiceImpl` and native search on H2): non-member 403 (public and private group), member of a private group served, missing and inactive group 404 (not 403), unauthenticated refused, every active member listed including the caller and nobody from another group, deactivated and nameless members not listed with no email, username or role in the response, accents and case incl. `đ`, word-start only, several words in any order, username never searched, a 500-character query is cut not refused, size default 5 / cut to 20 / at least 1. `SessionThreadPeopleIntegrationTest` re-run green (shared search).
- Mutation check (each mutant broke at least one test, the default-size one re-checked by hand on the spec): no active check, member check before active check, no member check, default 6, max 21, min 0, query not cut, wrong scope, avatar dropped. All 9 killed.
- Run: `./gradlew :modules:social:group-impl:test :server:test` (the whole group-impl suite and the whole server IT suite, including the two classes above) finished `BUILD SUCCESSFUL` on 2026-11-16. Not run: the real Postgres plan of the search (it is `UserNameSearchPostgresTest`'s job from SESSION-GL-64, unchanged), and the endpoint against a running server by hand.
