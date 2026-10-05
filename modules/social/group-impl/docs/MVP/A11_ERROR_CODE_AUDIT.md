# A11 · Error code audit: group module

**Status:** `DONE` (2026-10-05)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **group (group-impl)**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-5** lists the final codes.

**Scope:** group CRUD, membership and roles, invitations (the Invite Friend flow in the I18N-4 census), join requests, settings, pinned posts, group sessions entry points.

**Known messages to start from (not exhaustive — the audit finds the rest):** enumerate at pickup from `GroupServiceImpl` and `GroupController` — this module holds most of the 109 `social` throw sites; the Invite Friend failures are the first priority because `useInviteFriendModalData` already shows them verbatim.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `POST /api/groups` | No sport profile for the sport | VALIDATION (400) | `GROUP_SPORT_PROFILE_REQUIRED` | none | Inline banner on the create form |
| `POST /api/groups`, `PUT /{id}`, `PUT /{id}/generalData` | Name taken (400 → 409) | CONFLICT | `GROUP_NAME_TAKEN` | none | Inline field error on the name |
| `GET /{id}` (and every group-scoped path) | Group missing or inactive | NOT_FOUND | `GROUP_NOT_FOUND` | none | Page state (`ResourceUnavailable`) |
| `GET /{id}` | Private group, non-member (400 → 403) | FORBIDDEN | `GROUP_PRIVATE` | none | Page state with a "request to join" path |
| `PUT /{id}`, `PUT /{id}/generalData`, members add/remove, join-request accept/decline/list, pin/unpin, invitation approve/decline/list/declined | Caller is not owner/admin (400 → 403) | FORBIDDEN | `GROUP_ADMIN_REQUIRED` | none | Toast; control should be hidden by role already |
| `DELETE /{id}`, role change, transfer ownership, `PUT /settings`, `PUT /recurrence` | Caller is not the owner (400 → 403) | FORBIDDEN | `GROUP_OWNER_REQUIRED` | none | Toast |
| settings/recurrence/pins reads, `POST /{id}/invitations`, `GET /{id}/invitations/sent` | Caller is not a member (400 → 403) | FORBIDDEN | `GROUP_MEMBER_REQUIRED` | none | Page or tab state |
| `POST /{id}/invitations` | Member invites disabled (400 → 403) | FORBIDDEN | `GROUP_MEMBER_INVITES_DISABLED` | none | Inline row error in Invite Friend |
| `POST /{id}/invitations`, `POST /{id}/members` | Invitee not a friend | VALIDATION | `GROUP_NOT_FRIENDS` | none | Inline row error in Invite Friend (first priority) |
| `POST /{id}/invitations`, `POST /{id}/members`, `POST /join-requests` | Already a member (400 → 409) | CONFLICT | `GROUP_ALREADY_MEMBER` | none | Inline row error; row flips to "Already a member" |
| `POST /{id}/members` | Pending invitation already exists (400 → 409) | CONFLICT | `GROUP_INVITATION_ALREADY_PENDING` | none | Inline row error |
| `POST /join-requests` | Pending request already exists (400 → 409) | CONFLICT | `GROUP_JOIN_REQUEST_ALREADY_PENDING` | none | Inline error; refetch the request state |
| join-request accept/decline/cancel | Request gone / not the requester / not pending / group gone | NOT_FOUND / FORBIDDEN / CONFLICT / NOT_FOUND | `GROUP_JOIN_REQUEST_NOT_FOUND`, `GROUP_REQUESTER_ONLY`, `GROUP_JOIN_REQUEST_NOT_PENDING`, `GROUP_NOT_FOUND` | none | Toast, then refetch the list |
| invitation approve/decline/accept/reject/cancel | Invitation gone / not the invitee or inviter / not pending / group gone | NOT_FOUND / FORBIDDEN / CONFLICT / NOT_FOUND | `GROUP_INVITATION_NOT_FOUND`, `GROUP_INVITEE_ONLY`, `GROUP_INVITER_ONLY`, `GROUP_INVITATION_NOT_PENDING`, `GROUP_NOT_FOUND` | none | Toast, then refetch the list |
| `DELETE /{id}/leave` | Owner cannot leave | VALIDATION | `GROUP_OWNER_CANNOT_LEAVE` | none | Inline message in the leave dialog |
| `DELETE /{id}/members/{userId}` | Target is the owner | VALIDATION | `GROUP_OWNER_CANNOT_BE_REMOVED` | none | Toast |
| `PUT /{id}/members/{userId}/role` | Owner's role changed or assigned | VALIDATION | `GROUP_OWNER_ROLE_PROTECTED` | none | Toast |
| join, accept, invite, add-member | Group at member cap | VALIDATION | `GROUP_MEMBER_CAPACITY_REACHED` | `{max}` | Inline message with the number |
| `POST /{id}/pins` | Pin limit / wrong group or type / already pinned / post missing | VALIDATION / CONFLICT / NOT_FOUND | `GROUP_PIN_LIMIT_REACHED` `{max: 10}`, `GROUP_POST_NOT_PINNABLE`, `GROUP_POST_ALREADY_PINNED`, `GROUP_POST_NOT_FOUND` | `{max}` on the first | Toast |
| `PUT /{id}/recurrence` | Location's sport differs from the group's | VALIDATION | `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH` | none | Inline field error on the location |
| every authenticated endpoint above | **Deactivated caller** | n/a | none | n/a | Behaves exactly like an active user until the access token expires — no `isActive` check anywhere in group-impl (U12 known gap, out of scope; no new check added here) |

