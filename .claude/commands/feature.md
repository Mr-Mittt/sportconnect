You are helping analyze and plan a new feature for SportConnect. Work through the four phases below in order. Gate on user confirmation before moving to the next phase — do not skip ahead.

---

## Phase 1 — Clarify requirements

Ask the user questions until you have unambiguous answers to all of the following:

- **What** does the feature do? (one-sentence summary)
- **Who** uses it? (Normal User / Group Owner / Vendor / Admin)
- **Entry point** — where does the user trigger this? (UI page, API call, background job)
- **Inputs and outputs** — what data goes in, what comes out?
- **Edge cases and error states** — what can go wrong, and what should happen?
- **Explicitly out of scope** — what will NOT be built in this iteration?

If a field in scope overlaps a concept another domain already treats as first-class (e.g. `sportId`, `groupId`, `userId`), don't answer scoping/validation questions from this feature's own fields alone — do Phase 2's cross-domain concept precedent check (below) *before* locking in the answer, not after. (Concrete miss this rule exists to prevent: a "favorite locations, filter by sport" feature was scoped with a bare `sportId` filter, with no connection to the fact that "sport" already means "a sport the user holds an active `UserSportProfile` for" everywhere else it's used as a gate — e.g. `GroupServiceImpl.createGroup`'s `hasProfileForSport` check. The precedent existed in the codebase the whole time; it just wasn't checked before proposing scope.)

**Account lifecycle check (CLAUDE.md's Account lifecycle rule):** if this feature adds any new authenticated endpoint, background job, or user-triggered cross-domain call, the edge-cases answer must explicitly cover what happens when the caller is a deactivated (`isActive = false`) user. Don't assume the JWT filter or `SecurityConfig` already blocks them — today it doesn't (see CLAUDE.md and `modules/user/user-impl/docs/BACKLOG_MVP.md`'s U12 for the current known gaps). If the feature is security-sensitive, plan an explicit `isActive` check via `UserService` rather than inheriting the existing gap.

Do not proceed to Phase 2 until the user confirms the scope is correct.

---

## Phase 2 — Explore the codebase

Before designing anything, explore the codebase to find:

- Existing services, repositories, and utilities that can be reused (search the relevant `*-api` and `*-impl` modules)
- Which modules/domains this feature touches
- Existing patterns for similar features (e.g. how other entities are structured, how DTOs are shaped, how controllers are written)
- Any cross-domain concerns — flag immediately if the feature would require importing from another domain's `-impl` or creating a JPA relationship across domain boundaries
- **Cross-domain concept precedent** — if this feature's fields overlap a concept another domain already treats as first-class (`sportId`, `groupId`, `userId`, etc.), grep for that concept's existing `-api` interface usages across every module (e.g. `sport-api`'s `hasProfileForSport`, `getSportsByIds`) to find established validation/business-rule precedent, not just structural import violations — a new consumer of an existing concept should match how existing consumers already gate/validate it unless there's a real reason to diverge
- **Account lifecycle** — check whether the endpoint(s)/service method(s) this feature adds need an explicit `isActive` check (via `UserService`), rather than assuming the existing JWT filter or `SecurityConfig` already excludes deactivated users — confirm against `JwtAuthenticationFilter` (auth-impl) directly, don't assume it re-checks active status just because it validates the token

Surface your findings to the user as a short summary before designing. Confirm there are no surprises.

---

## Phase 3 — Design (monolith-first, microservice-ready)

Design the implementation with these non-negotiable constraints:

- **Cross-domain calls go through `-api` interfaces only** — never import a concrete class from another domain's `-impl`
- **Cross-domain references are IDs only** — no JPA `@ManyToOne` across domain boundaries (store `userId: Long`, not `User user`)
- **No shared mutable state between domains**
- **DB tables are domain-scoped** — each domain owns its tables, no cross-domain foreign keys at the DB level
- **Service interfaces as contracts** — depend on the interface so a future network transport (Feign, gRPC) is a drop-in swap
- **Deactivated users get no further interaction** — any new authenticated endpoint or service method must explicitly reject a caller whose `isActive` is `false`, unless it's read-only data already public without auth (see CLAUDE.md's Account lifecycle rule)

**Design review: run it yourself before presenting the plan** (added 2026-11-19 from the review of the group-session chain, where the owner's questions found the defects that 640 tests and mutation checks had not, because those tests were written from the same design). Answer each question that applies, in one line, in the plan; a design that cannot answer one is not ready.

- **Table or column?** For every new table: who writes it, who reads it, does anything ever query it by an id or join it? A list written once and read as a whole (an audience, a set of ids) is a column, not a table; a table nothing ever deletes from needs a retention rule.
- **What does each status mean?** Every value of a new status or state means exactly one thing ("DONE" must not cover both "made" and "skipped, nothing made"). Say which states can be revived and which are final.
- **Async, queued or scheduled work:** what triggers it, what drains it, on which thread, and what is the clock of a retry (a backoff with nothing to wake it is not a retry)? Is the work bounded, never an unbounded drain on a request thread?
- **Two at once:** what happens when two instances, or two threads of one instance (a request thread and the scheduler thread), run the same step? Every transaction has its own pooled connection, so one instance with threads races like two instances. Name the guard (a unique key, a row lock such as `FOR UPDATE SKIP LOCKED`, a compare-and-set update) and what the loser does: a unique key alone makes the loser fail, not skip.
- **Identity and time:** what identifies a thing, and does the key survive an edit of the rule, a timezone change or DST (a local date, not an instant, when "one per day" is the rule)? What happens to a queued or pending item when the rule that produced it is edited?
- **Failure and visibility:** how does an operator see that it went wrong (a log line, a reason column, a count), and what does the user see?
- **What can the tests prove?** Which of the above can the planned tests prove here (H2, one thread) and which cannot (PostgreSQL-only SQL, two real instances)? Plan the real-concurrency test now (see Phase 5) and name the rest as not run.

Then **argue against your own plan once**: for each table, status, queue and scheduled job, would the owner ask "do we really need this?" or "what if two run?" Fix the plan, or put the answer in it.

Produce a concrete plan covering:

1. **Backend** — new entities, DTOs, repository methods, service interface methods, controller endpoints, Liquibase migration scripts
2. **Frontend** — new pages/components, API calls, state changes
3. **Cross-cutting** — any changes to `common`, security config, or shared utilities
4. **What is NOT changing** — be explicit so scope stays tight

---

## Phase 4 — Plan approval

Present the full plan clearly and concisely. Wait for the user to explicitly approve it before stopping.

If the plan is a **chain of tickets**, mark its **review gates**: stop and review with the user after the ticket that fixes the data model, and after the one that adds queued, async or scheduled work, before later tickets build on them (a decision changed there is cheap; changed after the rest is built it touches every ticket, as the audience tables and the queue did). Say whether the chain lands as one PR or in slices.

The approved plan is the handoff to `/implement`. Make sure it is detailed enough that implementation can proceed without revisiting design decisions.
