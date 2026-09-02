# CLIENT-SESSION-16 · Read-only session attributes in SessionDetailModal

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** CLIENT-SESSION-14
**Filed:** 2026-09-02.

## What ships

A read-only presentation of a session's stored `attributes`, resolved against
`useSessionAttributeSchema`, shown in `SessionDetailModal`. Not a stack of disabled inputs — a
term/value list: plain value for STRING/ENUM, chips for LIST, an indented block for
DEFINITION/DEFINITION_LIST. New small `SessionAttributesSummary` component (or a `readOnly` mode on
`SportAttributesFields` — decide at pickup; a separate component is likely cleaner and reusable for
a future profile-view).

Hidden entirely when the session has no attributes or the sport has no session schema.

## Out of scope

Editing from the detail modal.

## Tests

Vitest + story: each field type renders read-only; empty/no-schema -> nothing rendered.
