# Chat Module — Feature Backlog (ARCHIVED)

**ARCHIVED 2026-07-26 (user decision):** superseded by a fresh chat re-plan — do not pick up CHAT-1
or CHAT-3 from here. Neither had any code written (`modules/social/chat-impl` never existed beyond
this docs folder, since deleted). Kept for historical context only.

**Version:** V1
**Module:** `modules/social/chat-impl` (new — does not exist yet; CHAT-1 scaffolds it)
**Last updated:** 2026-07-26
**Prerequisite:** none of this module's tickets have an MVP-scope blocker — moved to V1 in full
(2026-07-26, user decision) to deprioritize group chat out of the MVP release.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon chat v1` to resume (once the module exists — see CHAT-1)

**Origin:** `documentation/md/CHAT_SERVICE_INTEGRATION.md` — the decision to integrate PubNub for
group chat, and the full architecture (token minting, channel model, persistence strategy) these
tickets implement. Read that doc first; it is the spec, this file is the queue.

Backend tickets only. The matching client tickets (CHAT-2, CHAT-4) live on
`client/docs/BACKLOG_V1.md` — sequencing across both files:

```
CHAT-1 (backend: module scaffold + token endpoint)
  → CHAT-2 (client: real-time wiring, backed by PubNub's own 7-day history)
  → CHAT-3 (backend: our own Postgres persistence)
  → CHAT-4 (client: swap to persisted history, hardening)
```

CHAT-3 is sequenced after CHAT-2 deliberately — real-time delivery should be proven end-to-end
against the vendor's own short-term history before persistence is added on top, same "smallest
shippable slice first" reasoning this project already uses elsewhere (e.g. `client/docs/BACKLOG_MVP.md`'s
FEED-0 → FEED-1..7 sequencing).

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | CHAT-1 | Chat module scaffolding + PubNub token-issuing endpoint | `TODO` |
| 2 | CHAT-3 | Chat message persistence | `TODO` |

---

## Tickets

### CHAT-1 · Chat module scaffolding + PubNub token-issuing endpoint
**Status:** `TODO` · **Type:** Feature (Foundation) · **Dependency:** none
**Spec:** `documentation/md/CHAT_SERVICE_INTEGRATION.md` § Architecture → Token minting and
membership gating

**What ships:**
- Scaffold `modules/social/chat-api` and `modules/social/chat-impl` — mirror
  `modules/social/group-api`/`group-impl`'s `build.gradle` shape exactly:
  - `chat-api`: `id 'java'` plugin, depends on `modules:common`, Spring Web + Validation +
    Data-JPA starters (for the `ApiResponse`/DTO shapes), Lombok.
  - `chat-impl`: `id 'groovy'` plugin, depends on `modules:social:chat-api`, `modules:common`,
    and — cross-domain, **interfaces only** — `modules:social:group-api` and
    `modules:user:user-api`. Spring Web/Data-JPA/Validation/Security starters, Swagger annotations
    (`compileOnly`), Lombok, Spock (`spock-bom`/`spock-core`/`spock-spring`) + Mockito, matching
    `group-impl`'s test dependency block verbatim.
  - Add `com.pubnub:pubnub-gson` to `chat-impl`'s dependencies — **verify the current stable
    version on Maven Central at pickup** (this ticket was scoped against `6.4.5`; don't assume
    that's still current).
  - Register both new modules in root `settings.gradle` (after the existing
    `include 'modules:social:group-impl'` line) and add
    `implementation project(':modules:social:chat-impl')` to `server/build.gradle`'s dependency
    block (alongside the other `-impl` module lines).
- `pubnub.publish-key`/`pubnub.subscribe-key`/`pubnub.secret-key` config in
  `server/src/main/resources/application.yml`, `${PUBNUB_PUBLISH_KEY}` etc. — same
  `${ENV_VAR:default}` pattern as `jwt.secret` (`application.yml:87`). No committed default for the
  secret key (unlike JWT's dev-only fallback) — a missing PubNub key should fail loudly, not
  silently mint invalid tokens.
- `chat-api`: `ChatService` interface with one method,
  `ChatTokenResponse mintChatToken(Long groupId, UUID userId)`; `ChatTokenResponse` DTO (`token`,
  `publishKey`, `subscribeKey`, `channel`, `expiresInSeconds`).
- `chat-impl`: `ChatServiceImpl` — calls `GroupService.isGroupMember(groupId, userId)`
  (`modules/social/group-api/src/main/java/com/sportconnect/group/api/service/GroupService.java:97`,
  injected as the `-api` interface, never `group-impl` directly) and throws `BadRequestException`
  (400) if false, matching every other membership-gated method in `GroupServiceImpl`. On success,
  calls PubNub's Java SDK `grantToken()` scoped to channel `group-{groupId}-chat`, TTL ~1 hour
  (3600s) — see the decision doc for why short-lived, not the vendor's multi-day ceiling.
- `ChatController`: `GET /api/groups/{groupId}/chat-token`, `@AuthenticationPrincipal String
  userIdStr`, wraps the response in `ApiResponse<ChatTokenResponse>`. No `SecurityConfig` change
  needed — `/api/groups/**` already requires authentication by default (confirmed: not in
  `SecurityConfig`'s `permitAll` list).
- No DB migration in this ticket — no entity exists yet, nothing to persist (that's CHAT-3).

**Acceptance criteria:**
- Non-member of the group gets a 400 from `GET /api/groups/{groupId}/chat-token`.
- Member gets a valid `ChatTokenResponse` — verify the returned token actually authorizes
  publish+subscribe on `group-{groupId}-chat` (not some other channel) via a live PubNub sandbox
  call, not just a mocked-client unit assertion.
- Spock tests: `ChatServiceImplSpec` (membership gate, token-shape success case, mocked PubNub
  client), `ChatControllerSpec`.
- `./gradlew :modules:social:chat-impl:test` and `./gradlew :server:test` both green (new module
  wired into the server assembly correctly — same Phase 5 bar every other backend ticket in this
  project already holds itself to).

---

### CHAT-3 · Chat message persistence
**Status:** `TODO` · **Type:** Feature · **Dependency:** CHAT-1 (module scaffold), CHAT-2
(client, `client/docs/BACKLOG_V1.md` — real-time path proven before persistence is added)
**Spec:** `documentation/md/CHAT_SERVICE_INTEGRATION.md` § Architecture → Persistence

**What ships:**
- New migration `server/src/main/resources/db/changelog/changes/V028__create_chat_messages_table.sql`
  (next number after `V027__add_group_system_post_type.sql`), registered in
  `db.changelog-master.xml`. `chat_message` table: `id BIGSERIAL`, `group_id BIGINT` (no foreign
  key — cross-domain references are IDs only, per `CLAUDE.md`), `sender_id UUID`,
  `sender_full_name VARCHAR` (resolved server-side, see below), `content VARCHAR(1000)` (reuses the
  client's existing `MAX_COMMENT_LENGTH` precedent for chat message length), `created_at TIMESTAMP`.
  Index on `(group_id, created_at)` for the paginated history query.
- `ChatMessage` entity + `ChatMessageRepository` (`chat-impl`) —
  `findByGroupIdOrderByCreatedAtDesc(Long groupId, Pageable pageable)`.
- `chat-api`: add `void saveMessage(Long groupId, UUID senderId, String content)` and
  `Page<ChatMessageResponse> getMessageHistory(Long groupId, UUID callerId, Pageable pageable)` to
  `ChatService`; new `ChatMessageResponse` DTO (`id`, `groupId`, `senderId`, `senderFullName`,
  `content`, `createdAt`).
- `ChatServiceImpl.saveMessage`: same `isGroupMember` gate as CHAT-1's token mint. Resolves
  `senderFullName` via **`UserService.getUsersByIds(List<UUID>)`**
  (`modules/user/user-api/src/main/java/com/sportconnect/user/api/service/UserService.java:28`,
  already exists) — **never trust a client-supplied display name.** For `getMessageHistory`, batch
  all distinct `senderId`s in the fetched page into **one** `getUsersByIds` call and map results
  back — per `CLAUDE.md`'s explicit N+1 rule, this is not optional polish, it's the same standard
  every other paginated mapper in this codebase (`GroupServiceImpl`, `PostServiceImpl`) already
  meets.
- `ChatController`: `POST /api/groups/{groupId}/chat/messages` (persist; membership-gated, same
  400 convention), `GET /api/groups/{groupId}/chat/messages` (paginated history,
  `Page<ChatMessageResponse>` wrapped in `ApiResponse`, matching every other paginated
  `GroupController` endpoint's shape exactly — `Pageable` param, `ApiResponse.success(page)`).

**Acceptance criteria:**
- `senderFullName` never comes from the request body — confirm by sending a `POST` with a spoofed
  name field (if the DTO even accepts one — it shouldn't) and verifying the persisted row uses the
  real resolved name.
- History endpoint's N+1 guard: a Spock test asserting `UserService.getUsersByIds` is called
  **exactly once** per page fetch, regardless of how many distinct senders are in it (mirrors this
  project's own existing N+1 regression-test pattern for `GroupServiceImpl`).
- Non-member gets 400 on both endpoints.
- `./gradlew :modules:social:chat-impl:test` and `./gradlew :server:test` green — the new
  `chat_message` table needs a row in the test profile's H2 schema (`server`'s test resources),
  same "don't skip this even if module tests pass" bar the `/workon` skill already holds every
  backend ticket to.
