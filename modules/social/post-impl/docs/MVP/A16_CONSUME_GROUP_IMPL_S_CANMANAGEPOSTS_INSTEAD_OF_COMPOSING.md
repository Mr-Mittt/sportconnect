# A16 · Consume `group-impl`'s `canManagePosts` instead of composing `isGroupOwner`/`isGroupAdmin`

**Status:** `DONE` (2026-08-12) · **Summary:** see
`modules/social/group-impl/docs/MVP/B20_CAN_MANAGE_SELF_CONTAINED_QUERY.md` (this module is the
consumer side of that ticket, not where the design decision was made)
**Type:** Refactor (Efficiency) · **Filed:** 2026-08-12, spotted by the user directly: this module
had four call sites composing `groupService.isGroupOwner(...) || groupService.isGroupAdmin(...)`
(`createPost`'s `GROUP_BROADCAST` guard, `updatePost`'s broadcast-moderator check, `deletePost`'s
group-moderator check, `updateBroadcastEndTime`'s moderator check) — exactly the pattern B20 had
just replaced inside `group-impl` itself with a single `canManagePosts(groupId, userId)` call.

**What changed:** `PostServiceImpl.java` — all four call sites now call
`groupService.canManagePosts(groupId, userId)` (already on the `GroupService` `-api` interface, no
new cross-domain method needed) instead of composing the two. Behavior is identical (owner or
admin still qualifies) — this is a pure call-count reduction, same reasoning as B20: one RPC into
`group-impl` instead of up to two. `PostServiceImplSpec.groovy` updated accordingly (each pair of
`isGroupOwner`/`isGroupAdmin` stubs collapsed into one `canManagePosts` stub returning the same
combined boolean).

**Verification:** `./gradlew :modules:social:post-impl:test` and `./gradlew :server:test` both
green.

**Out of scope:** `isGroupMember` (used by `createPost`'s `GROUP_POST` gate, unrelated — no
owner/admin composition there, nothing to change).
