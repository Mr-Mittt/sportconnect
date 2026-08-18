# Session Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/session/session-impl`
**Last updated:** 2026-08-16

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [SESSION-8](MVP/SESSION-8_SESSION_DISCOVER_RANKING_ALGORITHM.md) | Session discover ranking algorithm | `TODO` |
| 2 | [SESSION-16](MVP/SESSION-16_FIX_JOINSESSION_DEMOTING_AN_ALREADY_JOINED_CALLER_BACK.md) | Fix `joinSession` demoting an already-`JOINED` caller back to `REQUESTED` | `TODO` |
| 3 | [SESSION-18](MVP/SESSION-18_NOTIFY_JOINED_PARTICIPANTS_WHEN_A_SESSION_TRANSITIONS_TO.md) | Notify JOINED participants when a session transitions to ONGOING | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [SESSION-17](MVP/SESSION-17_OUTBOX_PENDING_PARTIAL_INDEX.md) | Partial index on `session_outbox_events` scoped to `status = 'PENDING'` | `DONE` |
| 2 | [SESSION-14](MVP/SESSION-14_REDUCE_MAPTORESPONSES_ROUND_TRIPS.md) | Reduce `mapToResponses`' round trips (2 points) | `DONE` |
| 3 | [SESSION-15](MVP/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md) | Notification outbox wiring — closes NOTIF-1 | `DONE` |
| 4 | [SESSION-10](MVP/SESSION-10_SESSION_POST_COMMENTS.md) | Session comments — reuses post-impl's Comment via a companion `SESSION_POST` anchor | `DONE` |
| 5 | [SESSION-12](MVP/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md) | Partial index on `sessions` scoped to `status = SCHEDULED` for the generation job's hot queries | `DONE` |
| 6 | [SESSION-13](MVP/SESSION-13_SESSIONRESPONSE_LIKECOUNT_ISLIKEDBYCURRENTUSER_POSTSERVICE_G.md) | `SessionResponse.likeCount`/`isLikedByCurrentUser` + `PostService.getSessionPostLikeInfo` batch method | `DONE` |
| 7 | [SESSION-11](MVP/SESSION-11_DROP_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on session tables' cross-domain columns | `DONE` |
| 8 | [SESSION-9](MVP/SESSION-9_CALLER_PARTICIPATION_STATUS.md) | Expose the caller's own participant status (any status) via getSessionParticipants | `DONE` |
| 9 | [SESSION-4](MVP/SESSION-4_STANDALONE_DISCOVERY.md) | Standalone session discovery — browse/join sessions you didn't create | `DONE` |
| 10 | [SESSION-5](MVP/SESSION-5_CAPACITY_AND_FEE.md) | Session capacity + fee/pricing | `DONE` |
| 11 | [SESSION-6](MVP/SESSION-6_JOIN_APPROVAL_AND_INVITES.md) | Join-approval workflow + invite-friends-at-creation | `DONE` |
| 12 | [SESSION-7](MVP/SESSION-7_PARTIAL_INDEX_ON_SESSIONS_SPORT_ID.md) | Partial index on `sessions.sport_id` for standalone sport filtering | `DONE (bundled into SESSION-4)` |
| 13 | [SESSION-1](MVP/SESSION-1_SESSION_DOMAIN_CORE.md) | Session domain core — manual create/join/leave, group or standalone | `DONE` |
| 14 | [SESSION-2](MVP/SESSION-2_SCHEDULED_AUTO_GENERATION_JOB.md) | Scheduled auto-generation job for group-recurring sessions | `DONE` |
| 15 | [SESSION-3](MVP/SESSION-3_FULL_STATUS_LIFECYCLE.md) | Full status lifecycle (ONGOING, CANCELLED) + cancel reason/who/when | `DONE` |
