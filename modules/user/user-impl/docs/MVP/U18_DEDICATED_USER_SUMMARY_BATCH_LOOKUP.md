# U18 · Dedicated `getUserSummariesByIds` — a PII-free batch method for display-name-only callers

**Status:** `DONE` (2026-09-27)
**Type:** Refactor (new `-api` method, no schema/endpoint change)
**Scope:** `user-api`/`user-impl` (new method) + every current `getUsersByIds` call site in
`notification-impl`, `session-impl`, `group-impl`, `post-impl`
**Depends on:** none
**Filed:** 2026-09-27, from the same U16/U17 discussion — the user asked "`getUsersByIds()` is used mostly for
fullName, should we have a dedicated method?"

## What

A census of every real call site of `UserService.getUsersByIds` (`notification-impl` ×1,
`session-impl` ×3, `group-impl` ×8, `post-impl` ×4 — 16 sites, not the ~11 first estimated)
found **none reading anything beyond `fullName` and `avatarUrl`**. `UserResponse` carries PII
(`email`) and, since U16, two geo fields (`countryId`/`regionId`) no display-name caller wants —
and U16 had to special-case `getUsersByIds` to *not* resolve those geo fields, precisely because
the method's real job (resolve a name for a post/comment/group/session row) has nothing to do with
what `UserResponse` grew into.

**Fix:** a new `UserSummaryResponse { id, fullName, avatarUrl }` and
`UserService.getUserSummariesByIds(List<UUID>) -> Map<UUID, UserSummaryResponse>` — same contract as
`getUsersByIds` (one query, no active-only filter, unknown/inactive ids simply absent, never throws).
Every one of the 16 call sites was migrated to it. `getUsersByIds` itself is unchanged and kept —
nothing currently needs the full shape in a batch, but the interface method stays as the general
contract (e.g. a future need for `city`/`bio` in a batch would still use it, or grow into its own
narrow DTO the same way).

**Who / entry point:** internal — this is cross-domain service plumbing, not a REST contract. No
endpoint path, request, or response DTO changes for any of the four migrated modules; `PostResponse
.userFullName`/`.userAvatarUrl`, `SessionParticipantResponse`, `GroupMemberResponse`,
`GroupInvitationResponse.inviterFullNames`, `NotificationActorSummary`, etc. are all byte-identical
on the wire — only which `UserService` method resolves them internally changed.

## Consumer census

| Site | Fields read | Disposition |
|---|---|---|
| `notification-impl/NotificationServiceImpl.getNotifications` (actors) | `fullName` | migrated |
| `session-impl/SessionServiceImpl` — participants batch, `resolveParticipantName`, `mapToResponses` (creator/canceller) | `fullName`, `avatarUrl` | migrated (3 call sites) |
| `group-impl/GroupServiceImpl` — group list creators, search creator names, single-group creator, member list, join-request resolution (×2), invitation resolution (×2), welcome-message names | `fullName`, `avatarUrl` | migrated (8 call sites, incl. the `buildInviterInviteeUserMap` helper and its 3 callers) |
| `post-impl/PostServiceImpl.getUsersForPosts` (post author, 6 call sites through the one helper) | `fullName`, `avatarUrl` | migrated |
| `post-impl/CommentServiceImpl` — single-comment create, page-of-comments batch | `fullName` | migrated (2 call sites) |
| `post-impl/CommentServiceImpl.resolveUserFullName` (`buildPreviewResponse`/`addToPreviewCache`) | `fullName` | **not migrated** — uses the single-item `getUserById`, a different method outside this census's scope; noted below |
| `UserFriendServiceImpl` (U17, same session) | — | already migrated to `UserInfoResponse` in U17, not `getUsersByIds` |

Every REST response shape and every other module's `-api` contract is unaffected — this is entirely
an internal call swapped for a narrower one with an identical map contract, so there is nothing here
for the client or any other backend consumer to update.

## Not touched — flagged, not fixed

`CommentServiceImpl.resolveUserFullName` calls `userService.getUserById(userId)` — the single-item
method, not `getUsersByIds` — from `buildPreviewResponse`/`addToPreviewCache`. It's a different
method entirely and was out of this ticket's census (scoped to `getUsersByIds` call sites only, per
the question that filed it). It resolves one id per call; whether it's ever called in a loop (a
potential N+1) wasn't checked here. Worth a look in a future ticket if it turns out to be hot.

## Tests

- **Spock**, one module at a time, migrated in place (no new test files — same coverage, narrower
  fixture type): `NotificationServiceImplSpec`, `SessionServiceImplSpec`, `GroupServiceImplSpec`,
  `PostServiceImplSpec`, `CommentServiceImplSpec`. Fixture construction changed from
  `UserResponse.builder().firstName(...).lastName(...)` to `UserSummaryResponse.builder()
  .fullName(...)` — `fullName` is what the real service now sets directly from
  `User.getFullName()`, so this is more accurate than the old firstName/lastName fixture, not just
  a mechanical rename.
- Two `CommentServiceImplSpec` tests needed a **second**, distinct `UserResponse` fixture
  alongside the new `UserSummaryResponse` one — they stub both `getUserSummariesByIds` (the
  migrated call) and `getUserById` (the untouched `buildPreviewResponse` call) on the same test,
  and those two methods now return different types.
- No new IT — no REST contract changed, so U11's/U17's "never leaks PII" ITs, and every other IT
  touching these four modules' endpoints, are the regression coverage (verified: full `:server:test`
  green after the migration).

## Verification

- Each of the five affected modules' Spock suites green individually, then together.
- Full `:server:test`: 361 tests, 0 failures (`SessionEventsConsumerIntegrationTest`'s 6 cases are a
  pre-existing RabbitMQ-container full-suite-parallelism flake — reproduced identically before this
  ticket's changes and confirmed green in isolation twice, both before and after).
- N+1 scan: every migrated call site was already batching (that's why it called `getUsersByIds` in
  the first place); the new method has the identical one-query shape, so no N+1 was introduced or
  removed.
- Real Postgres: `:server:bootRun` on port 8081 (8080 was free); smoke-tested a post/comment,
  a group member list, and a session list — `userFullName`/`userAvatarUrl`/`inviterFullNames` etc.
  all resolve correctly, response shapes unchanged.
