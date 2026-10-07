# Error codes registry

**Owner:** `modules/common` (C12). Every module adds its codes here when it converts throw sites (the Phase B audits in `ERROR_HANDLING_DESIGN.md`). Program design: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## Wire contract

```json
{ "success": false, "message": "Widget must be at least 5",
  "errorCode": "WIDGET_TOO_SMALL", "errorParams": { "min": 5 },
  "data": null, "timestamp": "..." }
```

- `errorCode` and `errorParams` are omitted when null (success responses and un-coded errors serialize exactly as before C12).
- `message` is always the English fallback. The client looks up `errors:<CODE>`, then the category copy, then `message`.
- `data` is always null on an error. (Validation used to put its field map in `data`; C12 moved it to `errorParams.fields`. The only reader was one Spock assertion, updated in C12.)
- `errorParams` holds the values interpolated into `message`, so the client can interpolate them into its own copy. An empty map is sent as omitted.

## Category (derived from the HTTP status; never sent on the wire)

| Status | Category | Notes |
|---|---|---|
| 401 | `UNAUTHENTICATED` | **Status-only, no code.** The client reacts to the 401 itself (silent refresh, then `/login`). The 401 is written by `JwtAuthenticationEntryPoint` in the security filter chain, outside `GlobalExceptionHandler`. |
| 403 | `FORBIDDEN` | Visibility failed: the resource exists but the caller may not see it. |
| 404 | `NOT_FOUND` / `UNAVAILABLE` | Availability failed (soft-deleted, parent gone). See CLAUDE.md § Resource access. |
| 400 | `VALIDATION` | Malformed or invalid input. |
| 409 | `CONFLICT` | Well-formed request that clashes with current state. Thrown as `ConflictException`. |
| 5xx | `INTERNAL` | Unexpected failure. |
| no response | `NETWORK` | Client-side only. |

## Naming rule

`<DOMAIN>_<REASON>`, upper snake case, stable once shipped (the client keys its copy on it): `EMAIL_ALREADY_REGISTERED`, `GROUP_NOT_FOUND`. A code names the *reason*, not the HTTP status. Params are named after what the message interpolates.

## How a module adds a code

1. Pick the exception that already gives the right status (`BadRequestException`, `ForbiddenException`, `NotFoundException`/`ResourceNotFoundException`, `ConflictException`, `UnauthorizedException`).
2. Throw the coded constructor: `new BadRequestException("WIDGET_TOO_SMALL", "Widget must be at least 5", Map.of("min", 5))`. For `ResourceNotFoundException` use `ResourceNotFoundException.coded(code, message, params)`; its constructor form would clash with the legacy `(String, String, Object)` one.
3. Keep `message` as the English text it was before.
4. Add a row below, with the module and the status.
5. Moving a site from 400 to 409 is a contract change: do the consumer census in that module's ticket.

## Registry

### common (framework-level, emitted by `GlobalExceptionHandler`)

| Code | Status | Params | When |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | `{fields: {<field>: <message>}}` | A `@Valid` request body failed bean validation. |
| `MISSING_PARAMETER` | 400 | `{param}` | A required `@RequestParam` was omitted. |
| `MALFORMED_REQUEST` | 400 | none | Unreadable body or an un-bindable path variable/parameter type. |
| `ACCESS_DENIED` | 403 | none | Spring Security denied the call (`@PreAuthorize`). |
| `ENDPOINT_NOT_FOUND` | 404 | none | No handler for the path. |
| `METHOD_NOT_ALLOWED` | 405 | none | Wrong HTTP method. |
| `NOT_ACCEPTABLE` | 406 | none | Unsatisfiable `Accept`. |
| `REQUEST_TOO_LARGE` | 413 | none | Body too large. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | none | Wrong `Content-Type`. |
| `SERVICE_UNAVAILABLE` | 503 | none | Framework-reported unavailability. |
| `INTERNAL_ERROR` | 5xx | none | Unhandled exception (catch-all) and other framework 5xx. The real cause is only in the server log. |

### Module codes

#### auth (A8, `AuthServiceImpl`, `AuthController`, `EmailVerificationService`, `PasswordResetService`)

