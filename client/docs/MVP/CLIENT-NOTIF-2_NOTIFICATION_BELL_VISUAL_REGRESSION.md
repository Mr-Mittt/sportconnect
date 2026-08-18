# CLIENT-NOTIF-2 · Visual regression harness for the notification bell dropdown

**Status:** `DONE`
**Type:** Infrastructure (Testing)
**Depends on:** none (`CLIENT-NOTIF-1` `DONE` — the component this covers already exists)
**Filed:** 2026-08-18. Unlike `GRP-10`/`CLIENT-SESSION-12`, `CLIENT-NOTIF-1` never explicitly
flagged this as a follow-up — it shipped with unit/Storybook/E2E coverage (`NotificationRow`'s 5
stories, `NotificationBell`'s 6: closed/loading/error/empty/populated/with-load-more) but no
visual-regression baseline of any kind, silently outside its own scope note. Filed now alongside the
other two known-flagged gaps for the same reason: closing missing visual-regression coverage across
the app's least-covered surfaces.

Adds `visual-regression` Playwright coverage for the `NotificationBell` popover. Unlike the Group
page (full-page) or the session modals (a true dialog), this is a `Popover`-backed dropdown anchored
to a `TopBar` element — scope/anchoring approach (popover-only crop vs. a `TopBar`-plus-popover
region) is a Phase 3 decision at pickup, informed by whichever existing pattern (HF-10a/b's
full-page vs. FEED-11's dialog-only) actually fits a `Popover`, not a `Dialog`. `NotificationBell`'s
6 existing Storybook stories are a natural starting menu of states to consider baselining (at least
the populated/empty/with-load-more visual states are user-facing enough to matter; loading/error may
or may not be worth a frozen baseline vs. Storybook already covering them).

**Out of scope:** any new bell/dropdown functionality — this is baseline coverage for what
`CLIENT-NOTIF-1` already shipped, not a design or behavior change. The per-type notification
preferences/mute UI and push notifications remain out of scope per `CLIENT-NOTIF-1`'s own note —
nothing here changes that.

**Tests:** the spec itself *is* the test — no separate unit/component test coverage implied by this
ticket.

---

## Implementation

**Crop approach resolved at pickup:** Radix's `Popover.Content` (the primitive behind
`NotificationBell`'s dropdown) renders `role="dialog"` in its own DOM output — confirmed directly
against `@radix-ui/react-popover`'s source, not assumed. So the FEED-11/CLIENT-SESSION-12 pattern
(`page.getByRole('dialog')`, dialog-scoped screenshot, not full-page or a `TopBar`-plus-popover
region) carries over unchanged; the "Popover, not Dialog" distinction the ticket flagged as an open
question turned out not to require a different harness shape.

**States (user decision at pickup — 3 of `NotificationBell`'s 6 Storybook states, not all 6):**
`empty`, `populated`, `with-load-more`. `loading`/`error` stayed out: both are transient states
already covered by Storybook, and no other visual-regression spec in this suite baselines a
loading/error state either. 3 states × 3 breakpoints = **9 baselines**,
`client/e2e/visual/app-notification-bell.spec.ts`.

**Mock-server plumbing added** (all mirroring exact existing patterns — no new mechanism invented):
- `overrides.ts`: new `notificationsEmpty` flag (same shape as `feedEmpty`).
- `handlers/notifications.ts`: `GET /api/notifications` and `GET /api/notifications/unread-count`
  both gate on that flag; new exported `seedNotificationsState(sessionId, notifications)` (mutates
  the stored array in place — the same live-reference-mutation style the file's PUT /read handler
  already relied on, since `notificationSessions` stores `Notification[]` directly rather than a
  wrapper object like `feedSessions` does).
- New `e2e/mocks/paginatedNotificationsFixture.ts`: `buildPaginatedNotifications()` — 11 items (one
  more than the list's page size of 10), all pointing at `mockSession`, same "volume, not variety"
  reasoning as `paginatedFeedFixture.ts`.
- `mockServer.ts`: `notificationsEmpty` added to `OVERRIDE_NAMES`; new `seed-paginated-notifications`
  admin route.
- `fixtures.ts`: `seedEmptyNotificationsOnNextLoad(sessionId)` and
  `seedPaginatedNotificationsOnNextLoad(sessionId)` test-side helpers, same shape as
  `seedEmptyFeedOnNextLoad`/`seedPaginatedFeedOnNextLoad`.

**One real finding during Phase 5 verification:** the first `with-load-more` baseline (generated
before checking it visually) didn't actually show the "Load more" button — the row list is its own
internal scroll container (`max-h-96 overflow-y-auto`), so with 11 seeded rows the button sits below
the fold and `toBeVisible()` passed without the button ever entering the screenshot. Fixed by calling
`loadMoreButton.scrollIntoViewIfNeeded()` before the screenshot; regenerated and visually confirmed
the button now appears. A reminder that `toBeVisible()` isn't sufficient proof a scrollable
container's content is actually captured — this class of bug wouldn't occur in the full-page or
non-scrolling dialog specs this pattern was borrowed from, since none of them have an internal
scroll region between the crop boundary and the content being asserted.

Clock frozen at the suite's standard `2026-07-07T19:00:00`. All three fixtures' notification
timestamps are in 2026-08, after that instant — `formatRelativeTime`'s negative-diff handling
renders "just now" deterministically on every row, same accepted behavior `app-post-modal.spec.ts`
already documented for its own comment timestamps (not a bug specific to this ticket).

**Verification:** `pnpm exec tsc -b` clean, `pnpm exec eslint .` clean (0 errors, 2 pre-existing
unrelated warnings), `pnpm exec vitest run` 878/878 passed (no unit-tested code added — confirms
nothing else broke), new spec's own 9/9 passed against freshly generated local baselines (visually
reviewed all three states — empty/populated/with-load-more all render correctly), full
`pnpm exec playwright test --project=e2e` run 51/51 passed (includes `notification-bell.spec.ts`'s
own functional journey against the modified handlers — the strongest signal that the new
`notificationsEmpty` override and `seedNotificationsState` didn't regress the existing bell journey
or any other MSW-1 consumer). Full `visual-regression` project run showed the suite's already-
documented Windows-vs-Linux font-rendering noise on pre-existing specs untouched by this ticket
(`E2E_OVERVIEW.md` §6) — expected, not a regression.

**Baselines — Windows-rendered locally, need the `client-ci` `update-baselines` dispatch swap**
before CI's Linux runs of this spec pass clean — same bootstrap step every prior visual-regression
ticket (GRP-10, HF-10b, SPORT-4, CLIENT-SESSION-12) needed, for the same reason: triggering a GitHub
Actions `workflow_dispatch` isn't possible from this environment.

`client/docs/E2E_OVERVIEW.md` updated: §3 directory listing (`app-notification-bell.spec.ts`) + a
new §6 catalog entry.
