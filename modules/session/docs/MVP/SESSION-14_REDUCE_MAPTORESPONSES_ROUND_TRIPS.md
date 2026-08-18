# SESSION-14 — Reduce `mapToResponses`' round trips (+ bundled leaveSession gate)

**Status:** `DONE` (2026-08-16)
**Module:** `modules/session/session-impl`, `modules/social/post-impl`

---

## Original ticket scope

`SessionServiceImpl.mapToResponses` — the shared batch-resolution path behind every
session-returning endpoint — issued 8–9 DB round trips per call. Two mergeable query pairs were
identified during scoping (see `modules/session/docs/BACKLOG_MVP.md` § SESSION-14 for the full
original writeup):

1. **Post-like count + caller-liked flag → 1 query** (`post-impl`, low risk).
2. **Participant JOINED-count + caller's own row → 1 query** (`session-impl`, medium risk — trades
   an aggregate `COUNT` for a full-row fetch, and touches every session list/detail endpoint).

## What actually shipped — narrower than the original sketch

**By explicit user decision at pickup: only merge #1 shipped.** Merge #2 was deliberately deferred
— not attempted, not partially built — given its real payload tradeoff and bigger blast radius on
`session-impl`'s core batch-resolution path (used by `getSession`, `discoverSessions`,
`getGroupSessions`, `getSessionsCreatedByUser`, `getJoinedSessions`, create/update/cancel). The
backlog entry's own sketch for merge #2 is left as-is for whoever picks it up next; this ticket
does not re-file it as a separate ticket ID.

**A second point was folded into this same ticket at pickup, also by user request** (unrelated to
round-trip reduction): `leaveSession` now rejects a standalone session's own creator. See "Part B"
below.

---

## Part A — Merge #1: post-like count + caller-liked flag

**Before:** `PostLikeRepository` had two separate queries, both filtered by the same `postIds`
list, both consumed only by `PostServiceImpl.getSessionPostLikeInfo`:

```java
@Query("SELECT pl.postId, COUNT(pl) FROM PostLike pl WHERE pl.postId IN :postIds GROUP BY pl.postId")
List<Object[]> countGroupedByPostIdIn(@Param("postIds") List<Long> postIds);

@Query("SELECT pl.postId FROM PostLike pl WHERE pl.userId = :userId AND pl.postId IN :postIds")
List<Long> findLikedPostIdsByUserIdAndPostIdIn(@Param("userId") UUID userId, @Param("postIds") List<Long> postIds);
```

**After:** one conditional-aggregation query replaces both:

```java
@Query("SELECT pl.postId, COUNT(pl), SUM(CASE WHEN pl.userId = :userId THEN 1 ELSE 0 END) "
     + "FROM PostLike pl WHERE pl.postId IN :postIds GROUP BY pl.postId")
List<Object[]> countAndCallerLikedGroupedByPostIdIn(
        @Param("postIds") List<Long> postIds, @Param("userId") UUID userId);
```

Each result row is `[postId, count, callerLikedSum]`. `callerLikedSum` is 0 or 1 (`postId`/`userId`
is unique-constrained on `PostLike`) — `getSessionPostLikeInfo` treats `> 0` as "liked". A postId
with zero `PostLike` rows still produces no row at all (standard SQL `GROUP BY` behavior,
unchanged from before), handled via `getOrDefault(id, 0L)` / `getOrDefault(id, false)`.

**Null `currentUserId` handling:** the old code special-cased this (`currentUserId == null` skipped
the second query entirely, returning `Set.of()`). The merged query needs no such branch — SQL's
`pl.userId = NULL` never evaluates true (not even for a hypothetical null `pl.userId`, and
`PostLike.userId` is non-null anyway), so `SUM(CASE WHEN pl.userId = :userId ...)` degrades safely
to 0/null for every row when `:userId` is bound to `null`. Covered explicitly by a Spock test
rather than just assumed.

**Old methods deleted outright**, not deprecated — confirmed via grep that
`countGroupedByPostIdIn`/`findLikedPostIdsByUserIdAndPostIdIn` had no other callers.

**Files changed:**
- `modules/social/post-impl/.../repository/PostLikeRepository.java` — method replaced.
- `modules/social/post-impl/.../service/PostServiceImpl.java` — `getSessionPostLikeInfo` rewritten
  to build both maps from the single query result; `HashSet` import dropped (no longer used),
  `HashMap` added.
- `modules/social/post-impl/src/test/groovy/.../PostServiceImplSpec.groovy` — existing
  `getSessionPostLikeInfo` scenarios (batch happy path, non-`SESSION_POST`/nonexistent ids dropped,
  empty input, null `currentUserId`) rewritten against the merged query's stub shape; added one new
  case explicitly covering the zero-likes/no-row `getOrDefault` fallback for a valid postId.

**Not touched:** merge #2, and everything the original ticket flagged as "not reducible, do not
attempt" (users/sports/locations cross-domain queries, the post-existence/type defensive check).

