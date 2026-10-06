# A18 · Error code audit: post module

**Status:** `DONE` (2026-10-06)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **post (post-impl)**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-6** lists the final codes.

**Scope:** post create/read/delete, comments and replies, likes, feed/hashtag reads, SESSION_POST-related paths.

**Known messages to start from (not exhaustive — the audit finds the rest):** enumerate at pickup from `PostServiceImpl` and its `ResourceGate` (A14); the client already special-cases a 404 on `usePost`/`useComments`, so the post-not-found and post-forbidden codes are the first priority.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `GET /api/posts/{id}`, comments list, like/unlike (post and comment), create comment | Post missing, soft-deleted, group gone, or a `SESSION_POST` | NOT_FOUND | `POST_NOT_FOUND` | none | Page state (`ResourceUnavailable`); keep the existing no-retry on 404 |
| same | Post exists, caller may not see it (private/friends post, group post for a non-member) | FORBIDDEN | `POST_FORBIDDEN` | none | Page state (forbidden); toast on a like/comment action |
| `GET /api/posts/group/{id}`; `POST /api/posts` (`GROUP_POST`) | Caller not a member (create was 400 → 403) | FORBIDDEN | `POST_GROUP_MEMBER_REQUIRED` | none | Page state on the list; inline banner on the create form |
| `POST /api/posts` (`GROUP_BROADCAST`), `PATCH /{id}/broadcast-end-time` | Not owner/admin (400 → 403) | FORBIDDEN | `POST_BROADCAST_ADMIN_REQUIRED` | none | Toast; control should be hidden by role already |
| `POST /api/posts` | Second active broadcast (400 → 409) | CONFLICT | `POST_BROADCAST_ALREADY_ACTIVE` | none | Inline banner on the create form |
| `POST /api/posts`, `PATCH /{id}/broadcast-end-time` | End time not in the future | VALIDATION | `POST_BROADCAST_END_TIME_PAST` | none | Inline field error on the end time |
| `POST /api/posts` | `USER_FEED` with a group / group type without a group | VALIDATION | `POST_GROUP_NOT_ALLOWED`, `POST_GROUP_ID_REQUIRED` | none | Generic (the form cannot produce either) |
| `POST /api/posts`, `PUT /{id}`, `DELETE /{id}` | System or session post type | VALIDATION | `POST_TYPE_NOT_CREATABLE`, `POST_TYPE_NOT_EDITABLE`, `POST_TYPE_NOT_DELETABLE` | `{postType}` | Generic (diagnostic, the client never offers these) |
| `PATCH /{id}/broadcast-end-time` | Post is not a broadcast | VALIDATION | `POST_NOT_BROADCAST` | none | Generic (diagnostic) |
| `PUT /api/posts/{id}` | Not the author (400 → 403); post missing | FORBIDDEN / NOT_FOUND | `POST_EDIT_FORBIDDEN` / `POST_NOT_FOUND` | none | Toast |
| `DELETE /api/posts/{id}` | Not author or moderator (400 → 403); post missing | FORBIDDEN / NOT_FOUND | `POST_DELETE_FORBIDDEN` / `POST_NOT_FOUND` | none | Toast, then refetch |
| `POST/DELETE /api/posts/{id}/like` (and the session post like route) | Already liked / not liked (400 → 409) | CONFLICT | `POST_ALREADY_LIKED`, `POST_NOT_LIKED` | none | No toast: the UI is already in the wanted state, roll the optimistic update to server truth by refetching |
| comment like/unlike | Already liked / not liked (400 → 409) | CONFLICT | `COMMENT_ALREADY_LIKED`, `COMMENT_NOT_LIKED` | none | Same as post likes |
| comment like/unlike/delete, create reply | Comment missing, soft-deleted, or on another post | NOT_FOUND | `COMMENT_NOT_FOUND` | none | Toast, then refetch the thread |
| `POST /api/posts/{id}/comments` | Reply parent missing | NOT_FOUND | `COMMENT_PARENT_NOT_FOUND` | none | Toast, then refetch the thread |
| comment reply/like/unlike/delete | System comment | VALIDATION | `COMMENT_SYSTEM_READONLY` | `{action: reply\|like\|delete}` | Generic (the client hides these actions on system rows) |
| `DELETE /api/posts/comments/{id}` | Not the author (400 → 403) | FORBIDDEN | `COMMENT_DELETE_FORBIDDEN` | none | Toast |
| every authenticated endpoint above | **Deactivated caller** | n/a | none | n/a | Behaves exactly like an active user until the access token expires — no `isActive` check anywhere in post-impl (U12 known gap, out of scope; no new check added here) |