| Code | Status | Params | When |
|---|---|---|---|
| `EMAIL_ALREADY_REGISTERED` | 409 | none | `POST /api/auth/register` with an email that already exists (moved from 400 by A8). |
| `INVALID_CREDENTIALS` | 401 | none | `POST /api/auth/login`: wrong password, unknown email, or a deactivated account (indistinguishable by design). |
| `REFRESH_TOKEN_MISSING` | 401 | none | `POST /api/auth/refresh` without the refresh cookie. |
| `REFRESH_TOKEN_INVALID` | 401 | none | `POST /api/auth/refresh` with a token that is not in the store. |
| `REFRESH_TOKEN_EXPIRED_OR_REVOKED` | 401 | none | `POST /api/auth/refresh` with an expired or revoked token (what a deactivated user normally gets). |
| `ACCOUNT_DEACTIVATED` | 401 | none | Refresh for a deactivated user. **Currently unreachable**: the user lookup throws a 404 first (ticket A9). |
| `VERIFICATION_TOKEN_INVALID` | 404 | none | `POST /api/auth/verify-email` with an unknown token. |
| `EMAIL_ALREADY_VERIFIED` | 400 | none | `POST /api/auth/verify-email` with an already-used token. |
| `VERIFICATION_TOKEN_EXPIRED` | 400 | none | `POST /api/auth/verify-email` with an expired token. |
| `RESET_TOKEN_INVALID` | 404 | none | `POST /api/auth/reset-password` with an unknown token. |
| `RESET_TOKEN_USED` | 400 | none | `POST /api/auth/reset-password` with an already-used token. |
| `RESET_TOKEN_EXPIRED` | 400 | none | `POST /api/auth/reset-password` with an expired token. |

The 401 written by `JwtAuthenticationEntryPoint` (missing/invalid access token) deliberately has **no code** (C12 decision; A8 left its text unchanged).


#### user (U21, `UserServiceImpl`, `UserPreferenceServiceImpl`, `UserFriendServiceImpl`)

| Code | Status | Params | When |
|---|---|---|---|
| `USER_PROFILE_NOT_OWNED` | 403 | none | `PUT /api/users/{id}/profile` for someone else's id. |
| `HEIGHT_OUT_OF_RANGE` | 400 | `{min: 50, max: 300}` | Profile update, `heightCm` outside the range. |
| `WEIGHT_OUT_OF_RANGE` | 400 | `{min: 20, max: 300}` | Profile update, `weightKg` outside the range. |
| `SHOE_SIZE_OUT_OF_RANGE` | 400 | `{min: 10, max: 500}` | Profile update, `shoeSizeMm` outside the range (millimetres since U21; the field was `shoeSizeCm`). |
| `GENDER_INVALID` | 400 | `{allowed: ["MALE", "FEMALE"]}` | Profile update, `gender` not exactly one of the allowed values. |
| `LANGUAGE_UNKNOWN` | 400 | `{language}` | Preferences update, or register, with a language code that is unknown or inactive. |
| `LOCATION_INCOMPLETE` | 400 | none | Register with only one of latitude/longitude. |
| `LOCATION_OUT_OF_RANGE` | 400 | none | Register with a coordinate outside -90..90 / -180..180. |
| `CURRENT_PASSWORD_INCORRECT` | 400 | none | `PUT /api/users/me/password` with a wrong current password. |
| `SEARCH_KEYWORD_TOO_SHORT` | 400 | `{min: 2}` | `GET /api/users/search` with fewer than 2 characters after trimming. |
| `FRIEND_REQUEST_SELF` | 400 | none | Friend request addressed to the caller. |
| `USER_NOT_FOUND` | 404 | none | Friend request whose receiver does not exist or is deactivated. Other user lookups stay un-coded (category copy). |
| `FRIEND_REQUEST_NOT_FOUND` | 404 | none | Accept, decline or cancel of a request that does not exist or is not the caller's to act on. |
| `ALREADY_FRIENDS` | 409 | none | Friend request to an existing friend (moved from 400 by U21). |
| `FRIEND_REQUEST_ALREADY_PENDING` | 409 | none | Friend request while the caller's own request is still pending (moved from 400 by U21). |
| `FRIEND_REQUEST_NOT_PENDING` | 409 | none | Accept, decline or cancel of a request that is no longer pending (moved from 400 by U21). |
| `NOT_FRIENDS` | 409 | none | Unfriend someone who is not a friend (moved from 400 by U21). |

