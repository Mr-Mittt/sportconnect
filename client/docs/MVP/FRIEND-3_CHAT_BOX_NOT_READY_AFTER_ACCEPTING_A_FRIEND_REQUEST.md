# FRIEND-3 · The 1:1 chat box stays unavailable after accepting a friend request until the page is reloaded

**Status:** `TODO` · **Type:** Bug Fix · **Depends on:** none

**Filed:** 2026-10-30, found by the owner during the INFRA-7 live WebSocket checks on `https://yoursport.vn`. Not part of INFRA-7: the sockets work, this is the Friends page's chat panel state.

## What

On `/friends`, before a friend request is accepted the 1:1 chat box is unavailable (expected: chat only opens between friends). After the request is accepted the box is expected to become usable without a reload, but it stays unavailable until the page is reloaded.

Who: a normal user, on the Friends page chat panel, right after clicking Accept (the one who accepted; the sender's side is out of scope, see below).

## Lead for the cause (not confirmed, check first at pickup)

- `useAcceptFriendRequest` invalidates only `friendKeys.all` (`client/src/features/friends/hooks/useAcceptFriendRequest.ts`). It does not touch `chatKeys`.
- `useDirectChatData` opens the conversation with `POST /conversations/open/direct/{userId}`, which the chat service refuses (403, `ErrNotFriends`) until its own `friendships_cache` holds the friendship. That failed result stays in the query cache under `chatKeys.conversation.direct(userId)` and nothing retries it after the accept.
- The chat cache is filled by an asynchronous sync event (`services/chat/docs/SYNC_DESIGN.md`), so right after accept the service may still say 403 for a short time. Both can be true at once: the client never asks again, and the first ask may be too early.

## Scope

1. Reproduce it, and say which cause it is (client cache, sync lag, or both) with evidence, for example the network tab: the open-direct call's status before and after accept, and how long the 403 lasts.
2. Fix it so that after Accept the chat box opens without a reload. If sync lag is real, a short bounded retry or backoff of the open call after an accept is acceptable; no endless polling.
3. A test that fails without the fix (mutation check): accept, then the chat panel leaves the unavailable state with no reload.

**Out of scope:** the other user's screen (the sender seeing the accept live: needs a notification or sync design, file separately if wanted); changes in `services/chat` unless step 1 shows the service is the cause; unfriend (the reverse case) unless it shares the same cause, then say so in the summary.

**Tests / docs:** Vitest for the hook or panel, and an e2e step in `friends-journey.spec.ts` if it can be done without a real chat service (MSW), with `client/docs/E2E_OVERVIEW.md` updated if the spec changes.

**i18n / enums / account lifecycle:** none (no new text, no new enum, no new endpoint).