Un-coded on purpose (internal seed or data lookups, category copy): group owner/member/admin role, default group type, group type, group settings, group owner, current-owner membership, and the defensive "group has no sport set" check.

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-5**, filed alongside this ticket.

**Scope change (2026-10-05, user-approved at pickup):** the audit found every owner/admin/member
permission failure in `GroupServiceImpl` is a `BadRequestException` (400), where the
availability-vs-visibility rule requires 403 (and 409 for state conflicts, 404 for a vanished group).
The 400→403/409/404 status moves are **in scope here**, not a follow-up. Consumer census for them:
`GroupServiceImplSpec` updated in this change; `GroupControllerTest` mocks `GroupService` so its status assertions are unaffected (compatible as-is); client Invite Friend /
join / settings hooks read `message` or category only, no `status === 400` reliance (compatible
as-is); `SessionServiceImpl.createSession` calls `getGroup` only after `canManageMembers`, so the
private-group check can never fire there (compatible as-is); post-impl/session-impl otherwise call only
boolean `GroupService` methods that never throw (compatible as-is); no group error handlers in MSW.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Implementation summary (2026-10-05)

**Approved design (restated).** Convert every user-reachable throw site in `GroupServiceImpl` to a coded exception and fix the status where it contradicted the availability-vs-visibility rule: permission failures 400 → 403 `ForbiddenException`, state conflicts 400 → 409 `ConflictException`, "Group no longer exists" 400 → 404; validation-type failures stay 400 with a code and, where the message interpolates a value, `errorParams`. Internal seed/data lookups stay un-coded. Register 29 `GROUP_*` codes in `ERROR_CODES.md`, update the Spock spec and add a real-pipeline IT. No new endpoints, no DTO changes; the wire change is `errorCode`/`errorParams` plus the status moves. The 400 → 403 move was added to scope at pickup by the user (see Scope change above).

**What was built.**
- `GroupServiceImpl`: about 75 throw sites converted (messages unchanged, English fallback preserved). Capacity and pin-limit carry `{max}`. Added `ConflictException`/`ForbiddenException` imports.
- `GroupController`: class Javadoc and every `@ApiResponses` 400 entry rewritten to the real 400/403/404/409 split.
- `ERROR_CODES.md` § group, the audit table above, group-impl `CLAUDE.md` rule 6, the `ERROR_HANDLING_DESIGN.md` tracker, `PROGRESS.md`.

