# CLIENT-SESSION-26 · Discover panel/modal needs a "load more" control

**Status:** `SUPERSEDED` (2026-09-22, by CLIENT-SESSION-22)

**Superseded 2026-09-22 (user decision, at CLIENT-SESSION-22's pickup):** CLIENT-SESSION-22's scope
widened at pickup to give each of its new per-date Discover sections its own `useInfiniteQuery`
load-more, absorbing this ticket's entire scope rather than building pagination twice. See
CLIENT-SESSION-22's own "Scope change (2026-09-22)" entry for the actual design. No further action
needed on this ticket.
**Type:** Client feature
**Depends on:** backend **SESSION-37** (`modules/session/docs/BACKLOG_MVP.md`, `IN PROGRESS`) —
changes `GET /api/sessions/discover`'s default page size from `20` to `10`.
**Filed:** 2026-09-21, consumer census finding from SESSION-37's pickup. That ticket's Phase 2
exploration found `useDiscoverSessions.ts` and `SessionDiscoverPanel`/`SessionDiscoverModal`
(CLIENT-SESSION-6/7) fetch only page 0 of `/discover` with no pagination UI at all — there is no
"load more"/infinite-scroll control anywhere in the Discover grid today. Halving the backend's
default page size (SESSION-37, user-confirmed to proceed as specified) means Discover now visibly
shows fewer results per view with no way to see the rest, a real UX regression until this ticket
gives the caller a way to page further.

## Scope

- Add a "load more" (or equivalent) control to `SessionDiscoverPanel` (Matches page) and
  `SessionDiscoverModal` (rail entry point) that requests the next page of `/discover` results and
  appends them to the currently-shown list — same `page`/`size` `Pageable` shape every other listing
  endpoint in this app already uses, no new backend response shape needed.
- Wire `useDiscoverSessions` to track the current page and expose a `loadMore`/`hasMore` (or
  equivalent) affordance to its callers, following whatever pattern this codebase's other
  paginated hooks already use (check `useMatchesPageData`/upcoming-history "load more" wiring first
  for precedent before inventing a new shape).
- Update Storybook stories, component tests, and `client/e2e/mocks/handlers/sessions.ts` /
  `matches-journey.spec.ts` as needed for the new control.

## Out of scope

Changing the backend's page size back, or any other change to `/discover`'s filter/sort contract —
this ticket is purely about the client's missing pagination affordance.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
