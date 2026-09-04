# SPORT-12 · Visual regression harness for SPORT-10's deactivate / reactivate UI

**Status:** `DONE` (2026-09-04)
**Type:** Infrastructure (Testing)
**Depends on:** none — SPORT-10 (`DONE`) shipped every surface below.
**Filed:** 2026-09-04, closing a gap SPORT-10 flagged in its own summary: it added new UI surfaces
(the Settings-tab Active switch + its inactive/read-only state, `SportProfileStatusConfirmDialog`,
`ReactivateSportNudgeDialog`, and muted `SportSwitcher` pills) with **no `visual-regression`
coverage** — deliberately, matching this repo's established pattern of filing a visual-regression
harness as its own follow-up ticket (CLIENT-NOTIF-2 for the bell dropdown, CLIENT-SESSION-12 for
the session modals, GRP-10 for the Group page, FEED-11 for the post modal). The 3
`profile-settings-{375,768,1280}.png` baselines SPORT-10 legitimately changed (the Settings tab
gained the "Active" toggle row) were **already regenerated** on SPORT-10's own branch via
`/updatebaseline` (commit `1fb1cf1`) — they are not this ticket's concern. Every other existing
baseline is byte-identical; this ticket is purely *new* coverage for surfaces no spec captures.

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

**New `visual-regression` coverage** for the surfaces no existing spec captures — dialog-scoped
where it's a dialog, page/component-scoped otherwise, matching `app-post-modal.spec.ts` /
`app-session-detail-modal.spec.ts`' shape: `page.getByRole('dialog')` for
`SportProfileStatusConfirmDialog` (deactivate + reactivate) and `ReactivateSportNudgeDialog`
(sport-pill + group); a `/profile` Settings-tab screenshot in the *inactive* read-only state (the
`<fieldset disabled>` dimming, distinct from the now-current *active* `profile-settings-*` shot); a
`SportSwitcher`-scoped shot with a muted pill (plain + as the active filter). Standard 3
breakpoints. All Linux-rendered via the `client-ci` workflow's `update-baselines` dispatch (they
cannot be generated on a Windows host).

Exact spec-file split (one new `app-sport-reactivate.spec.ts`, or folding the profile states into
`app-profile.spec.ts` and adding a small dialog spec) and the exact state list are a Phase 3
design decision at pickup — the `SportProfileStatusConfirmDialog` / `ReactivateSportNudgeDialog`
Storybook stories already enumerate their states, and `seedSoftDeletedSportProfileOnNextLoad` is
the fixture recipe for every "there is a deactivated sport" state.

**Out of scope:** any new functionality or copy change — this is baseline coverage for
already-shipped SPORT-10 behaviour. Regenerating any baseline other than the 3 `profile-settings-*`
ones named above (nothing else changed for SPORT-10).

**Tests:** the spec files *are* the test — no separate unit/component coverage implied.

---

## Implementation summary (2026-09-04)

### Approved design (Phase 3)

