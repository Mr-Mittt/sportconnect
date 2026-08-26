# PROFILE-3 · Memories tab (placeholder)

**Status:** `DONE` (2026-08-27) · **Type:** Component · **Depends on:** `PROFILE-0` ·
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

---

## Implementation summary (2026-08-27)

**Built as approved**, no deltas.

**`client/src/features/profile/components/MemoriesTab.tsx`** — a thin, presentational wrapper:

```tsx
export function MemoriesTab() {
  return <ComingSoonPage title="Memories" />;
}
```

Same location/pattern as `PROFILE-2`'s `PostsTab` (`features/profile/components/`), not
`shared/components/` like `PROFILE-1`'s `ProfileHeader` — this component is profile-specific (a tab's
content), not a cross-page shared piece. `title="Memories"` matches the design reference's rail-tab
label (`design-reference-profile.html`'s `railTabs` array, `key: 'memories', label: 'Memories'`).

No props, no store read, no data hook — deliberately, per the ticket's explicit "no mock data, no
backend design attempt" scope. `PROFILE-6` (page integration, still `TODO`) is what will mount this
inside the actual tab-switching `ProfilePage` alongside `ProfileHeader`/`PostsTab`/the Settings tab;
until then, `/profile`'s route still renders the pre-existing full-page `ComingSoonPage` stub
(`router.tsx`), unchanged by this ticket — this ticket only produces the component in isolation, same
precedent `ProfileHeader` and `PostsTab` established before page integration existed.

**Tests:** 1 Vitest/RTL case — renders `ComingSoonPage`'s content (`heading` "Memories", "Coming
soon." text). The ticket's original test note ("nothing else on the page unmounts or changes") can't
be exercised yet — there's no assembled `ProfilePage` with a header/switcher/rail-tabs to unmount
around it; that composed-page test belongs to `PROFILE-6`/`PROFILE-7`, which will exercise
`MemoriesTab` in that context once it exists. No Storybook story added — `PostsTab` set the
precedent of skipping stories for profile tab components (`ComingSoonPage` itself already has the
one relevant story), and there's no new visual state here to capture. User confirmed this trade-off
at pickup.

**Verification:** `tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings in
`SessionStartTimePicker.tsx`, same ones `PROFILE-1` noted), new test passes, full Vitest suite run
(see PR/session notes for result).
