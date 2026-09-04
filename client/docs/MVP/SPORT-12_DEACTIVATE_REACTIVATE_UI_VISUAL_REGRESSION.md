# SPORT-12 · Visual regression harness for SPORT-10's deactivate / reactivate UI

**Status:** `TODO`
**Type:** Infrastructure (Testing)
**Depends on:** none — SPORT-10 (`DONE`) shipped every surface below.
**Filed:** 2026-09-04, closing a gap SPORT-10 flagged in its own summary: it added new UI surfaces
(the Settings-tab Active switch + its inactive/read-only state, `SportProfileStatusConfirmDialog`,
`ReactivateSportNudgeDialog`, and muted `SportSwitcher` pills) with **no `visual-regression`
coverage** — deliberately, matching this repo's established pattern of filing a visual-regression
harness as its own follow-up ticket (CLIENT-NOTIF-2 for the bell dropdown, CLIENT-SESSION-12 for
the session modals, GRP-10 for the Group page, FEED-11 for the post modal). **This ticket also owns
regenerating 3 baselines SPORT-10 legitimately changed** — `profile-settings-{375,768,1280}.png`
in `e2e/visual/app-profile.spec.ts`, which now show the new "Active" toggle row at the top of the
Settings tab. Every other existing baseline is byte-identical (everything else new is conditionally
rendered, absent from every default fixture).

## Why

SPORT-10's functional behaviour is covered by unit/component tests + e2e (`feed-groups-journey`,
`matches-journey`, `profile-journey`). What's missing is pixel-level coverage of the new chrome:

- the profile Settings tab's **Active / Inactive sliding switch** (`shared/ui/switch.tsx`) — both
  states — and the tab's **inactive read-only state** (the `<fieldset disabled>` dimming every
  field + Save);
- `SportProfileStatusConfirmDialog` — `deactivate` ("Stop playing {Sport} for a while?" + the
  keep-your-data note) and `reactivate` ("Welcome back to {Sport}!") modes;
- `ReactivateSportNudgeDialog` — `sport-pill` and `group` modes;
- the **muted `SportSwitcher` pill** — plain, and as the active filter (`aria-pressed`, active
  border + muted text at once).

## What ships

1. **Regenerate `profile-settings-{375,768,1280}.png`** (`e2e/visual/app-profile.spec.ts`) — SPORT-10
   added the "Active" toggle row to the top of the Settings tab, so the existing `profile —
   settings @ {width}px` baselines are stale. No spec change needed for the *active*-profile shot;
   the regeneration is the deliverable. (If the Settings-tab-*inactive* read-only state gets its
   own state below, that's a new screenshot, not a regeneration.)
2. **New `visual-regression` coverage** for the surfaces with none — dialog-scoped where it's a
   dialog, page/component-scoped otherwise, matching `app-post-modal.spec.ts` /
   `app-session-detail-modal.spec.ts`' shape: `page.getByRole('dialog')` for `SportProfileStatusConfirmDialog`
   (deactivate + reactivate) and `ReactivateSportNudgeDialog` (sport-pill + group); a `/profile`
   Settings-tab screenshot in the *inactive* read-only state; a `SportSwitcher`-scoped shot with a
   muted pill. Standard 3 breakpoints.

All Linux-rendered via the `client-ci` workflow's `update-baselines` dispatch (they cannot be
generated on a Windows host).

Exact spec-file split (one new `app-sport-reactivate.spec.ts`, or folding the profile states into
`app-profile.spec.ts` and adding a small dialog spec) and the exact state list are a Phase 3
design decision at pickup — the `SportProfileStatusConfirmDialog` / `ReactivateSportNudgeDialog`
Storybook stories already enumerate their states, and `seedSoftDeletedSportProfileOnNextLoad` is
the fixture recipe for every "there is a deactivated sport" state.

**Out of scope:** any new functionality or copy change — this is baseline coverage for
already-shipped SPORT-10 behaviour. Regenerating any baseline other than the 3 `profile-settings-*`
ones named above (nothing else changed for SPORT-10).

**Tests:** the spec files *are* the test — no separate unit/component coverage implied.