#### sport (A25, `UserSportProfileServiceImpl`, `SportServiceImpl`, `SportController`; user-reachable errors only)

| Code | Status | Params | When |
|---|---|---|---|
| `SPORT_PROFILE_ALREADY_EXISTS` | 409 | `{sportName}` | `POST /api/sports/profiles` (create, or resume) while the caller already holds an active profile for the sport (moved from 400 by A25). |
| `PROFILE_NOT_RESUMABLE` | 400 | `{sportName}` | Create with `isResume: true` when the caller has no deactivated profile for the sport. |
| `PROFILE_ATTRIBUTES_TOO_LARGE` | 400 | `{maxBytes: 4096}` | Create or update where the filtered `attributes` exceed 4 KB. Backend/diagnostic code: the client shows the generic message, no dedicated copy. |
| `PROFILE_ATTRIBUTES_INVALID` | 400 | none | `attributes` cannot be serialized (defensive; effectively unreachable). |
| `SPORT_PROFILE_NOT_OWNED` | 403 | none | View, update or delete of another user's sport profile. |
| `SPORT_PROFILE_NOT_FOUND` | 404 | none | Profile by id, or the caller's profile for a sport, missing or soft-deleted (get, update, delete). |
| `SPORT_NOT_FOUND` | 404 | none | A missing or deactivated sport on a user-reachable path: `GET /api/sports/{id}`, the user schema reads, and creating a profile. Also emitted on the same lookup for `location`, `session` and `group` creates. |

Not coded by A25 (admin-only, no localization needed): duplicate sport name, the admin sport create/update/delete and schema `PUT`/`/all` 404s, and the `common.attributes` schema validators. Bean-validation failures on the profile body use `VALIDATION_FAILED`. The group-create gate `You must have a sport profile for this sport to create a group` is a group error (A11).

Not coded by U21: the generic `User not found with id …` 404s (lookups, profile, password and preferences for a missing or deactivated caller use the category copy), and the three `ReferenceService.requireValidSelection` 400s (country/region selection), which REF-5 coded (§ reference).
#### group (A11, `GroupServiceImpl`, `GroupController`)

A11 also moved statuses: owner/admin/member/invitee permission failures went 400 → 403, state conflicts 400 → 409, and "Group no longer exists" 400 → 404 (consumer census in the ticket). The three 403 owner/admin/member codes are distinct on the wire but the client shows the same copy for each.

