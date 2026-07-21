# A10 · Add multi-value `sportIds` filter to `GET /api/groups/public`

**Status:** DONE (2026-07-21) · **Type:** Enhancement · **Dependency:** B5 (existing single-`sportId`
filter on this endpoint)

## Why

Filed while scoping the client's GRP-6 ticket (`client/docs/BACKLOG_MVP.md`) — the Join Group
modal's new multi-select sport filter needs to search across several of the current user's sports
in one combined, groupable result set. The endpoint only accepted a single optional `sportId`, with
no way to express "groups in any of these N sports" in one call.

## Design (as approved)

- Keep the existing singular `sportId` `@RequestParam` untouched for back-compat.
- Add a new optional `sportIds` (`List<Long>`) `@RequestParam` alongside it.
- Resolve both into one canonical list **in the service layer**, before the repository is ever
  touched — `sportIds` (if non-empty) takes priority over `sportId`; the two are never combined/
  ORed together. A lone `sportId` is wrapped into a one-element list so the repository/query layer
  only ever has to reason about a single `IN`-based filter shape, not two separate conditions.
- Repository query change: `(:sportId IS NULL OR g.sportId = :sportId)` →
  `(:sportIds IS NULL OR g.sportId IN :sportIds)`, on both `searchPublicGroupsWithCounts` (member-
  aware) and `searchPublicGroupsAnon` (anonymous) methods.
- No migration (query-shape change only), no DTO change (`GroupSearchResponse` already carries
  `sportId` per row, which is what the client will use to group a single flat response by sport).

## What was built

Exactly as designed — no deviation:

1. **`GroupRepository.java`** — both `searchPublicGroupsWithCounts` and `searchPublicGroupsAnon`
   changed their `Long sportId` param to `List<Long> sportIds`; JPQL `WHERE` clauses updated to the
   `IN`-based null-safe pattern. This same "nullable `List` param used in an `IS NULL OR ... IN`
   check" pattern already existed elsewhere in this file (`findGroupIdsByUserAndSportIds`), so it
   wasn't a new risk for this codebase.
2. **`GroupService`** (api) — `getPublicGroups` signature grew a `List<Long> sportIds` param
   between `sportId` and `keyword`, with a Javadoc comment explaining the priority rule.
3. **`GroupServiceImpl.getPublicGroups`** — resolves `sportId`/`sportIds` into one
   `effectiveSportIds` list before calling the repository (see inline comment at the top of the
   method for the exact rule).
4. **`GroupController.getPublicGroups`** — new `@RequestParam(required = false) List<Long> sportIds`;
   `@Operation` description updated to mention it.
5. **Tests:**
   - `GroupServiceImplSpec.groovy` — updated all 7 existing `getPublicGroups`/
     `searchPublicGroups*` call sites to the new signature/list shape (no behavior change for the
     legacy-`sportId`-only path, verified still passing unmodified in spirit). Added 4 new cases:
     multiple `sportIds`, empty `sportIds` list falling back to no-filter when `sportId` is also
     absent, empty `sportIds` list falling back to the legacy `sportId` when present, and
     `sportIds` taking priority over a simultaneously-present `sportId`.
   - `server/.../GroupControllerTest.java`'s `getPublicGroups_Success` — Mockito `any()` count
     bumped from 4 to 5 to match the new signature.

## Verification

- `./gradlew :modules:social:group-impl:test` — green (all cases, including the 4 new ones).
- `./gradlew :server:test` — green (28 tests, including `GroupControllerTest`).
- **Live backend verification** (not just mocked-unit-test evidence): started `:server:bootRun`
  against local Postgres, registered a test user, created 3 sport profiles + 3 public groups (one
  per sport), and confirmed via real HTTP requests:
  - `?sportIds=1&sportIds=2` → returns only groups for sports 1 and 2, sport 3 excluded.
  - `?sportId=3` (legacy, alone) → returns only the sport-3 group, unchanged from pre-A10 behavior.
  - No filter → returns all public groups.
  - `?sportId=99&sportIds=1&sportIds=3` (both present, `sportId` bogus) → returns sport 1 + 3
    groups, confirming `sportIds` truly takes priority and isn't combined with `sportId`.
  - Spring's default binding for `List<Long> @RequestParam` from repeated query params
    (`?sportIds=1&sportIds=2`) confirmed working as expected — no comma-joined fallback needed.
  - Test groups cleaned up (deleted) after verification; test user (`a10test@example.com`) left in
    place (harmless dev-data, consistent with other seed/test users already present in this dev DB).

**Non-obvious operational note found during verification:** a stale `java.exe` process from an
earlier, unrelated session was already squatting on port 8080 (started hours earlier, running
pre-A10 code). The first verification pass silently hit that stale process instead of the freshly
built one — `bootRun` failed with "Port 8080 was already in use" but the background task runner
still reported "completed" misleadingly. Symptom was confusing (`sportIds` appeared to have zero
effect on filtering, even for a single value) until the stale process was identified via
`netstat`/`Get-Process` and killed. Not a code defect — a reminder that a green "completed" status
on a backgrounded long-running server command doesn't by itself prove the *current* code is what's
serving traffic; confirm the actual listening PID's start time when a live-verification result looks
implausible.

## Unblocks

`client/docs/BACKLOG_MVP.md`'s **GRP-6** (Join Group modal multi-select sport filter) can now
proceed — its `usePublicGroups` hook change (singular `sportId` → `sportIds: number[]`) has a real
endpoint to call.