**Key decisions.**
- Codes are per *reason*. Three distinct 403 codes (`GROUP_ADMIN_REQUIRED`, `GROUP_OWNER_REQUIRED`, `GROUP_MEMBER_REQUIRED`) let the client tell which right is missing, though it will show the same copy for each (the user kept all three).
- `GROUP_POST_NOT_PINNABLE` covers two sites ("post belongs to a different group" and "not a GROUP_POST"); both mean the post cannot be pinned here and the client needs one line for both.
- "Group has no sport set" (recurrence) left un-coded: defensive, effectively unreachable.

**Deviations from the plan.** None in design. The first IT pass only covered flows backed by tables the H2 test schema already mirrored; a follow-up the same day added `group_join_requests`, `group_invitations`, `group_invitation_inviters` and `group_pinned_posts` to `server/src/test/resources/schema.sql` (mirroring the entities, no cross-domain FKs per B17) and extended the IT over join requests, invitations and pins.

**Findings while writing the IT.** (1) `GROUP_POST_NOT_FOUND` is unreachable through the API: `PostService.getPostById` throws its own un-coded post-module 404 (`postGate.require`) before `pinPost`'s `post == null` check can see a null, so a missing post pins as a plain "Post not found" 404 without a code. That belongs to A18 (post audit); the group-side check is left as defensive. (2) `createInvitation` applies the `allowMemberInvites` setting to every inviter, owner and admin included (pre-existing behavior, unchanged here); an owner invite on a default-settings group is a 403 `GROUP_MEMBER_INVITES_DISABLED`.

**Tests.** `GroupServiceImplSpec`: 43 assertions moved to the new exception type and 31 more gained `errorCode` assertions; group-impl suite green (190). New `server/src/test/java/com/sportconnect/integration/GroupErrorCodesIntegrationTest.java` (43 cases, real MockMvc + H2 round-trip):
- 404: `GROUP_NOT_FOUND` (group, members, pin in a missing group, cancel on a deleted group), `GROUP_JOIN_REQUEST_NOT_FOUND`, `GROUP_INVITATION_NOT_FOUND`.
- 403: `GROUP_PRIVATE` (plus a member-allowed 200 control), `GROUP_MEMBER_REQUIRED` (settings, send invitation, pins read), `GROUP_ADMIN_REQUIRED` (update group, add member, accept join request, list join requests, approve invitation, list invitations, pin, unpin; plus an admin-allowed control), `GROUP_OWNER_REQUIRED` (delete, role change), `GROUP_REQUESTER_ONLY`, `GROUP_INVITEE_ONLY`, `GROUP_INVITER_ONLY`, `GROUP_MEMBER_INVITES_DISABLED`.
- 409: `GROUP_NAME_TAKEN`, `GROUP_ALREADY_MEMBER` (join request, invitation), `GROUP_JOIN_REQUEST_ALREADY_PENDING`, `GROUP_JOIN_REQUEST_NOT_PENDING`, `GROUP_INVITATION_NOT_PENDING` (approve, accept), `GROUP_POST_ALREADY_PINNED`.
- 400: `GROUP_SPORT_PROFILE_REQUIRED`, `GROUP_OWNER_CANNOT_LEAVE`, `GROUP_OWNER_CANNOT_BE_REMOVED`, `GROUP_OWNER_ROLE_PROTECTED`, `GROUP_NOT_FRIENDS`, `GROUP_MEMBER_CAPACITY_REACHED` (`errorParams.max` 3, via a seeded tiny group type), `GROUP_PIN_LIMIT_REACHED` (`max` 10), `GROUP_POST_NOT_PINNABLE` (other group, non-group post).

Spock-only (no IT): `GROUP_MEMBER_NOT_FOUND`, `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH`. `:server:test` 456 tests, 0 failures; group-impl 190, 0 failures. No client files changed, so no Vitest/e2e run applies.

**Hand-off to CLIENT-ERR-5.** The final code list is the `ERROR_CODES.md` § group registry. The classifier now sees 403/409/404 where it used to see 400 for these flows, so CLIENT-ERR-5's per-flow behavior table must be built from the audit table above, not from the old messages.
