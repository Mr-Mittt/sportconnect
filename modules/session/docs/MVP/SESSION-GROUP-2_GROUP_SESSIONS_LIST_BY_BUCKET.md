# SESSION-GROUP-2 · A group's sessions listed by bucket (Ongoing, Scheduled, Preparing, History)

**Status:** `DONE` (2026-11-19)
**Type:** Enhancement · **Depends on:** none (client pair: CLIENT-GROUP-SESSION-2)
**Filed:** 2026-11-19, from the owner's group-session specification ("A new Session tab ... group by 3 collapsible group, Ongoing, Scheduled, and History"); the owner decided PREPARING sessions are not mixed into Scheduled.

`GET /api/sessions/group/{groupId}` (member-only, paged, `SESSION_GROUP_MEMBER_REQUIRED`) has no status filter, so the Sessions tab cannot build its groups. New query parameter `bucket`:
- `ONGOING` = `ONGOING`; `SCHEDULED` = `SCHEDULED` only; `PREPARING` = `PREPARING` (**kept as its own bucket, not shown under Scheduled**, owner 2026-11-19); `HISTORY` = `COMPLETED` and `CANCELLED`.
- No `bucket` keeps today's behaviour (every status), so existing callers do not change.
- Order: ONGOING and SCHEDULED and PREPARING by start ascending, HISTORY by start descending; same page size rules as today. A group that is not active is 404 before the member check is 403 (resource-gate rule, as today).
- Each page row is the existing session response (no taken/open hiding on the server: the client hides slot information, CLIENT-GROUP-SESSION-2).

**Consumer census:** the endpoint's callers (none on the client today; the old per-group fan-out was retired), `getGroupSessions` and its repository query and index use (check the plan with `EXPLAIN` against `group_id, status, scheduled_start`; add an index only if the plan needs it, SESSION-7 style), MSW handlers when the client ticket lands. **Account lifecycle:** read-only, JWT filter applies.

**Out of scope:** counts per bucket (the client shows the loaded counts; file a count endpoint if the tab needs totals), search, filters.

**Tests:** Spock for the status mapping; IT: each bucket returns only its statuses and orders correctly, a non-member is 403, an unknown or inactive group is 404, no `bucket` returns all, a bad `bucket` value is a coded 400.

---

## Implementation summary (2026-11-19)

**Built as filed**, with two corrections to the filed text.
- `GET /api/sessions/group/{groupId}?bucket=` (`GroupSessionBucket` in session-api: `ONGOING` = `ONGOING`; `SCHEDULED` = only `SCHEDULED`; `PREPARING` = only `PREPARING`, its own bucket, never mixed into Scheduled; `HISTORY` = `COMPLETED` + `CANCELLED`). Order is fixed by two derived repository queries (`...StatusInOrderByScheduledStartAsc` / `Desc`): soonest start first, `HISTORY` newest first; the caller's own `Pageable` sort is stripped when a bucket is given (the `/upcoming` rule), paging is kept. No `bucket` is exactly the old behaviour (every status, the caller's own paging and sort). The value is case-insensitive.
- **Correction 1: the member gate is the existing one.** The filed text said "404 before 403"; `getGroupSessions` has answered a single 403 `SESSION_GROUP_MEMBER_REQUIRED` for a non-member, a missing group and an inactive group since SESSION-40 (it deliberately does not leak a group's existence), and that is unchanged.
- **Correction 2: a bad `bucket` is an un-coded 400**, like every other `SessionController` query-parameter check (the SESSION-45 rule: technical validation the client never produces keeps its English message and logs a `warn`), not a registered code.
- **Index.** The queries filter `group_id` and `status` and order by `scheduled_start`, so they are served by `idx_sessions_group_scheduled_start (group_id, scheduled_start)` (V094, SESSION-GROUP-1; it replaced the unique key's index). A group holds tens to hundreds of sessions, so the status filter on that range is cheap; no new index. The `EXPLAIN` was not run (no real Postgres here); if the History bucket of a very old group ever gets slow, a `(group_id, status, scheduled_start)` index is the follow-up.

**Consumer census.** `SessionService.getGroupSessions` changed signature (a nullable `GroupSessionBucket` before the pageable): callers are `SessionController` (updated) and the two existing specs (updated); no other backend module calls it; the client has no hook for this endpoint yet (CLIENT-GROUP-SESSION-2 adds it) and the MSW handlers do not mock it, so nothing to update there. `SessionAccessGateIntegrationTest` (no-bucket paths) is unchanged and green.

**Tests.** `SessionServiceImplSpec` 290 (6 new: the four bucket mappings with order and stripped sort, no bucket unchanged, non-member refused before any query), the whole session-impl suite green; `SessionGroupBucketIntegrationTest` (8: each bucket's statuses and order, PREPARING separate from SCHEDULED, the caller's sort ignored, paging, no bucket keeps all statuses of this group only, case-insensitive and a bad value 400, a non-member 403, an empty bucket), plus the existing group-list ITs. Mutation check: 7 of 7 killed against a passing baseline. **Not run:** `EXPLAIN` on real Postgres, the full `:server:test`, a live server.

**Superseded (2026-11-20, owner, SESSION-GROUP-12):** the `bucket` parameter and `GroupSessionBucket` are removed; the group Sessions tab reads `/today`, `/later`, `/history/dates` and `/history` instead, filtered by a repeatable `status` in the viewer's zone. The plain `GET /api/sessions/group/{groupId}` is unchanged.
