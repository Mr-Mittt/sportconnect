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
| `TokenRevocationChecker` (auth) | per-request revocation watermark cache, over a DB source of truth | **Yes (A11, 2026-10-09)**, via `common.cache.CacheGuard`; falls back to the DB watermark | auth [`A11`](../../modules/auth/docs/MVP/A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md) `DONE` |
| `GroupServiceImpl`, `UserServiceImpl`, `UserFriendServiceImpl` (chat-sync event publish) | `XADD` to the domain-events stream | **Yes**, catch `Exception` + `log.warn` | none needed for the failure mode; see the candidate below |

**Design notes shared by the two tickets.**
- Treat Redis as a cache: on a read failure fall back to the DB, on a write failure skip it, and log
  a `WARN` that Redis could not be reached. One guard helper, not a try/catch per site.
- Auth needs no fail-open decision: the DB watermark keeps revocation exact; the cost is one DB query
  per authenticated request while Redis is down. Its log line must be rate-limited (it runs per
  request).
- A11 picked up first, so the shared guard is `common.cache.CacheGuard`; post `A19` and auth `A12` reuse it. (Was: file order is free;
  whichever is picked up first decides where the helper lives.)

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

---

## Phone account (noted 2026-10-20)

**The topic.** An account identified by a phone number instead of (or besides) an email: sign-up, sign-in,
recovery, verification. The realm side is built; the people-facing side is not, and all of it waits on one
decision nobody has made: **how a phone number is verified and how a code reaches it** (SMS, Zalo or something
else). On 2026-10-20 the owner moved the three open tickets below from the MVP backlogs to V1 (the Keycloak
social-login chain no longer lists them as pending).

**Tickets** (all `TODO`, all in V1):

| Ticket | Backlog | What |
|---|---|---|
| [`A22`](../../modules/auth/docs/V1/A22_USERS_WITHOUT_EMAIL_RECOVERY_AND_NOTIFICATION_PATH.md) | auth V1 | Accounts with no email (phone-only, Zalo) have no recovery or notification path. |
| [`A34`](../../modules/auth/docs/V1/A34_SOCIAL_PROVIDERS_FACEBOOK_AND_ZALO.md) | auth V1 | Facebook and Zalo providers. Postponed; Zalo often returns no email, so it creates phone-only accounts. |
| `AUTH-18` | client V1 (inline) | Register and login pages for a phone number (Keycloak theme). Depends on A22's recovery answer. |

**Already done** (the foundation): `U23` (nullable email, unique E.164 phone), `A27` (Keycloak extension: unique
phone, email-or-phone, sign-in by phone), `U25` (`phone_status`, an unparseable phone is saved as `INVALID`).

**Related, still in MVP:** the phone half of `A33` (verify a phone and set `phone_status` to `VERIFIED`) is parked
with these; the email half of `A33` is not and is the next ticket of the social-login chain. The confirmation
code of `U24` and `ACCOUNT-6` needs an email, so a phone-only user can confirm a deactivation or password change
only with the current password (`VERIFICATION_EMAIL_UNAVAILABLE`); a phone code channel would fix that too.

**Candidates with no ticket yet:**
1. **The phone-code delivery decision** (SMS provider, Zalo, or none): the blocker for everything above. Decide
   before picking up A22, the phone half of A33 or AUTH-18; file the ticket(s) it produces.
2. **A phone channel for the U24 confirmation code**, once (1) exists.
