# U28 · Finish the audit of "new interaction" paths against the deactivated-account rule

**Status:** `TODO`
**Type:** Testing (audit) · **Depends on:** none
**Filed:** 2026-11-18, the owner's question after SESSION-66: "did you investigate the whole code base for the rule?" The first pass was targeted greps and reads, not exhaustive. Part of the NEXT_TOPICS topic "Deactivated accounts in new interactions".

**The rule** (root `CLAUDE.md` § Account lifecycle, owner 2026-11-18): a lookup to *show* a user includes deactivated accounts (`getUserSummariesByIds` / `getUsersByIds`), a lookup for a *new interaction* excludes them (`getActiveUserIds`, backed by the partial index `idx_users_active_id`, V093), then refuse with a coded error or skip silently, whichever the use case wants.

**First pass (2026-11-18).** Compliant: `sendFriendRequest` (404 for a deactivated target), every name search (the SQL has `is_active = true`), SESSION-66's share, every name display. Gaps, already ticketed: `createSession` invitees (SESSION-68), group `createInvitation` / `addMember` (B24), chat `OpenDirect` (CHAT-23). Left alone on purpose: result-record `playerIds` (they name people who already played: display, not a new interaction).

**To do here.** Read each remaining path, decide compliant or gap, and for a gap **file a ticket in the owning module in the same change** (never a prose note), then record the outcome in the table below and in `NEXT_TOPICS.md`:

| Path | Question |
|---|---|
| session `approveParticipant` / `rejectParticipant` | Approving a requester who was deactivated after asking: refuse, skip, or allow? |
| group `acceptJoinRequest`, `approveInvitation`, `acceptInvitation` (and `acceptJoinRequestAsSideEffect`) | Completing a pending item for a person deactivated since: B24 proposes the same check; confirm. |
| `acceptFriendRequest` | Accepting a request whose sender was deactivated since. |
| notification fan-out (`SessionEventsConsumer`, `SessionEventProcessor`, group and user events) | Rows are written for deactivated recipients (they cannot read them, a reactivated user would see them). Wasted rows only, or filter at write? Weigh the cost of one `getActiveUserIds` per event. |
| group `transferOwnership`, `updateMemberRole`, `removeMember` targets | Existing members: acting on a deactivated owner or admin has its own product question. |
| post / comment `@[Name](userId)` tags (CLIENT-GL-50, NOTIF-12 when built) | A tag is a new interaction (it will notify): the markup must not tag a deactivated user. |
| any other endpoint that takes a user id in the path, body or query (grep `{userId}`, `*Id` request fields, `List<UUID>`) in every module and the Go services | Not yet swept beyond the table above. |

**Out of scope:** changing any behaviour (each gap is its own ticket), the deactivated caller (A25 gate, CHAT-17).

**Tests:** none of its own; each ticket it files carries its own. The deliverable is the filled table and the filed tickets.
