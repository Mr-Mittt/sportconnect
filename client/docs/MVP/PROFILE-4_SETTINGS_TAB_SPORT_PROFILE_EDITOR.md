# PROFILE-4 · Settings tab — per-sport profile editor

**Status:** `DONE` (2026-08-27) · **Type:** Component · **Depends on:** `PROFILE-0` (hard), `SPORT-2` (hard) ·
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

---

## Implementation summary (2026-08-27)

### Scope grew at pickup — user decision, before any code

The two open questions above were resolved differently than either originally-listed option:

1. **No `'all'` pill on `/profile` at all — not just an empty state for Settings.** The user
   clarified mid-pickup that this applies to the *whole page*, not just this tab, and that it
   should have been said back when `PROFILE-0`/`PROFILE-2` were built. Since `PostsTab` (`PROFILE-2`,
   already `DONE`) treats `'all'` as a real, load-bearing state ("show every sport's posts
   unfiltered, composer untagged"), fixing this correctly meant retrofitting already-shipped code,
   not just building this ticket's own tab against a new rule. **User decision: fix it now, in this
   pickup**, rather than filing a separate follow-up and leaving master inconsistent in the
   meantime.
2. **Switch-away UX: silent re-seed, no confirm dialog.** Confirmed as recommended — this tab is
   built in isolation, before `ProfilePage` (`PROFILE-6`) exists, and does not own the
   `SportSwitcher` instance that changes `activeSport`. It can only react to the value changing, not
   intercept the click before it happens, so a "warn before switching" confirm dialog is not
   buildable from inside this isolated component. Documented as a note for `PROFILE-6`, which would
   need to wrap `SportSwitcher`'s `onChange` in a guard against this tab's `isDirty` if that UX is
   still wanted once the page exists.

### What was built

**`app/profilePageStore.ts`** — `activeSport: SportKey | 'all'` → `activeSport: SportKey | null`.
`null` means "not yet resolved," never "all sports." Persisted default changed from `'all'` to
`null` accordingly. `profilePageStore.test.ts` updated to match.

**`features/profile/useProfileActiveSport.ts`** (new) — the single place that turns `null` into a
real `SportKey`, defaulting to the caller's first sport profile once `useMySportProfilesRaw()`
resolves, and persisting that pick back into the store (a `useEffect`, not the "adjust during
render" pattern — this writes to an external, cross-component Zustand store, not local component
state). Returns `undefined` only for a caller with zero sport profiles. Shared by `usePostsTabData`
and this ticket's own `useSportProfileSettingsTabData` so the default-resolution logic exists in
exactly one place.

**`usePostsTabData.ts` / `PostsTab.tsx` retrofit (PROFILE-2 delta)** — now read `activeSport` via
`useProfileActiveSport()` instead of the store directly; `createPost`'s `'all' → omit sportId`
branch is gone (a post is always tagged with a real `sportId` except the zero-profile edge case,
which now omits it for a different reason — there is no sport to tag with at all).
`PostsTab.tsx` passes `activeSport ?? 'all'` to `Feed` — `Feed` itself is unchanged and still shared
with Home Feed/Groups, where `'all'` is a real, valid state; the `?? 'all'` here is purely `/profile`
absorbing its own zero-profile edge case into `Feed`'s existing "show everything" behavior, not a
reintroduction of the page-level `'all'` pill. `PostsTab.test.tsx` updated: the previously-`'all'`
default now resolves to the first sport profile (football, in the test fixtures), so every test that
implicitly relied on "both posts visible by default" now expects 1 (the tests targeting specific
posts were already scoped to the one that stays visible under the new default). The dedicated
`'all'`-pill test was replaced with a zero-sport-profile equivalent.

**`shared/components/SportSwitcher.tsx`** — new `showAllPill?: boolean` (default `true`, so Home
Feed/Groups/Matches are unaffected). `PROFILE-6` will pass `showAllPill={false}` when it actually
renders this component for `/profile` — nothing does yet, so this is capability-only for now, same
"wire the destination doesn't exist yet" pattern as `ProfileHeader`'s `onEditProfile`.

**`features/profile/sportProfileEditDraft.ts`** (new) — `UpdateSportProfilePayload` (1:1 with
`CreateUserSportProfileRequest`, reused server-side for update; `sportId`/`skillLevel` always
included since both are `@NotNull` on that DTO even for an update, confirmed by reading
`UserSportProfileServiceImpl.updateProfile()`) + `toSportProfileEditDraft`/
`buildSportProfileUpdatePayload`/`isSportProfileDraftDirty`, mirroring `sportFieldsDraft.ts`'s
diff-only shape. `attributes` diffed by `JSON.stringify` comparison (the flat map has no natural
per-key diff without re-deriving `SportAttributesFields`' own tree-walk) — safe to send whole since
the server merges rather than replaces.

**`features/profile/useUpdateSportProfile.ts`** (new) — wraps `PUT /api/sports/profiles/{profileId}`,
patches the shared `sportProfilesQueryKey(userId)` cache in place on success (the same array backing
`useMySportProfilesRaw`, `useSportProfilesForUser`/`SportSwitcher`, and `useAddSportProfile`).

**`features/profile/useSportProfileSettingsTabData.ts`** (new) — resolves the active profile, owns
the draft, re-seeds it (discarding unsaved edits) whenever the active profile's `id` changes — the
"adjust during render" pattern (`SportFieldsForm`'s `seededFrom`), correct here since this *is*
local component state, unlike `useProfileActiveSport`'s store write above.

**`shared/lib/skillLevels.ts`** (new) — `SKILL_LEVELS` extracted out of `AddSportFields.tsx` (a
component file) so both it and this ticket's new tab can import the fixed 3-value set without
duplicating it. Had to be its own file, not just an export off `AddSportFields.tsx` — `eslint-
plugin-react-refresh`'s `only-export-components` rule rejects a component file exporting anything
else.

**`features/profile/components/SportProfileSettingsTab.tsx`** (new) — self-contained tab, same
shape as `PostsTab`: owns its data via the hook above rather than receiving props, since no
`ProfilePage` exists yet. Renders "Add a sport above to set up its profile" for the zero-profile
edge case (there is no `'all'` empty state to build, per the scope decision above); otherwise the
base fields (`Skill level` `<Select>` reusing `SKILL_LEVELS`, `Years of experience`, `Preferred
position`) plus `SportAttributesFields` when a schema exists. Save disabled until dirty and until
`skillLevel` is non-empty (the one field `CreateUserSportProfileRequest` requires).

### Tests

`useProfileActiveSport.test.tsx` (3), `useUpdateSportProfile.test.tsx` (3),
`useSportProfileSettingsTabData.test.tsx` (4, including the silent-re-seed-on-switch case),
`SportProfileSettingsTab.test.tsx` (5), plus 1 new `SportSwitcher.test.tsx` case
(`showAllPill={false}`) and `profilePageStore.test.ts`/`PostsTab.test.tsx` updated in place — 16 net
new tests. No `SportProfileSettingsTab.stories.tsx` — same precedent `PostsTab` set (a self-
contained, data-owning tab's visual states are already covered by the presentational pieces it
composes, here `SportAttributesFields`' own stories).

### Verification

`tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings), full Vitest suite green
(146→150 files, 984→1000 tests, exactly the 16 new/changed tests accounted for, no regressions),
`build-storybook` green. Verified the real `PUT /api/sports/profiles/{profileId}` contract directly
against a running backend (`:server:bootRun`, throwaway registered user, real Badminton sport
profile) — confirmed the update response shape, the diff-only payload semantics, and the
attribute-merge behavior (`GET .../attribute-schema` for Badminton, then a `PUT` setting
`handedness`/`playstyle`, confirmed both persisted). No live browser walkthrough of the assembled
tab — no page hosts it yet (`PROFILE-6`), same gap prior `PROFILE-*` component tickets noted.