**Round-trip result:** `getSessionPostLikeInfo`'s own contribution to `mapToResponses` drops from 2
queries to 1. Merge #2 remaining `TODO` means the ticket's original "8–9 → 6" target isn't fully
reached — landed at 7–8, not 6.

---

## Part B — `leaveSession` rejects a standalone session's own creator

**Not part of the original SESSION-14 scoping** — added at pickup by explicit user request,
bundled into this ticket rather than filed separately.

**The gap:** `createSession` auto-adds the creator of a **standalone** session as a `JOINED`
participant (`SessionServiceImpl.createSession`, "Standalone only" seed-participant block —
unchanged by this ticket). Nothing previously stopped that same creator from calling
`leaveSession` on their own session like any other participant, flipping their row to `LEFT` while
the session itself stayed `SCHEDULED`/`ONGOING` with no creator attached to it via participation.

**The fix — `SessionServiceImpl.leaveSession`:**

```java
public void leaveSession(Long sessionId, UUID userId) {
    Session session = findSessionOrThrow(sessionId);
    if (session.getGroupId() == null && userId.equals(session.getCreatedBy())) {
        throw new BadRequestException("The creator cannot leave their own session — cancel it instead");
    }
    // ... existing participant lookup/status flip, unchanged
}
```

- `leaveSession` previously never fetched the `Session` entity at all (only queried
  `SessionParticipant` directly) — this adds the one `findSessionOrThrow` call needed to check
  `createdBy`.
- **Scoped to standalone only** (`groupId == null`), a deliberate, explicit scope decision made at
  pickup: a group-linked session's creator is *not* auto-joined at creation (their access is via
  group ownership, not participation), and nothing in `joinSession` blocks them from separately
  joining like a normal member if they choose to — confirmed by reading `joinSession`, which has no
  `createdBy` check at all. If they do join that way, they can leave like any other member; their
  real ownership lever for a group-linked session is their group role, not this participant row.
- `BadRequestException`, matching every other authorization/business-rule rejection already in this
  service (`requireCanModify`'s "Only the creator can modify this session", capacity/fee
  cross-field validation, etc.) — not a new exception type.
- **No new escape hatch was built.** The creator's only way to relinquish a standalone session they
  created remains `cancelSession` (soft-cancels the whole session) — no ownership-transfer flow, no
  new endpoint. This was a direct scope confirmation at pickup, not an oversight.
- Account-lifecycle check: not applicable — this narrows an existing authenticated endpoint's
  accept set, it doesn't add new reachable surface for a deactivated caller.

**Files changed:**
- `modules/session/session-impl/.../service/SessionServiceImpl.java` — `leaveSession`.
- `modules/session/session-api/.../service/SessionService.java` — `leaveSession`'s Javadoc updated
  to document the new rejection case.
- `modules/session/session-impl/src/test/groovy/.../SessionServiceImplSpec.groovy` — all 5
  pre-existing `leaveSession` tests updated to stub the new `sessionRepository.findById` call (none
  of them previously needed it); two new tests added: standalone creator's own `leaveSession`
  rejected before any participant-repository call, and a group-linked creator who joined via
  `joinSession` still allowed to leave normally.

**Client impact (not built here, flagged for whoever picks it up):** the client's Leave button
(`CLIENT-SESSION-9`) has no reason today to distinguish "creator of a standalone session" from any
other `JOINED` participant — it will now receive a 400 if a standalone session's creator somehow
reaches the Leave action (unlikely in practice today, since the client wires that action off
`callerParticipation`/session ownership context, but not verified against every surface). Not
filed as a new client ticket — flagged here per this ticket's "Client follow-up" convention in case
a future session-detail/session-card pass wants to preemptively hide/disable Leave for that case.

---

## Verification

- `./gradlew :modules:social:post-impl:test` — green.
- `./gradlew :modules:session:session-impl:test` — green.
- `./gradlew :server:test` — green (no `session`/`post` integration test asserts on the old
  two-query shape or on unrestricted creator leave).

---

**Filed:** 2026-08-13. `SessionServiceImpl.mapToResponses` — the shared batch-resolution path
behind every session-returning endpoint (`getSession`, `discoverSessions`, `getGroupSessions`,
`getSessionsCreatedByUser`, `getJoinedSessions`, create/update/cancel) — currently issues **8–9
DB round trips per call** (a single `getSession(sessionId, callerId)` was used to count these
live): `sessionRepository.findById`, `userRepository.findAllById` (creator/cancelledBy),
`sportRepository.findAll` (only on a cold `@Cacheable("sports")` — free in steady state),
`locationRepository.findByIdIn`, `sessionParticipantRepository.countBySessionIdsAndStatus`
(JOINED count), `sessionParticipantRepository.findBySessionIdInAndUserId` (SESSION-9's
`callerParticipation`), and `PostService.getSessionPostLikeInfo`'s own 3 queries
(`postRepository.findByIdInAndIsActiveTrue`, `postLikeRepository.countGroupedByPostIdIn`,
`postLikeRepository.findLikedPostIdsByUserIdAndPostIdIn`). None of this is N+1 in the classic
sense (every query is already batch-shaped, list-safe) — this ticket is about round-trip count on
the already-batched path, not fixing a scaling bug.