| Code | Status | Params | When |
|---|---|---|---|
| `GROUP_NOT_FOUND` | 404 | none | Any group-scoped call for a group that does not exist or is no longer active (including cancelling a join request or invitation of a deleted group, moved from 400 by A11). |
| `GROUP_INVITATION_NOT_FOUND` | 404 | none | Approve, decline, accept, reject or cancel of an invitation that does not exist. |
| `GROUP_JOIN_REQUEST_NOT_FOUND` | 404 | none | Accept, decline or cancel of a join request that does not exist. |
| `GROUP_MEMBER_NOT_FOUND` | 404 | none | Role change or ownership transfer targeting someone who is not a member. |
| `GROUP_POST_NOT_FOUND` | 404 | none | Pinning a post that does not exist. |
| `GROUP_PRIVATE` | 403 | none | `GET /api/groups/{id}` for a private group by a non-member (moved from 400 by A11). |
| `GROUP_ADMIN_REQUIRED` | 403 | none | A write or admin read needing owner or admin (update, add/remove member, accept/decline join requests, pin/unpin, approve/decline invitations, view invitations). Moved from 400 by A11. |
| `GROUP_OWNER_REQUIRED` | 403 | none | A write needing the owner (delete, change a role, transfer ownership, update settings or recurrence). Moved from 400 by A11. |
| `GROUP_MEMBER_REQUIRED` | 403 | none | A member-only read or action (settings, recurrence, pinned posts, send invitation, own sent invitations). Moved from 400 by A11. |
| `GROUP_INVITEE_ONLY` | 403 | none | Accept or reject an invitation addressed to someone else. |
| `GROUP_REQUESTER_ONLY` | 403 | none | Cancel a join request that is not the caller's. |
| `GROUP_INVITER_ONLY` | 403 | none | Cancel an invitation the caller did not send. |
| `GROUP_MEMBER_INVITES_DISABLED` | 403 | none | A member invites someone while the group disallows member invitations. |
| `GROUP_NAME_TAKEN` | 409 | none | Create or update where another group already holds the name (moved from 400 by A11). |
| `GROUP_ALREADY_MEMBER` | 409 | none | Join request, invitation or add-member for someone who is already a member (moved from 400 by A11). |
| `GROUP_JOIN_REQUEST_ALREADY_PENDING` | 409 | none | A second pending join request for the same group. |
| `GROUP_INVITATION_ALREADY_PENDING` | 409 | none | Add-member for someone who already has a pending invitation. |
| `GROUP_JOIN_REQUEST_NOT_PENDING` | 409 | none | Accept, decline or cancel of a join request that is no longer pending. |
| `GROUP_INVITATION_NOT_PENDING` | 409 | none | Approve, decline, accept, reject or cancel of an invitation that is not in the required state. |
| `GROUP_POST_ALREADY_PINNED` | 409 | none | Pinning a post that is already pinned. |
| `GROUP_SPORT_PROFILE_REQUIRED` | 400 | none | Create a group without an active sport profile for the sport. |
| `GROUP_NOT_FRIENDS` | 400 | none | Invite or add someone who is not a friend. |
| `GROUP_OWNER_CANNOT_LEAVE` | 400 | none | The owner calls leave without transferring ownership first. |
| `GROUP_OWNER_CANNOT_BE_REMOVED` | 400 | none | Removing the owner from the group. |
| `GROUP_OWNER_ROLE_PROTECTED` | 400 | none | Changing the owner's role, or assigning the owner role through the role endpoint. |
| `GROUP_MEMBER_CAPACITY_REACHED` | 400 | `{max}` | A join, invite acceptance or add-member that would exceed the group type's member cap. |
| `GROUP_PIN_LIMIT_REACHED` | 400 | `{max: 10}` | Pinning an eleventh post. |
| `GROUP_POST_NOT_PINNABLE` | 400 | none | Pinning a post from another group, or one that is not a `GROUP_POST`. |
| `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH` | 400 | none | Setting a recurrence location whose sport differs from the group's. |

Not coded by A11: the internal seed or data lookups (group owner role, member role, admin role, default group type, group type, group settings, group owner, current-owner membership), which use the category copy, and `Group has no sport set — cannot validate a sport-specific location` (defensive, effectively unreachable). `getGroup` of a missing group, and all other group lookups by id, use `GROUP_NOT_FOUND`.

#### post (A18, `PostServiceImpl`, `CommentServiceImpl`, `HashtagServiceImpl`, `PostGate`)

A18 moved statuses the same way A11 did: permission failures 400 → 403, "already liked / not liked" and "second active broadcast" 400 → 409. The session comment proxy (`SessionService.createSessionComment` and friends) reaches the same comment and like codes. `ResourceGate` gained a coded `require(...)` overload for the gate's 404/403 pair.

