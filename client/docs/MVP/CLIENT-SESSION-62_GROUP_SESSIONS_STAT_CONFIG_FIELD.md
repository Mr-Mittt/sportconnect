# CLIENT-SESSION-62 · The group's own `sessions` stat config in the group settings

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-83 (server), CLIENT-SESSION-61 (the `sessions` stat on the client)
**Filed:** 2026-11-26, the client half of SESSION-83 (a group's own config of the `sessions` stat for its member row and board), filed at the pickup of SESSION-82.

A field in the group settings screen, for the owner or admin: what makes a session count for a member of this group (`joined`, `atLeast1Game`, both with AND or OR) or "use the sport's setting" (the default). It reads and writes the group settings call SESSION-83 extends; the screen shows the effective value and says which it comes from. en and vi labels for every string and the new error codes of SESSION-83 (`errors:codes`), added in this ticket.

**Out of scope:** the sport's own config (admin-managed schema), the personal statistics.
