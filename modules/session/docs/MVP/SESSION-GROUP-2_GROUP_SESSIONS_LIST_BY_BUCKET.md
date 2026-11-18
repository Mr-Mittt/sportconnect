# SESSION-GROUP-2 · A group's sessions listed by bucket (Ongoing, Scheduled, Preparing, History)

**Status:** `TODO`
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
