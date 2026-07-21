# GRP-2 · Adapt Settings Tab to the Full Group Settings Data Set

**Status:** `DONE` (2026-07-21)
**Type:** Feature
**Dependency:** B7 (`modules/social/group-impl`, `DONE`)

## Origin

GRP-1 shipped the Settings tab with only Privacy/Leave/Delete wired — the four `GroupSettings`
fields (`allowMemberPosts`/`requirePostApproval`/`allowMemberInvites`/`maxMembers`) were deliberately
left out pending B7's audit of the split settings-data contract. B7 landed and, in the process,
replaced `maxMembers` entirely with a fixed group-type tier system (`DEFAULT`/`STANDARD`/`PREMIUM`) —
this ticket's original text ("a number field for maxMembers") was stale by the time it was picked up.

## Design (as scoped at pickup, with corrections found along the way)

The ticket's original spec assumed the same owner+admin gating as Privacy and a settable
`maxMembers` field. Neither held up:

- **`maxMembers` isn't shown at all.** B7 made it a read-only value resolved from the group's type,
  with no way to change the type yet (B10, moved to the V1 backlog this same session). Rather than
  display a cap number with nothing to do about it, only the group's type name is shown
  (`GroupSettingsResponse.maxMembers` is intentionally not even typed on the client — no speculative
  modeling of an unused field).
- **The three toggles are owner-only, not owner+admin.** B7 confirmed `updateGroupSettings` is
  `isGroupOwner`-gated, stricter than Privacy's `updateGroup` (owner+admin). Admin and member see the
  toggles as plain read-only text, same treatment as a member viewing Privacy.
- **Notifications stays unbuilt.** The design reference HTML shows a Notifications toggle, but it has
  no backing endpoint anywhere in `GroupSettingsResponse`/`UpdateGroupSettingsRequest` — out of scope,
  same as GRP-1 left it.

**Mid-ticket scope addition, then reversed:** a request to "add localization" was raised, clarified as
i18n/multi-language UI text, then deliberately deferred to its own unscoped V1 ticket (**I18N-1**,
`client/docs/BACKLOG_V1.md`) rather than bundled here — i18n is a cross-cutting foundation change, not
a Settings-tab feature.

**Real scope addition, kept:** a Save button (disabled until something changed) plus a Discard/Save
confirmation dialog when leaving the Settings tab with unsaved toggle edits. This turned out to need
`useBlocker` for the in-app-navigation trigger, which only works with a data router — the app was
still on a plain `<BrowserRouter>`. That migration is documented separately below since it's a
genuinely separate, isolated piece of work, done first and verified on its own before any Settings-tab
code touched it.

## Part A — Router migration (prerequisite, referred to as ROUTER-1 in code comments)

Not a formally tracked backlog ticket — folded into this session as a verified prerequisite step,
referenced as "ROUTER-1" in code comments for traceability, not filed as its own entry in any
`BACKLOG_*.md`.

- `src/router.tsx` (new) — the exact same route JSX `App.tsx` used to render, wrapped in
  `createRoutesFromElements`; exports `routes` (reused by tests) and `router = createBrowserRouter(routes)`.
- `src/RootLayout.tsx` (new) — `useSessionBootstrap()` (moved out of the old `App` component) +
  `<Outlet/>`, as the route tree's root element.
- `src/main.tsx` — `<BrowserRouter><App/></BrowserRouter>` → `<RouterProvider router={router} />`.
- `src/App.tsx` — deleted (dead after the move; confirmed only `main.tsx`/`App.test.tsx` referenced it).
- `src/App.test.tsx` — `renderApp()` helper swapped `<MemoryRouter initialEntries><App/></MemoryRouter>`
  for `<RouterProvider router={createMemoryRouter(routes, {initialEntries})} />`. All 16 existing
  cases pass unchanged — only the router-construction mechanism changed.

**Verification (isolated, before any GRP-2 code):** full Vitest suite (395/395 at that point),
`tsc -b` clean, `eslint .` clean, full Playwright `e2e` project (34/34) — the first e2e run showed 17
failures, traced to a stray `pnpm dev` process left running from an earlier manual check (without the
mock-server proxy env var `VITE_API_PROXY_TARGET`), not a router regression; killing it and re-running
came back fully green.

## Part B — Settings tab

**Types** (`src/features/feed/types.ts`): `GroupSettings`, `UpdateGroupSettingsPayload` — typed 1:1
against the real `GroupSettingsResponse`/`UpdateGroupSettingsRequest` DTOs, `maxMembers` omitted.

**Query key**: `feedKeys.groupSettings(groupId)`.

