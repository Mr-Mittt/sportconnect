# CLIENT-SESSION-53 · Share dialog: search through the API for friends and group members

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** CLIENT-GROUP-SESSION-3 (the group Share dialog it extends), and **U29** (user backlog) for the friend half; the group half depends on nothing
**Filed:** 2026-11-20, from the pickup of CLIENT-GROUP-SESSION-3: the owner first asked for the group member search to be API-backed there, then kept the client-side filter for both lists in that ticket and asked for this follow-up.

Today the Share dialog filters on the client over what it already loaded: the standalone session's whole friend list (CLIENT-SESSION-49, `GET /users/friends`, no `q`, no paging) and, from CLIENT-GROUP-SESSION-3, the group's members loaded 100 at a time with "Load more". A person who is not in what is loaded (a member on a page not fetched yet, or a friend in a very long list) cannot be found by typing. This ticket makes the dialog's search box ask the server: the typed text, debounced, goes to a search endpoint and the matches replace the list; with no text the normal list shows. The "Joined" mark, the 50 limit, the sent line and the caller exclusion are unchanged.

- **Group members:** the B23 endpoint already exists, `GET /groups/{id}/members/search?q=&size=` (word-start, accent-insensitive, up to 20; `useGroupMemberSearch` is the tagging hook, so a separate hook with size 20 is expected).
- **Friends:** needs **U29**: `GET /users/friends` takes an optional `q` (and a size), so the call without them stays the whole list for its other consumers.
- **Edge cases:** a failed search keeps the loaded list usable; a person who joined but is beyond the first 20 players shows as shareable (the server skips and counts them, as today); the caller is never listed; a result is not ticked twice when it is also in the loaded list.

**Out of scope:** the Invite-friend modals (GRP-4), `@` tagging, how a share is sent, searching people who are not friends or members.

**Tests:** hook tests for both searches (debounce, size, idle), the dialog with text typed (server results shown, list restored when cleared, a failed search), the MSW search handlers, an e2e flow for each kind of session; mutation check per requirement.
