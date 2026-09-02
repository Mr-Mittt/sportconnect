# ADMIN-5 · Session attribute schema editor

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** A17
**Filed:** 2026-09-02 — the admin authoring surface for A17's session schema.

## What ships

In the sport admin master-detail page (ADMIN-2), a second JSON `<textarea>` bound to the raw
`session_attributes_schema` document — same pattern ADMIN-2 already uses for `attributes_schema`:
load raw via `GET /api/sports/all/{sportId}/session-attribute-schema`, save via the `PUT`, surface
the server's 400 text inline (dangling `#ref`, key collision, etc.) exactly as the attribute-schema
textarea does. Reuse ADMIN-2's unsaved-changes guard.

## Out of scope

A structured (non-textarea) editor — same call ADMIN-2 made; the richer editor is V1's ADMIN-3.

## Tests

Vitest: textarea round-trips; a rejected save shows the server error; guard blocks navigation with
unsaved edits.