**Data layer** (`src/features/feed/hooks/`):
- `useGroupSettings(groupId, enabled)` — `GET /api/groups/{groupId}/settings`, gated by `enabled` so
  it only fetches while the Settings tab is active (mirrors `useComments`' dialog-open gating).
- `useUpdateGroupSettings()` — `PUT /api/groups/{groupId}/settings`, writes the response into the
  `groupSettings(groupId)` cache entry (same "patch, don't refetch" pattern as `useUpdateGroup`).

**Unsaved-changes orchestration** (`src/features/groups/useSettingsUnsavedGuard.ts`, new): owns the
draft state for the three toggles, `hasUnsavedChanges`, save/discard, and three "leaving" triggers:
1. In-page tab/group switches — callers wrap their switch handlers in `guard()`.
2. In-app navigation to a different route — `useBlocker` (Part A's payoff).
3. Browser close/refresh/typed-URL nav — `beforeunload`. **Hard platform limitation**: this can only
   ever show the browser's own generic native prompt — no custom text or buttons possible (a
   restriction since ~2011) — never this ticket's Discard/Save dialog.

Both the blocked-navigation case and a guarded in-page action share one dialog state
(`isLeaveDialogOpen`); `discard()`/`save()` resolve whichever triggered it.

**Component** (`GroupSettingsTab.tsx`, extended): a shared `ToggleFieldRow` for the three
owner-only toggles (each button carries a distinguishing `aria-label` — e.g. `"Allow member invites:
Off"` — a real a11y fix, since three identical "On"/"Off"-labeled buttons on one page were otherwise
indistinguishable to a screen reader), a read-only "Group type" row, and a Save button (disabled until
`hasUnsavedSettingsChanges`).

**New component**: `SettingsUnsavedChangesDialog` — Discard changes / Save changes, same shape as
`DeleteGroupConfirmDialog`.

**Page wiring** (`GroupsPage.tsx`): `useSettingsUnsavedGuard` called directly (matching the existing
pattern of calling `useUpdateGroup`/`useLeaveGroup`/`useDeleteGroup` directly rather than a composed
hook); `GroupTabs`' `onChange` and the three group-switch entry points (`GroupSpaceSwitcher`,
`GroupCoverBanner`'s back button, `GroupDiscoveryPanel`) wrapped in `guardedSetActiveGroupTab`/
`guardedSelectGroupAndShowPosts`. `CreateGroupModal`'s post-create navigation is deliberately left
unguarded — it's only reachable from the "no group selected" empty state, which can't coexist with an
open, dirty Settings tab.

## Tests

- `useGroupSettings.test.tsx` (3), `useUpdateGroupSettings.test.tsx` (2) — hook-level, mirroring
  `useUpdateGroup.test.tsx`'s style.
- `useSettingsUnsavedGuard.test.tsx` (8) — needed a custom render harness (a two-route memory router
  hosting the hook via a `Harness` component) since `useBlocker` requires a real data router context,
  which a plain `renderHook` `wrapper` can't supply (`RouterProvider` ignores `children`). Covers the
  dirty/clean computation, `guard()`'s immediate-vs-stash behavior, discard/save/cancel, and a full
  `useBlocker` integration case (navigate away while dirty → blocked → discard → proceeds).
- `GroupSettingsTab.test.tsx` — extended from 4 to 13 cases: group-type display, owner/admin/member
  toggle gating, Save enable/disable, save-triggered callback, save error, loading/error states.
- `GroupSettingsTab.stories.tsx` — extended with loading/error/unsaved-changes/saving/save-error states.
- New `e2e/flows/group-settings.spec.ts` (4 steps): load, toggle+Save+persist-across-reload,
  tab-switch guard+Discard, in-app-nav guard+Save. New MSW handlers
  (`GET`/`PUT /api/groups/:groupId/settings`) and `mockGroupSettings` fixture (keyed to
  `mockOwnedGroup`, the only fixture group where the test user is `group_owner`).
  `client/docs/E2E_OVERVIEW.md` updated (§3 directory listing, §5 fixtures reference, §6 catalog).

## Verification

- `tsc -b` — clean.
- `eslint .` — clean (one real finding along the way: a `setState` synchronously inside a `useEffect`
  in `useSettingsUnsavedGuard`, fixed using the same "adjust state during render" pattern
  `PublicOnlyRoute.tsx` already documents, per `eslint-plugin-react-hooks` v7's `set-state-in-effect`
  rule).
- `pnpm exec vitest run` — 417/417 across 80 files (up from 395/77 pre-ticket).
- `pnpm run build-storybook` — clean build, `GroupSettingsTab.stories.tsx` compiles.
- `pnpm run e2e` — 35/35 (34 pre-existing + the new spec), including the full router-migration
  verification pass from Part A.

## Out of scope

- Preserving `maxMembers` in the UI in any form — B10 (group type change flow) is the ticket that
  will make it meaningful again.
- Notifications toggle — no backend.
- i18n/localization — filed as **I18N-1** in `client/docs/BACKLOG_V1.md`, entirely unscoped, for a
  future pickup.
- The `beforeunload` trigger's dialog content — platform limitation, not a gap in this
  implementation.
