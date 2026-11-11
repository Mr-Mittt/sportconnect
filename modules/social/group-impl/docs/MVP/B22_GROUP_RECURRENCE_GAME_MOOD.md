# B22 · Group recurrence config carries a game mood for the sessions it generates

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-46 (session backlog) ·
**Filed:** 2026-11-11, deferred from SESSION-46 (owner: generated recurring sessions get `gameMood` 5 for now; the group-level setting is its own topic).

A group's recurrence config (GROUP-RECUR-1, `updateGroupRecurrence`) decides the sessions `SessionGenerationService` creates, but carries no game mood, so every generated session is 5. Add an optional mood (1 to 10, default 5) to the recurrence config and have the generator use it. Open for pickup: whether the group's per-gender slots and fee note should follow the same way (the owner raised only the mood), and the client's group recurrence form (a client ticket, filed with this one).

**Out of scope:** the session field itself (SESSION-46), per-session overrides after generation.

**Tests:** Spock for the config validation and the generator using the group's value; an IT through the real schema.
