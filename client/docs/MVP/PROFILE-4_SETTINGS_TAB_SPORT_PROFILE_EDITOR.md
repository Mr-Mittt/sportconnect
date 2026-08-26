# PROFILE-4 · Settings tab — per-sport profile editor

**Status:** `TODO` · **Type:** Component · **Depends on:** `PROFILE-0` (hard), `SPORT-2` (hard) ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

The Settings tab is **not** the mockup's account-settings panel (see design doc §2/§5 — that moved to
`ACCOUNT-1`, off this page entirely). User decision during scoping: "setting tab is about sport
profile setting + sport attribute setting (SPORT-2)."

Renders, scoped to whichever sport is active in the page's own `SportSwitcher` (`profilePageStore`):

1. **Base sport-profile fields** — `skillLevel`, `yearsOfExperience`, `preferredPosition`. These are
   real `UserSportProfile` fields, set once at `AddSportModal` creation time (`AddSportFields.tsx`)
   and **never editable anywhere in the app since** — this is the first ticket to make them editable.
2. **`SportAttributesFields`** (`SPORT-2`) — the schema-driven attribute renderer, for the same active
   sport. This is the ticket that finally hosts `SPORT-2`'s component (see that ticket's own "Follow-
   up this unblocks" note).

Both save through `PUT /api/sports/profiles/{profileId}` — endpoint already exists
(`UserSportProfileServiceImpl`), no client hook wraps it yet (new, this ticket). `profileId` and the
raw `attributes` map come from `PROFILE-0`'s raw sport-profile hook, keyed to whichever sport is
active.

**Open design question, to resolve at pickup, not guessed here:** what renders when the
`SportSwitcher` pill is `'all'` (no single sport selected)? Two reasonable options: default to the
first sport profile, or show an explicit "select a sport above" empty state. Not decided in this
filing — pick whichever reads better once the tab is actually built next to the real switcher.

## Explicitly out of scope

Everything `PROFILE-5` already owns (cover/avatar/bio/name/city/country). Adding/removing a sport
profile — that's `AddSportModal`'s job already, unchanged.

## Tests

Vitest/RTL — editor renders the active sport's current values; switching the `SportSwitcher` pill
re-seeds the form to the newly active sport (and discards unsaved edits to the previous one, or warns
— decide the exact UX at pickup, same unsaved-changes-guard precedent `ADMIN-4` established for
`AttributeSchemaEditor`); save calls `PUT /api/sports/profiles/{profileId}` with the merged
base-fields + attributes payload.