**Two mergeable pairs identified (not yet implemented — scoping only):**

1. **Post-like count + caller-liked flag → 1 query** (low risk). `countGroupedByPostIdIn` and
   `findLikedPostIdsByUserIdAndPostIdIn` both hit `PostLikeRepository` for the same `postIds`.
   Mergeable via one grouped, conditional-aggregation query:
   ```java
   @Query("SELECT pl.postId, COUNT(pl), SUM(CASE WHEN pl.userId = :userId THEN 1 ELSE 0 END) "
        + "FROM PostLike pl WHERE pl.postId IN :postIds GROUP BY pl.postId")
   List<Object[]> countAndCallerLikedGroupedByPostIdIn(
       @Param("postIds") List<Long> postIds, @Param("userId") UUID userId);
   ```
   Same table, same aggregate shape (`GROUP BY` already caps to one row per post) — no data-volume
   tradeoff. Lives in `post-impl` (`PostLikeRepository`/`PostServiceImpl.getSessionPostLikeInfo`),
   so this half of the ticket touches a different module than the one below.

2. **Participant JOINED-count + caller's own row → 1 query** (medium risk — shared code path).
   `countBySessionIdsAndStatus` (aggregate) and `findBySessionIdInAndUserId` (caller's own row,
   any status) both hit `SessionParticipantRepository` for the same `sessionIds`. Mergeable into
   one row-fetch query, deriving both values in Java:
   ```java
   @Query("SELECT sp FROM SessionParticipant sp WHERE sp.sessionId IN :sessionIds "
        + "AND (sp.status = 'JOINED' OR sp.userId = :callerId)")
   List<SessionParticipant> findJoinedOrCallerBySessionIdIn(
       @Param("sessionIds") List<Long> sessionIds, @Param("callerId") UUID callerId);
   // then group by sessionId in Java: count JOINED entries for participantCount,
   // find the row with userId == callerId for callerParticipation
   ```
   Real tradeoff: swaps an aggregate `COUNT` for fetching full rows — a session with hundreds of
   JOINED participants pulls more bytes per query (still one round trip; latency usually still
   dominates over payload at this scale, but worth confirming before committing). Bigger blast
   radius than #1: this is `session-impl`'s own core batch-resolution path, exercised by every
   session list/detail endpoint — needs full `SessionServiceImplSpec`/`:server:test` coverage
   before landing, not just a `getSession`-scoped check.

**Not reducible, by design — do not attempt:**
- **Users/Sports/Locations queries** — separate domain modules (`user-api`/`sport-api`/
  `location-api`). `CLAUDE.md`'s architecture rule forbids collapsing cross-domain queries into a
  SQL join ("Cross-domain communication through `-api` interfaces only"; "Cross-domain references
  use IDs only — no JPA `@ManyToOne` across domain boundaries") — these calls have to stay
  independent, swappable-to-a-real-RPC interfaces for a future microservice split. Sports is
  already `@Cacheable`, so it's already a non-issue in steady state.
- **Post existence/type check** (`findByIdInAndIsActiveTrue`) — defensive validation that
  `Session.postId` resolves to a real active `SESSION_POST`. Technically droppable (`postId` is
  set once at creation and never changes — see SESSION-10's own notes), but that trades a safety
  net for one query. Flagged, not recommended, unless this endpoint becomes a profiled bottleneck.

**Expected result if #1 and #2 both land:** 8–9 queries → **6** for a single `getSession()` call
(~25–33% fewer round trips). **Not scheduled** — filed for later prioritization, no target date.

**Delta (2026-08-16, at pickup):** shipped narrower than scoped, by explicit user decision. Only
**merge #1** landed (`countAndCallerLikedGroupedByPostIdIn`, exactly as sketched above) —
`post-impl`, low risk. **Merge #2 was deliberately deferred, not attempted** — its payload tradeoff
(aggregate `COUNT` → full-row fetch) and bigger blast radius on `session-impl`'s core batch path
weren't worth taking on in the same pass; the sketch above is still accurate for whoever picks it
up next. Net result: 8–9 queries → **7–8**, not the full **6** originally targeted.

**Bundled addition (not part of the original scoping, added at pickup by user request):**
`leaveSession` now rejects a standalone session's own creator (`BadRequestException`) — they're
auto-`JOINED` at creation (`createSession`) and previously had no gate stopping them from leaving
their own session via this endpoint; `cancelSession` remains their only way out. Scoped to
standalone only — a group-linked session's creator isn't auto-joined and can still leave normally
if they separately joined via `joinSession` (which never blocks the creator). Full writeup:
`modules/session/docs/MVP/SESSION-14_REDUCE_MAPTORESPONSES_ROUND_TRIPS.md`.

---
