# CLIENT-GROUP-SESSION-6 · "Cancel the scheduled sessions?" confirmations

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-6, CLIENT-GROUP-SESSION-4
**Filed:** 2026-11-19, from the owner's group-session specification (the cancel confirmation on OFF, delete and mode switch).

Before turning generation OFF, deleting a configuration or switching the recurrence mode, ask the server for the count of affected regular sessions (SESSION-GROUP-6). When it is above zero show "{x} sessions are available. Do you want to cancel them?" with **Leave it there** / **Cancel**; the choice is sent as `cancelScheduled` on the mutating call. When the count is zero, no dialog. The mode-switch dialog of CLIENT-GROUP-SESSION-4 comes first, then this one. All strings en and vi (plural forms), tests, stories, MSW handlers, Playwright flow, error rows for any new code.

**Consumer census:** the three mutation hooks of CLIENT-GROUP-SESSION-4, `feedKeys`/`sessionKeys` invalidation (cancelled sessions leave the Scheduled bucket), e2e mocks.

---
