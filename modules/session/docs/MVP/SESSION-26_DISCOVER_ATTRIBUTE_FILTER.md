# SESSION-26 · Session-attribute filtering on discover

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** SESSION-25
**Filed:** 2026-09-14, deferred out of SESSION-25 at the user's explicit request during scoping —
session attributes are a dynamic JSONB map keyed by each sport's own schema (SESSION-23/A17), with
per-type semantics (`LIST` containment, `DEFINITION_LIST` nested match, etc.) that need their own
design pass rather than folding into SESSION-25's simpler column filters.

## Scope

Extend `GET /api/sessions/discover` with attribute-path/value filter params (e.g.
`attributes[skillLevel]=intermediate`). Starting point agreed during SESSION-25's scoping:
**exact-match per key** against the stored JSONB value, matching SESSION-23's existing
replace-semantics model — no new range/partial-match logic by default. The exact param shape,
per-type matching semantics (`LIST` containment vs. exact, `DEFINITION_LIST` nested field match,
`NUMBER` range vs. exact), and how multiple attribute filters combine (AND vs. OR) are this
ticket's own design decisions, not predetermined here — confirm against the real schema shapes
at pickup before committing to one.

**Out of scope:** anything already covered by SESSION-25 (title/location/open-slots/fee/date-time/
status).

**Tests:** TBD at pickup, once the exact filter semantics are designed.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
