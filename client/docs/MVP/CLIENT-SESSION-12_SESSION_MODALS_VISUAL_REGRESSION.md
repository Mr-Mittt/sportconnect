# CLIENT-SESSION-12 · Visual regression harness for `SessionDetailModal` and `CreateSessionModal`

**Status:** `TODO`
**Type:** Infrastructure (Testing)
**Depends on:** none (both modals already `DONE` — `SessionDetailModal` via CLIENT-SESSION-9/10/11,
`CreateSessionModal` via CLIENT-SESSION-2/3/4/5)
**Filed:** 2026-08-18, closing a gap `CLIENT-SESSION-10` explicitly flagged: *"no session-modal
visual-regression spec exists to regenerate"* (noted while regenerating the 9
`app-post-modal.spec.ts` baselines for an unrelated height/send-icon change) — filed now rather than
left as a loose note in that ticket's file. User decision at filing: covers both session-related
dialogs, not `SessionDetailModal` alone.

Adds `visual-regression` Playwright coverage for both modals, matching `app-post-modal.spec.ts`
(FEED-11)'s harness shape: dialog-scoped screenshots (`page.getByRole('dialog')`, not full-page —
same reasoning FEED-11 used, the dimmed backdrop is already covered by whichever page's own
full-page spec), across the standard 3 breakpoints, Linux-rendered baselines via the `client-ci`
workflow's `update-baselines` dispatch.

Two dialogs, likely two spec files or two grouped describe blocks (decide at pickup which fits this
repo's existing spec-per-file convention better) — `SessionDetailModal` has materially more visual
states than `CreateSessionModal` (participant-status-driven button variants from CLIENT-SESSION-9,
the comments section from CLIENT-SESSION-8, the UX/UI pass from CLIENT-SESSION-10) vs.
`CreateSessionModal`'s form-field states (capacity/fee from CLIENT-SESSION-3, invite/approval from
CLIENT-SESSION-4, favorites dropdown from CLIENT-SESSION-5). Exact state/breakpoint set is a Phase 3
design decision at pickup, not predetermined here.

**Out of scope:** any new functionality in either modal — this is baseline coverage for already-shipped
behavior, not a design or behavior change.

**Tests:** the spec itself *is* the test — no separate unit/component test coverage implied by this
ticket.
