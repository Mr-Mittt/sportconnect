# CLIENT-ADMIN-IMPORT-1 · Admin page to import finished sessions

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-70 (the preview and apply calls); the file comes from SESSION-71
**Filed:** 2026-11-22, owner request: the import file is uploaded on an admin page so the group (production has a different one from local dev) and the host are chosen there, not baked into the file.

An admin-only page (route and nav entry next to the existing admin screens, e.g. the record-schema admin of SPORT-18; hidden from non-admins and guarded server-side by SESSION-70) with: a file picker for the JSON of SESSION-71; pickers for **group** (any of the admin's groups, or standalone), **location** (default 7 when it exists), **host** (default: the group's owner) and sport; **Preview**, which calls `POST /api/sessions/import/preview` and shows a table, one row per session (date, title, number of games, players) that expands to its games. Every **unresolved name** shows a dropdown of the candidate members (or a member search when none matched) and the choice is remembered as an alias for the next call. **Apply** stays disabled until every name is resolved; it sends the batch to `POST /api/sessions/import` and shows created and skipped counts (a skipped session is one that already existed). A failed call keeps the file and the choices.

**Checks.** en and vi for every string (plurals for the counts) and for the new SESSION-70 error codes, `I18N-4` census row for the page, `Accept-Language`-independent coded errors; no server prose on screen. Keyboard and `aria` baseline; the 32px controls. MSW handlers for both calls and an e2e flow (upload, resolve a name, apply, re-apply skipped). No baselined surface changes: no `BASELINE-UPDATE-1` row unless a visual spec covers the page.

**Out of scope:** reading a spreadsheet in the browser, editing a session before applying, scores, guests, undoing an import.

**Tests:** component tests for the preview table and the alias flow, hook tests for both calls, Storybook states (empty, unresolved names, applying, done, failed), the Playwright flow; mutation check per requirement.
