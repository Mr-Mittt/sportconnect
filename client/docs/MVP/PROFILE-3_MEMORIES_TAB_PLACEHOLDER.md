# PROFILE-3 · Memories tab (placeholder)

**Status:** `TODO` · **Type:** Component · **Depends on:** `PROFILE-0` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

The Memories tab's content slot renders the existing `ComingSoonPage` component as-is. User decision
during scoping: no mock-data timeline, no backend design attempt — the design reference's grouped
"on this day, N years ago" timeline has no plausible data source yet (there isn't meaningful
multi-year history to look back on), so this stays a placeholder until it's actually scoped as its
own feature.

`ComingSoonPage` is rendered *inside* the tab's content area — the header, `SportSwitcher`, and rail
tabs around it (`PROFILE-6`) stay live and functional; this isn't a full-page redirect.

## Explicitly out of scope

Any Memories functionality at all — grouping, share/hide, mock data. This ticket is the placeholder
only. A real Memories feature is a future, separately-scoped feature.

## Tests

Vitest/RTL — the tab renders `ComingSoonPage` when selected, and nothing else on the page
(header/switcher/rail tabs) unmounts or changes.
