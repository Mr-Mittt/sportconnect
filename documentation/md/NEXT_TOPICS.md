# Next topics

A running index of **cross-module topics that span several tickets** and are easy to lose track of
because no single backlog shows the whole picture. Each topic lists every ticket that belongs to it
(with its backlog), what is already done, what was checked and is *not* a gap, and any candidate
that has **no ticket yet**. A candidate with no ticket is the thing this file exists to surface; when
one gets filed, move it into the ticket table.

Not a backlog: tickets live in each module's `BACKLOG_*.md`. Not the idea list: raw ideas live in
`DRAFT_FUNCTIONALITY_IDEAS.md`. Add a topic here when work on one ticket reveals siblings in other
modules.

---

## Redis resilience (found 2026-10-05)

**The problem.** Redis is used as a cache or a side channel in 4 modules, and a Redis outage should
degrade the feature, not fail the request. Only the chat-sync publishers do that today. Found when
two `GroupErrorCodesIntegrationTest` pin cases passed locally (dev Redis running on localhost) and
returned a 500 in CI (no Redis). It is the option post `A8` deferred when it chose Testcontainers
over fallback logic.

**Census of `StringRedisTemplate` use** (6 classes in the Java modules; session and notification do not
use it, and no other Java Redis client exists, see candidate 3 for the Go chat service):

| Class | Use | Guarded today? | Ticket |
|---|---|---|---|
| `PostServiceImpl`, `CommentServiceImpl` (post) | like/comment counters, comment-preview cache | No, a Redis failure is a 500 on every post read | post [`A19`](../../modules/social/post-impl/docs/MVP/A19_REDIS_OUTAGE_DEGRADATION.md) `TODO` |
| `TokenRevocationChecker` (auth) | per-request revocation watermark cache, over a DB source of truth | No, a Redis failure fails **every authenticated request** | auth [`A11`](../../modules/auth/docs/MVP/A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md) `TODO` |
| `GroupServiceImpl`, `UserServiceImpl`, `UserFriendServiceImpl` (chat-sync event publish) | `XADD` to the domain-events stream | **Yes**, catch `Exception` + `log.warn` | none needed for the failure mode; see the candidate below |

**Design notes shared by the two tickets.**
- Treat Redis as a cache: on a read failure fall back to the DB, on a write failure skip it, and log
  a `WARN` that Redis could not be reached. One guard helper, not a try/catch per site.
- Auth needs no fail-open decision: the DB watermark keeps revocation exact; the cost is one DB query
  per authenticated request while Redis is down. Its log line must be rate-limited (it runs per
  request).
- If post `A19`'s guard helper lands in `common`, auth `A11` should reuse it. File order is free;
  whichever is picked up first decides where the helper lives.

**Related, already done.** post `A8` (`server:test` Redis via Testcontainers), post `B3` (Redis like
counters), post `B4` (comment preview cache). `RedisBaseIT` in `server/src/test/java/.../integration/`
is the test base for any IT that touches Redis-backed code; `GroupErrorCodesIntegrationTest` extends
it for the pin cases, and may go back to `BaseIT` once `A19` ships.

**Candidates with no ticket yet** (decide whether to file):
1. **Chat-sync events are lost, not retried, when Redis is down.** The publishers log a `WARN` and drop
   the event, so the chat service's caches (`group_members_cache`, `friendships_cache`,
   `user_profiles_cache`) silently drift until something re-syncs them. Whether that is acceptable, or
   whether this wants the transactional-outbox mechanism (common `C3`) or a reconcile job, is a design
   call. Start from `services/chat/docs/SYNC_DESIGN.md`. Not filed: needs a decision first.
2. **Redis operations** (HA, persistence, monitoring, alerting, memory limits). Nothing exists beyond
   the dev compose file; belongs with the hosting decision (`infra` `INFRA-3`). Not filed.
3. **The chat service's Redis stream consumer (Go).** Checked 2026-10-05: on the Java side no other
   Redis client exists (only the 6 classes above; `@Cacheable("sports")` has no Redis cache type
   configured, so it is in-process). The Go side reads the domain-events stream in
   `services/chat/internal/sync/consumer.go`; what it does when Redis is unreachable (reconnect with
   backoff, crash, or spin) was **not** checked. Look before declaring the topic closed, and file a
   `chat` ticket if it is not resilient.

---

## Group visibility enhancement (noted 2026-10-06)

**Status.** Not yet refined: the goal and scope are still to be defined with the user, and **no ticket
is filed**. This entry only records what is already known so the refinement session starts from facts.

**What is known (found while building CLIENT-ERR-5).**
- `GET /api/groups/{id}` returns 403 `GROUP_PRIVATE` for a non-member of a private group, and the full
  group (including pinned posts) for a public one. `GET /{id}/info` and `/{id}/generalData` instead
  return a stub (id, name, `isPrivate`) for a non-member of a private group.
- The client never calls `GET /groups/{id}`. It only opens groups the current user is already a member
  of (the groups list and the space switcher), and there is no group URL route. So today a non-member
  cannot view any group, public or private.
- `GROUP_PRIVATE` already has en + vi copy in `errors:codes` but no UI uses it: CLIENT-ERR-5 dropped
  the planned "request to join" page state for that reason.

**Not yet checked.** Whether private groups appear in the Join Group search (`usePublicGroups` suggests
public only; the backend filter was not read).

**Candidates with no ticket yet** (decide after refinement):
1. Whatever "visibility" ends up meaning: a non-member view of a group, a public/private presentation,
   or discovery. To be defined.
