# CLIENT-NOTIF-2 · Visual regression harness for the notification bell dropdown

**Status:** `TODO`
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