| Code | Status | Params | When |
|---|---|---|---|
| `POST_NOT_FOUND` | 404 | none | Any post-scoped call for a post that does not exist, is soft-deleted, has an inactive group, or is a `SESSION_POST` reached through `/api/posts/**` (get, update, delete, extend broadcast, like, unlike, comment on it, hashtag extraction, and the session-post prechecks). |
| `POST_FORBIDDEN` | 403 | none | The post exists but the caller may not see it (private or friends-only `USER_FEED` post, group post for a non-member): get, like, unlike, comment, list comments, like or unlike one of its comments. |
| `POST_GROUP_MEMBER_REQUIRED` | 403 | none | `GET /api/posts/group/{id}` by a non-member; creating a `GROUP_POST` in a group the caller is not in (moved from 400 by A18). |
| `POST_BROADCAST_ADMIN_REQUIRED` | 403 | none | Creating or extending a `GROUP_BROADCAST` without being owner or admin (moved from 400 by A18). |
| `POST_EDIT_FORBIDDEN` | 403 | none | `PUT /api/posts/{id}` by someone who is neither the author nor (for a broadcast) a group moderator (moved from 400 by A18). |
| `POST_DELETE_FORBIDDEN` | 403 | none | `DELETE /api/posts/{id}` by someone who is neither the author nor a group moderator (moved from 400 by A18). |
| `POST_TYPE_NOT_CREATABLE` | 400 | `{postType}` | Creating a `GROUP_SYSTEM` or `SESSION_POST` post directly. Diagnostic: the client never offers these. |
| `POST_TYPE_NOT_EDITABLE` | 400 | `{postType}` | Editing a `GROUP_SYSTEM` or `SESSION_POST` post. Diagnostic. |
| `POST_TYPE_NOT_DELETABLE` | 400 | `{postType}` | Deleting a `GROUP_SYSTEM` or `SESSION_POST` post. Diagnostic. |
| `POST_GROUP_NOT_ALLOWED` | 400 | none | Creating a `USER_FEED` post with a `groupId`. |
| `POST_GROUP_ID_REQUIRED` | 400 | none | Creating a `GROUP_POST` or `GROUP_BROADCAST` without a `groupId`. |
| `POST_BROADCAST_ALREADY_ACTIVE` | 409 | none | Creating a broadcast while the group already has an active one (moved from 400 by A18). |
| `POST_BROADCAST_END_TIME_PAST` | 400 | none | Creating or extending a broadcast with an end time that is not in the future. |
| `POST_NOT_BROADCAST` | 400 | none | `PATCH /api/posts/{id}/broadcast-end-time` on a post that is not a `GROUP_BROADCAST`. |
| `POST_ALREADY_LIKED` | 409 | none | Liking a post the caller already liked (moved from 400 by A18). Also on the session post like route. |
| `POST_NOT_LIKED` | 409 | none | Unliking a post the caller has not liked (moved from 400 by A18). Also on the session post like route. |
| `COMMENT_NOT_FOUND` | 404 | none | Delete, like or unlike of a comment that does not exist, is soft-deleted, or belongs to a different post than the session route names. |
| `COMMENT_PARENT_NOT_FOUND` | 404 | none | Replying to a parent comment that does not exist. |
| `COMMENT_SYSTEM_READONLY` | 400 | `{action: reply\|like\|delete}` | Replying to, liking, unliking or deleting a system comment (session joins and leaves). |
| `COMMENT_DELETE_FORBIDDEN` | 403 | none | Deleting someone else's comment (moved from 400 by A18). |
| `COMMENT_ALREADY_LIKED` | 409 | none | Liking a comment the caller already liked (moved from 400 by A18). |
| `COMMENT_NOT_LIKED` | 409 | none | Unliking a comment the caller has not liked (moved from 400 by A18). |

Not coded by A18: none of the post-module sites are left un-coded. Bean-validation failures on post and comment bodies use `VALIDATION_FAILED`. A deactivated caller gets no special answer from any of these endpoints (U12 known gap, no check added).

#### session (SESSION-45, `SessionServiceImpl`, `SessionController`, `SessionGate`, `SessionDetailGate`)

SESSION-45 moved statuses the same way A11 and A18 did: permission failures 400 → 403, state conflicts 400 → 409, a missing pending join request 400 → 404. The session comment proxy reaches the post `COMMENT_*`/`POST_*` codes as well (see § post).