Hashtag read (`GET /api/posts/hashtag/{tag}`) has no user-reachable error beyond `VALIDATION_FAILED`/401. `HashtagServiceImpl`'s "Post not found" is internal (it runs inside post creation) and is coded `POST_NOT_FOUND` only for consistency.

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-6**, filed alongside this ticket.

**Carried over from group A11 (2026-10-05):** `PostServiceImpl.getPostById` throws an un-coded `NotFoundException("Post not found")` via `postGate.require`, and group's `pinPost` reaches it first. The audit must code that 404 (and the gate's 403 "You don't have access to this post"); once it does, group's `GROUP_POST_NOT_FOUND` (currently unreachable, its `post == null` check never sees a null) can be removed or kept as defensive. Group's pin IT (`GroupErrorCodesIntegrationTest`) does not cover a missing post for this reason.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

**Scope change (2026-10-06, confirmed at pickup):** like group A11, the audit found permission failures thrown as `BadRequestException` (400) where the availability-vs-visibility rule requires 403, and state conflicts that should be 409. The status moves are **in scope**. Consumer census: `PostServiceImplSpec`/`CommentServiceImplSpec` updated in this change; `PostAccessGateIntegrationTest` asserts only 403/404/200 (compatible as-is); `SessionPostAccessGateIntegrationTest.unlikeSession_notCurrentlyLiked` asserted 400 and was updated to 409 (the census grep for `isBadRequest` missed it — it was caught by the `:server:test` run); `session-impl` calls the `*Session*` methods and never catches these exceptions (compatible as-is); the client's only post-module status checks are `=== 404` in `usePost`/`useComments` (compatible as-is); the MSW session like handlers in `client/e2e/mocks/handlers/sessions.ts` still return 400 for already/not liked (mock, not contract — deferred to CLIENT-ERR-6, which exists as a real ticket); `ResourceGate.require` kept its old overload, so the session and notification gates are untouched.

## Implementation summary (2026-10-06)

**Approved design (restated).** Convert every user-reachable throw site in `PostServiceImpl`, `CommentServiceImpl` and `HashtagServiceImpl` to a coded exception, moving the status where it contradicted the availability-vs-visibility rule: permission failures 400 → 403, "already/not liked" and "second active broadcast" 400 → 409, and keeping input/type-rule failures at 400 with a code (and `{postType}` / `{action}` params where the message varies). Add a coded `require(...)` overload to `common`'s `ResourceGate` so the gate's 404/403 carry `POST_NOT_FOUND`/`POST_FORBIDDEN`; the old overload stays. Register 22 codes in `ERROR_CODES.md`. No new endpoints, no DTO changes, no client files. Deactivated callers: recorded in the audit table, no check added (U12).

**What was built.**
- `common`: `ResourceGate.require(resource, viewerId, notFoundCode, notFoundMessage, notVisibleCode, notVisibleMessage)`.
- `post-impl`: ~40 throw sites converted with unchanged English messages; all gate calls use the coded overload. `COMMENT_SYSTEM_READONLY` carries `{action}` (`reply`/`like`/`delete`); the system-post type codes carry `{postType}`.
- `PostController`/`SessionController` `@ApiResponses` descriptions rewritten to the real 400/403/404/409 split.
- Docs: `ERROR_CODES.md` § post, the audit table above, post-impl `CLAUDE.md`, the `ERROR_HANDLING_DESIGN.md` tracker, `PROGRESS.md`.

