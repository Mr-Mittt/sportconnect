# GRP-12 · Group recurrence form: game mood for the sessions the group generates

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** B22 (group backlog), CLIENT-SESSION-34 ·
**Filed:** 2026-11-11, deferred from CLIENT-SESSION-34 (generated recurring sessions get mood 5 for now).

Add the optional game mood (the same slider, default 5) to the group recurrence settings form once B22 lets the recurrence config carry it. En/vi copy, MSW handler for the changed request/response, group settings tests.

**Out of scope:** the session form (CLIENT-SESSION-34), per-session overrides.

**Tests:** Vitest for the field and its payload; the existing group settings e2e still green.
