# PROFILE-8 · E2E functional test — profile journey

**Status:** `TODO` · **Type:** Testing · **Depends on:** `PROFILE-6` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

Playwright `e2e` project spec, network mocked via MSW, scripting: navigate to `/profile` → view own
header/bio → switch `SportSwitcher` pill → post from the Posts tab composer → open a post's comment
modal and comment → switch to Settings, edit `skillLevel`/an attribute for the active sport, save →
open Edit Profile, change bio, save → switch to Memories, confirm the `ComingSoonPage` placeholder
renders.

## Explicitly out of scope

Account settings (`ACCOUNT-1`'s own journey, filed and tested separately since it doesn't live on
this page).

## Tests

This ticket *is* the test. Update `client/docs/E2E_OVERVIEW.md` per the standing convention (same
requirement as `PROFILE-7`, different section of that doc).