One new file, `e2e/visual/app-sport-reactivate.spec.ts` (the ticket's own first option), rather
than folding into `app-profile.spec.ts` — the 7 states span 3 pages (Profile / Home Feed / Groups),
matching the "own file for a cross-page surface" precedent `app-session-detail-modal.spec.ts` /
`app-notification-bell.spec.ts` already set. 7 states × 3 breakpoints = 21 new baselines. Every
trigger flow reuses the exact selectors the already-passing SPORT-10 e2e functional specs
(`feed-groups-journey.spec.ts`, `matches-journey.spec.ts`, `profile-journey.spec.ts`) proved —
these visual tests add a screenshot at each proven checkpoint instead of inventing new setup.

### What was built

`e2e/visual/app-sport-reactivate.spec.ts` — 7 parameterized states:

1. **`profile settings — inactive (read-only)`** — full page, `/profile`, Pickleball soft-deleted
   → click its muted pill → the `<fieldset disabled>` Settings tab.
2. **`sport status confirm dialog — deactivate`** — dialog, `/profile` Settings, active Badminton's
   toggle click.
3. **`sport status confirm dialog — reactivate`** — dialog, state 1's setup → the Inactive toggle
   click.
4. **`reactivate nudge dialog — sport-pill`** — dialog, Home Feed, muted-pill click.
5. **`reactivate nudge dialog — group`** — dialog, Groups, opening the Pickleball-linked group.
6. **`sport switcher — muted pill, plain`** — `role=group name="Sport filter"`, Home Feed, no
   interaction.
7. **`sport switcher — muted pill, as active filter`** — same scope → click pill → nudge → **Later**
   (keeps it muted while making it the selected filter, unlike **Yes** which would reactivate it
   and remove the muted state this baseline exists to capture).

`E2E_OVERVIEW.md` §3 (directory listing) and a new §6 catalog section, matching every other spec's
format.

### Key decisions

- **Deactivate-confirm assertion targets the "hidden from your active sports" note, not the dialog's
  own prompt text.** `SportProfileStatusConfirmDialog` renders its `prompt` string twice — once in a
  `sr-only` `DialogTitle`, once in a visible `<p>` — so asserting on the prompt itself needs a
  disambiguating `.first()` for no reason when a second, singly-rendered string already proves the
  right mode is showing. The reactivate-confirm assertion has no such second string, so it does use
  `.first()` on the (necessarily duplicated) prompt text — matching exactly what
  `profile-journey.spec.ts`'s own functional test already does for both cases.
- **No active-element blur before dialog screenshots.** `app-session-detail-modal.spec.ts` needs one
  because a focused text input's blinking caret is a real flake source; neither new dialog here has
  a focusable text input or autofocus (`onOpenAutoFocus` prevented on both), so the extra step would
  be dead code.
- **Verified by an `--update-snapshots` dry run, then discarded.** Ran
  `pnpm exec playwright test --project=visual-regression app-sport-reactivate --update-snapshots`
  locally — all 21 executed and passed (every selector resolved, every dialog opened), confirming
  the spec logic itself before handing baseline generation to Linux CI. The resulting
  Windows-rendered PNGs were inspected (deactivate dialog copy, group-nudge copy, the muted-selected
  pill showing both the accent border *and* muted text at once, the inactive Settings tab) and then
  deleted — never committed, per this repo's Windows-baseline rule.

### Divergence from the approved design

None.

### Visual-regression expectation

All **21 baselines are new** — nothing existing changes. `profile-settings-inactive-{375,768,1280}`,
`sport-status-confirm-{deactivate,reactivate}-{375,768,1280}`,
`reactivate-nudge-{sport-pill,group}-{375,768,1280}`,
`sport-switcher-muted-{plain,selected}-{375,768,1280}`. They don't exist yet, so there is nothing to
diff against on a Windows run beyond the noise floor — the real baselines come from the `client-ci`
`update-baselines` dispatch + `/updatebaseline`, same as every prior ticket. No other baseline is
touched by this ticket.

**Executed (2026-09-04).** `client-ci` `update-baselines` manual dispatch run on Linux (the first
run of the lean regen-only path — no lint/typecheck/unit/e2e, just install → regenerate → upload);
the `visual-baselines` artifact was applied via `/updatebaseline`. SHA-256 against the committed
set: **exactly the 21 predicted files were NEW; the other 87 baselines byte-identical** — 0
unexpected CHANGED, 0 MISSING. Human eyeball check (4 representative surfaces, mixed breakpoints):
the deactivate-confirm copy, the sport-pill nudge copy (correctly distinct from the group variant),
the plain muted pill, and the inactive read-only Settings tab (toggle off, Skill level/Years of
experience/Save all disabled) all render correctly — nothing unrelated drifted.

### Verification

- `pnpm exec tsc -b` — clean.
- `pnpm exec eslint e2e/visual/app-sport-reactivate.spec.ts` — clean.
- `pnpm exec playwright test --project=visual-regression app-sport-reactivate --update-snapshots` —
  **21/21 passed**; generated PNGs eyeballed correct, then deleted (not committed).
- No product code changed — the module-wide Vitest/e2e suites are unaffected; not re-run for a
  pure-new-spec-file change.
- `visual-regression` — the 21 baselines regenerated on Linux via the `client-ci` `update-baselines`
  dispatch and applied; SHA-256 confirms exactly those 21 are new, 87 byte-identical (see the
  Visual-regression expectation section above).
- `client/docs/E2E_OVERVIEW.md` §3 + a new §6 section added for the new spec file.
