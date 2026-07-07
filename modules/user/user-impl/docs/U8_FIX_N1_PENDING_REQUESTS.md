# U8 · Fix N+1 in UserFriendServiceImpl pending-request mappers

**Status:** DONE
**Module:** `modules/user/user-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation:

Add a shared private helper `mapFriendRequests(List<FriendRequest>)` that batches all sender +
receiver ids into one `userRepository.findAllById()` call, builds a `Map<UUID, String>`
(id → fullName), then maps each request via `toFriendRequestResponse(request, namesById)` taking
that map instead of querying per request. Both `getPendingReceivedRequests` and
`getPendingSentRequests` delegate to this one helper.

No divergence — implementation matched the plan exactly.

## What was built

`toFriendRequestResponse` — shared by `getPendingReceivedRequests` and `getPendingSentRequests` —
did 2 `userRepository.findById()` calls per request (sender name + receiver name), giving `1 + 2N`
queries for N pending requests. Fixed:

- **New private helper `mapFriendRequests(List<FriendRequest>)`**: collects distinct sender +
  receiver ids across the whole list, one `userRepository.findAllById(...)` call (guarded for empty
  input → `Map.of()`), builds `Map<UUID, String>` via `Collectors.toMap(User::getId, User::getFullName)`,
  then maps each request through the now-pure `toFriendRequestResponse(request, namesById)`.
- **`toFriendRequestResponse` signature changed** to take the pre-resolved `Map<UUID, String>`
  instead of querying — `senderName`/`receiverName` resolved via `namesById.getOrDefault(id, "Unknown")`,
  identical fallback to the original per-item code.
- **Both public methods** (`getPendingReceivedRequests`, `getPendingSentRequests`) now just fetch
  their `List<FriendRequest>` and delegate to `mapFriendRequests` — no other changes to their logic.
- **`UserServiceImpl.searchUsers`** (U6) — not touched directly, but automatically benefits: it
  calls both of the above methods once per search request purely to extract id sets for
  friendship-status enrichment (already correctly batched-per-page per U6's own ticket text), so
  fixing the N+1 inside these two methods removes the wasted per-request name resolution there too.

## Key decisions

- **No overload for the (nonexistent) single-item call site.** Confirmed via `grep` before
  implementing: `toFriendRequestResponse` had exactly 2 call sites, both inside the two public list
  methods — no single-item consumer anywhere. So the signature change was a clean swap, no need for
  the inline-single-element-map convention used in group-impl/post-impl's tickets.
- **Batch method reused `userRepository.findAllById`** directly (no new repository method needed) —
  same-domain repository access within `user-impl`, already available for free from
  `JpaRepository`.

## Non-obvious constraints

- No change to what data is displayed — same fields, same values, same `"Unknown"` fallback for a
  missing user id.
- This is the only ticket in the cross-module N+1 audit (alongside group-impl's A7/A8 and
  post-impl's A6/A7) where the fix required zero new repository queries — `findAllById` was already
  available and unused for this purpose.

## Tests

Updated `UserFriendServiceImplSpec.groovy`:
- `"getPendingReceivedRequests should return incoming pending requests"` and
  `"getPendingSentRequests should return outgoing pending requests"`: mock shifted from
  `_ * userRepository.findById(_) >> Optional.of(user(...))` (loose, per-item) to
  `1 * userRepository.findAllById([senderId, receiverId]) >> [user(senderId), user(receiverId)]`
  (strict, one batched call).
- Added 1 new test: `"getPendingReceivedRequests should return an empty list without querying users
  when there are no pending requests"` — asserts `0 * userRepository.findAllById(_)` for the
  empty-input guard.

Run: `./gradlew :modules:user:user-impl:test` — all pass. `./gradlew
:modules:user:user-impl:compileJava` succeeds. `:server:bootRun` reaches the expected
local-Postgres connection failure (no local Postgres running in this sandbox) — same environmental
limitation as every other ticket in this audit. Unlike A6/A7 (group-impl, post-impl), this fix
introduced **no new custom query at all** — `findAllById` is a built-in `JpaRepository` method — so
there's no JPQL-correctness risk to flag here.
