# CLIENT-SESSION-35 · Discover filters for per-gender slots and game mood

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-47 (session backlog), CLIENT-SESSION-34 ·
**Filed:** 2026-11-11, deferred from CLIENT-SESSION-34 (the owner chose display only for the first release).

Add the controls to the Discover modal's filters for the new server params: a minimum of slots for men or for women, and a game-mood range (two-thumb slider, 1 to 10, same green-to-red track). En/vi copy, MSW handlers, and the modal's existing filter conventions (AND-combined, clear buttons, popovers use the dialog as their collision boundary, see CLIENT-SESSION-32). Open for pickup: how a session with unspecified slots is treated, following SESSION-47's decision.

**Out of scope:** the fields and their display (CLIENT-SESSION-34).

**Tests:** Vitest for each control and the query params it sends; a scoped Discover e2e.
