# CHAT-21 · Trim the domain-events Redis stream

**Status:** `TODO` · **Type:** Enhancement (Architecture) · **Depends on:** none

**Filed:** 2026-10-19, found while writing the Redis key inventory (`documentation/md/REDIS_KEYS.md`, U24): nothing ever trims `sportconnect:domain-events`.

## What

The monolith appends every chat-sync event (`user.profile_updated`, `user.friend_request.created` / `.accepted`, `group.member_added` / `.member_removed` / `.deleted`) with a plain `XADD` from `UserServiceImpl`, `UserFriendServiceImpl` and `GroupServiceImpl`. There is no `MAXLEN` or `XTRIM` anywhere (Java or Go), and chat `XACK`s but never deletes, so the stream, and the Redis memory it takes, grows for the life of the instance. Every profile edit adds an entry.

Decide and build a cap that cannot drop an event chat has not applied: for example trim by `MINID` to the oldest entry still pending in the `chat-service` group (or to `sync_state.last_id` minus a safety margin), run by chat after `XACK` or by a scheduled job, rather than a blind approximate `MAXLEN` on the producers. Chat's cold-start bootstrap (`SYNC_DESIGN.md`) already recovers from a gap, so a trim past a long-dead consumer is survivable, but the margin must be stated. Update `REDIS_KEYS.md` and `SYNC_DESIGN.md` with the rule.

## Out of scope

Replacing the stream with another transport; changing the event contract.

## Tests

A Go integration test against a real Redis (the existing `consumer_integration_test.go` shape): events applied and acked are trimmed, an unacked or pending one is kept.
