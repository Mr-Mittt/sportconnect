# CLIENT-I18N-9 · Translate Notifications

**Status:** `DONE` (2026-09-30)
**Type:** Enhancement
**Depends on:** CLIENT-I18N-2, CLIENT-I18N-3, CLIENT-I18N-4 (Home Feed), CLIENT-I18N-5 (enums)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-6` at pickup (narrowed to Profile only — user decision).

## What

Translate the Notifications feature (`features/notifications/`), incl. `NotificationRow`. Same per-feature checklist as every prior i18n ticket: new namespace + `i18n.ts`
and `.storybook/preview.ts` registration + `src/app/i18n.test.ts` key-parity coverage + `useOverridableText`
`i18nOverridePrefix` on components + regenerated visual baselines (`update-baselines`, never from Windows)
+ `Intl` + active-locale for any hardcoded date/number/currency. Check `sharedComponents` before adding a
duplicate key. Read `documentation/md/I18N_READINESS.md` I18N-10 before starting: check each form for native
constraint validation and for a verbatim server message (add a row to I18N-4's census if so).
`getNotificationText` already done in I18N-5 — translate only the surrounding chrome/empty states; `relativeTime` already in `common`.

**Out of scope:** shared chrome (CLIENT-I18N-3), mirrored backend enums (CLIENT-I18N-5), backend message
localization (I18N-4), the language picker, Admin pages (no localization needed — user decision 2026-09-29).

## Scope check at pickup (2026-09-30)

User confirmed nothing to add or remove. Branched off the CLIENT-I18N-8 branch (user decision) since I18N-8's PR was not yet merged.

## Implementation summary (2026-09-30)

**Approved design (restated):** new `notifications` namespace (`locales/{en,vi}/notifications.json`: `bell.*` — label,
unreadBadge (`{{count}}`), heading, markAllRead, loading, loadError, caughtUp, loadMore — and `row.unread`) registered in
`app/i18n.ts`, `.storybook/preview.ts` and the `i18n.test.ts` parity table. `NotificationBell` and `NotificationRow` use
`useOverridableText('notifications', i18nOverridePrefix)`; the bell forwards the prefix to each row.

**Built:** exactly the above. English values are byte-identical to the literals they replaced.

**Divergences:** none. `getNotificationText` (enums, I18N-5) and `formatRelativeTime` (`common`) were not touched; the
`99+` badge cap is a literal, not copy. `TopBar` (the only caller) needed no change. No hooks in the feature hold UI strings.

**I18N-10 form checks:** no forms, no native validation. The only error is the client-authored "Couldn't load
notifications." — no verbatim server message, so **no new I18N-4 census row**.

**Tests:** new `features/notifications/NotificationsI18n.test.tsx` (5 tests: Vietnamese empty state, count interpolation +
actions + row marker, load error, override prefix forwarded to rows, row marker); `notifications` added to the parity
table; one new e2e (`locale.spec.ts`, bell in `vi`).

**Verification:** `tsc -b` clean; scoped Vitest (`features/notifications`, `TopBar`, `i18n.test.ts`) 9 files / 77 tests passed.
**E2E:** `e2e` project — `locale` + `notification-bell` 10 passed; the full `pnpm e2e` suite was not run (scoped subset only,
by standing instruction).
**Visual-regression expectation:** no baseline change expected — the bell dialog (`app-notification-bell`) is a baselined
surface but its English rendering is byte-identical; a failing `visual-regression` run on this Windows host is the noise
floor, not a regression. Not run.

**IT changes:** none — client-only ticket.