**Key decisions.**
- One code per reason, not per call site: `POST_NOT_FOUND`/`POST_FORBIDDEN` serve every gated path (post, comment, like), so the client needs one line for each.
- `POST_GROUP_MEMBER_REQUIRED` covers both reading a group's posts and creating a group post as a non-member: same missing right.
- `COMMENT_SYSTEM_READONLY` stays 400 (the rule is a property of the comment's type, not the caller's rights), one code with an `action` param instead of three.
- The `POST_TYPE_NOT_*`, `POST_GROUP_*`, `POST_NOT_BROADCAST` and `COMMENT_SYSTEM_READONLY` codes are diagnostic (the client never offers those actions); CLIENT-ERR-6 may leave them on the generic message.
- Group's `GROUP_POST_NOT_FOUND` stays as defensive code; the pin of a missing post now answers `POST_NOT_FOUND`, asserted in `GroupErrorCodesIntegrationTest`.

**Deviations from the plan.** None in design. The census missed one existing IT assertion (see Scope change); fixed in the same change.

**Tests.** Spock: `PostServiceImplSpec` and `CommentServiceImplSpec` updated (exception types, `errorCode`, and `errorParams` where relevant); post-impl suite green. New `server/src/test/java/com/sportconnect/integration/PostErrorCodesIntegrationTest.java` (36 cases, real MockMvc + H2 + Redis container):
- 404: `POST_NOT_FOUND` (get, soft-deleted, update, like, comment on a missing post), `COMMENT_NOT_FOUND` (delete, like), `COMMENT_PARENT_NOT_FOUND`.
- 403: `POST_FORBIDDEN` (get, comment), `POST_GROUP_MEMBER_REQUIRED` (list, create), `POST_BROADCAST_ADMIN_REQUIRED` (create, extend), `POST_EDIT_FORBIDDEN`, `POST_DELETE_FORBIDDEN`, `COMMENT_DELETE_FORBIDDEN`; allowed-path controls for member read, owner broadcast create and own-post delete.
- 409: `POST_BROADCAST_ALREADY_ACTIVE`, `POST_ALREADY_LIKED`, `POST_NOT_LIKED`, `COMMENT_ALREADY_LIKED`, `COMMENT_NOT_LIKED`.
- 400: `POST_BROADCAST_END_TIME_PAST` (create, extend), `POST_GROUP_NOT_ALLOWED`, `POST_GROUP_ID_REQUIRED`, `POST_TYPE_NOT_CREATABLE`/`EDITABLE`/`DELETABLE` (with `postType`), `POST_NOT_BROADCAST`, `COMMENT_SYSTEM_READONLY` (reply, like, delete, with `action`).

No new tables were needed in the H2 `schema.sql`. Also updated: `GroupErrorCodesIntegrationTest` (+1 case, missing post → `POST_NOT_FOUND`) and `SessionPostAccessGateIntegrationTest` (unlike not liked: 400 → 409 `POST_NOT_LIKED`). Results: `:server:test` 493 tests, 0 failures; `common`, `post-impl`, `group-impl`, `session-impl` and `notification-impl` module tests green. No client files changed, so no Vitest/e2e run applies.

**Hand-off to CLIENT-ERR-6.** The final code list is the `ERROR_CODES.md` § post registry; build the behavior table from the audit table above, not the old messages. Two things to decide there: whether `usePost`/`useComments`' hand-written 404 no-retry is now redundant, and update the MSW like handlers (`sessions.ts` lines ~1033/1053, plus any in `feed.ts`) to return 409 with the new codes.
