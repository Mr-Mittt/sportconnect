# CLIENT-GROUP-SESSION-6 · "Cancel the scheduled sessions?" confirmations

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-6, CLIENT-GROUP-SESSION-4
**Filed:** 2026-11-19, from the owner's group-session specification (the cancel confirmation on OFF, delete and mode switch).

Before turning generation OFF, deleting a configuration or switching the recurrence mode, ask the server for the count of affected regular sessions (SESSION-GROUP-6). When it is above zero show "{x} sessions are available. Do you want to cancel them?" with **Leave it there** / **Cancel**; the choice is sent as `cancelScheduled` on the mutating call. When the count is zero, no dialog. The mode-switch dialog of CLIENT-GROUP-SESSION-4 comes first, then this one. All strings en and vi (plural forms), tests, stories, MSW handlers, Playwright flow, error rows for any new code.

**Consumer census:** the three mutation hooks of CLIENT-GROUP-SESSION-4, `feedKeys`/`sessionKeys` invalidation (cancelled sessions leave the Scheduled bucket), e2e mocks.

**Server contract (SESSION-GROUP-6, built 2026-11-19).** `GET /api/sessions/group/{groupId}/regular-sessions/count?scope=ALL|RECURRENCE&recurrenceId=` returns `{ count }` (owner/admin; `ALL` for turning generation off and for a mode switch, `RECURRENCE` with the configuration's id for a delete; only `SCHEDULED` and `PREPARING` sessions are counted, never `ONGOING`); ask it before the change and show the dialog only when `count > 0`. Send the answer as `cancelScheduled: true` in the body of `PUT /api/sessions/group/{groupId}/settings` (only a call that turns generation off or switches the mode uses it) or as `?cancelScheduled=true` on `DELETE .../recurrences/{id}`; "Leave it there" sends `false` or nothing. The answers tell how many were cancelled (`data.cancelledSessions` on the settings, `data.count` on the delete); invalidate the group's session buckets (CLIENT-GROUP-SESSION-2) after a cancel. When the mode switch confirm of CLIENT-GROUP-SESSION-4 and this one both apply, ask the mode confirm first. The cancel notification is `session.group.cancelled` (CLIENT-GROUP-SESSION-3 owns its text). A plain member gets 403 `SESSION_GROUP_ADMIN_REQUIRED` on all three.

---

**The whole server contract of this topic is `modules/session/docs/GROUP_SESSION_DESIGN.md`** (endpoints in § 4, how generation behaves in § 6, system post codes in § 8, error codes in § 9, the client ticket map in § 13); it is the source if this ticket and the document disagree.