| Code | Status | Params | When |
|---|---|---|---|
| `SESSION_NOT_FOUND` | 404 | none | Any session-scoped call (detail, comments, likes, join, leave, cancel, update, approve, reject) for a session that does not exist, or whose parent group is no longer active (gate paths). |
| `SESSION_JOIN_REQUEST_NOT_FOUND` | 404 | none | Approve or reject for a user with no `REQUESTED` participant row (moved from 400 by SESSION-45). |
| `SESSION_FORBIDDEN` | 403 | none | The session exists but the caller may not see it: `GET /api/sessions/{id}` (`SessionDetailGate`) and the comments/likes routes (`SessionGate`). |
| `SESSION_GROUP_MEMBER_REQUIRED` | 403 | none | `GET /api/sessions/group/{id}` by a non-member; joining a group session as a non-member (moved from 400). |
| `SESSION_GROUP_ADMIN_REQUIRED` | 403 | none | Creating a group session, or modifying, cancelling, approving or rejecting on one, without being group owner or admin (moved from 400). |
| `SESSION_CREATOR_REQUIRED` | 403 | none | Modifying, cancelling, approving or rejecting on a standalone session without being its creator (moved from 400). |
| `SESSION_CANCELLED` | 409 | none | Join, approve or reject on a cancelled session (moved from 400). |
| `SESSION_NOT_CANCELLABLE` | 409 | `{status}` | Cancelling a session that is already `COMPLETED` or `CANCELLED` (moved from 400). |
| `SESSION_NOT_PREPARING` | 409 | none | Changing `locationId`/`feeType` once the session is past `PREPARING` (moved from 400). |
| `SESSION_NOT_PARTICIPANT` | 409 | none | Leaving a session the caller has no active participant row in (moved from 400). |
| `SESSION_CREATOR_CANNOT_LEAVE` | 400 | none | The creator of a standalone session calls leave (cancel is their way out). |
| `SESSION_SPORT_REQUIRED` | 400 | none | Creating a standalone session without `sportId`. |
| `SESSION_LOCATION_SPORT_MISMATCH` | 400 | none | Create or update with a `locationId` whose sport differs from the session's. |
| `SESSION_FEE_AMOUNT_REQUIRED` | 400 | none | `feeType` FIXED without `feeAmountVnd`. |

Deliberately **not coded** (user decision, SESSION-45): the technical validation 400s — session attributes too large or unserializable, an invalid `viewerZoneId`, and the 11 `SessionController` query-parameter checks on upcoming/history/discover/counts. They keep their English `message`, the client shows the generic copy, and each throw site logs a `warn` with the offending value. A sport or location missing on create/update surfaces the `SPORT_NOT_FOUND` code (§ sport) or the location module's own error (LOC-6). A deactivated caller gets no special answer from any session endpoint (U12 known gap, no check added). A deleted group makes join/modify/cancel/approve answer a 403 group code rather than `SESSION_NOT_FOUND`, because the group membership check fails first.

#### reference (REF-5, `ReferenceServiceImpl`, `ReferenceController`)

The module's four endpoints are public reads (plus `POST /resolve`); only the geo-selection checks that user flows run through `ReferenceService.requireValidSelection` and the regions list can fail in a way a user can act on. No status moved: the 400s stay 400, the 404 stays 404. Language errors are `LANGUAGE_UNKNOWN` (§ user, coded by U21), not repeated here.

| Code | Status | Params | When |
|---|---|---|---|
| `COUNTRY_NOT_FOUND` | 404 | none | `GET /api/reference/countries/{id}/regions` for an unknown or inactive country. |
| `COUNTRY_UNKNOWN` | 400 | `{country}` | A country/region selection (register, profile update) naming an unknown or inactive country. |
| `REGION_UNKNOWN` | 400 | `{region, country}` | The selected region is unknown, inactive, or not in the selected country (one code: a client cannot act differently on the three causes; a region deactivated by a data refresh such as REF-3 lands here). |
| `REGION_COUNTRY_REQUIRED` | 400 | none | A region sent without any country. |

Deliberately **not coded**: the `POST /api/reference/resolve` request validation (more than 10 locales, a locale over 35 characters, a `timeZoneId` over 64, a coordinate out of range, only one of latitude/longitude) stays the generic `VALIDATION_FAILED` with per-field `errorParams`, because the browser pre-fill ignores a failed resolve; and the `GeoBoundaryResolver` `IllegalStateException`s, which happen at startup on bundled data and are not user-reachable. All four endpoints are public and run no `isActive` check; the selection check runs inside register and profile update, where a deactivated caller behaves as the U12 known gap describes (no check added here).

Still to come: each remaining Phase B ticket (LOC-6, NTF-5) adds its section here.
