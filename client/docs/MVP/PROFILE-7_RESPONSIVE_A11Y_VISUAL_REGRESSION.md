# PROFILE-7 · Responsive + accessibility + visual regression

**Status:** `TODO` · **Type:** Testing · **Depends on:** `PROFILE-6` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

Same hardening pass every other screen gets (`HF-8`/`HF-10b`, `GRP-10`, `CLIENT-SESSION-12`
precedent):

- Responsive check at 375/768/1280px.
- Keyboard/screen-reader pass across the whole page — tab order through `SportSwitcher`, rail tabs,
  post composer, comment modal, Edit Profile modal, Settings tab's editor.
- Visual-regression spec against `client/design-reference/design-reference-profile.html` (already in
  the repo), screenshotted at all three breakpoints, added to the CI gate same as every other screen.

## Explicitly out of scope

New functionality — this ticket only hardens what `PROFILE-1`..`PROFILE-6` already built.

## Tests

Playwright `visual-regression` project, new spec file. Update `client/docs/E2E_OVERVIEW.md`'s catalog
(§3 directory listing + §6 per-file table) per the standing convention.
