# Client — V1 Feature Backlog

**Version:** V1
**Module:** `client`
**Last updated:** 2026-07-17
**Prerequisite:** MVP backlog (`client/docs/BACKLOG_MVP.md`) should be closed, or at least the ticket
that filed an entry here, before picking anything up.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon client v1` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | ANON-1 | Decide and scope anonymous/logged-out post viewing | `TODO` |

---

## Tickets

### ANON-1 · Decide and scope anonymous/logged-out post viewing
**Status:** `TODO` · **Type:** Product decision (spans backend + client) · **Filed:** 2026-07-17,
during client ticket FEED-12

#### Origin

FEED-12 (`client/docs/BACKLOG_MVP.md`) adds a URL-addressable post route, `/posts/:postId`, so a
comment thread can be shared as a direct link. Today **every** route in this app sits behind
`ProtectedRoute` — there is no concept of public/anonymous viewing anywhere. An anonymous visitor
clicking a shared `/posts/:postId` link gets the same already-built behavior every other protected
deep link gets: redirected to `/login?redirect=/posts/123`, then bounced back after authenticating
(AUTH-8's step 7 already covers this exact mechanism generically). That's the correct MVP behavior —
`GET /api/posts/{postId}` requires a Bearer JWT today and isn't in `CLAUDE.md`'s public-endpoint
allowlist (`/api/auth/**`, `/api/sports/**`, `GET /api/users/**`) — but whether a shared post should
be viewable **without ever logging in**, the way Twitter/X or Instagram permalinks work, is a genuine
product question nobody has decided yet. This ticket exists to make that decision and scope the
resulting work — **it does not implement anything itself.**

#### Questions to resolve when picked up

1. Should any post be viewable without authentication at all? If yes, gated to `visibility: 'public'`
   only — `'friends'`/`'private'` posts must 404 (not 403) to an anonymous caller, so existence isn't
   leaked. (Note: `visibility: 'friends'` isn't actually enforced anywhere yet per `post-impl`'s own
   `CLAUDE.md` gotcha — "behaves like private" — so in practice this reduces to "public only" until
   that's built.)
2. Read-only (view post + comments, no like/comment controls) or a visible-but-disabled composer with
   a "log in to comment" prompt?
3. Scoped narrowly to single-post permalinks (this ticket's literal trigger), or does the same
   decision extend to public group pages / public profile pages? Recommend scoping narrowly first
   unless there's a clear reason to decide all three at once.
4. Rate-limiting / scraping exposure for a genuinely public, unauthenticated, user-generated-content
   endpoint — no precedent in this codebase; the only public endpoints today are auth, the sport
   catalog, and the user directory, none of which serve per-user content.

#### If the decision is "yes, allow it" — scope of the resulting work

**Backend:**
- A new unauthenticated-safe read path for `GET /api/posts/{postId}` and its `/comments` sibling (or
  relax the existing ones to `permitAll` with an explicit visibility filter inside the service layer —
  don't just flip the security config without the filter, that would leak private/friends posts).
- Update `auth-impl`'s `SecurityConfig` public-endpoint list and `CLAUDE.md`'s own documented list to
  match, so the next person reading either doesn't have to rediscover this.

**Client:**
- `/posts/:postId` needs to stop being unconditionally behind `ProtectedRoute` — likely a route-level
  variant that renders for both authenticated and anonymous callers, rather than a hard redirect.
- `CommentSection`/the composer need a distinct logged-out rendering (hide interactive controls, or a
  disabled state with a "log in to comment" CTA) — today every code path assumes an authenticated
  caller.
- `usePost`/`useComments` (FEED-12) need to tolerate an anonymous caller gracefully (no 401 spray) —
  worth designing FEED-12's version of these hooks with this in mind even before this ticket is
  scheduled, so it isn't a rework later.

#### Out of scope for this filing

- Any actual implementation — this ticket is the decision + scoping pass, not the build.
- Public group/profile pages — only in scope if the decision above explicitly extends there.

#### Tests

Not applicable yet — write these when the ticket is actually scoped into an implementation ticket.
