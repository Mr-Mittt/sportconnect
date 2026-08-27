# PROFILE-10 · `/profile` page enhancements — sport badge, edit-modal bound, unsaved-changes guards, bio styling, SportSwitcher hover

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** none ·
**Filed:** 2026-08-27, a batch of gaps/polish the user flagged after using the shipped `/profile`
page (`PROFILE-6`)

## What ships

Six independent items found using the live `/profile` page, filed together from one session rather
than six separate tickets — this repo's own "bundle related-but-independent finds from one pass"
precedent (`GRP-8`, `CLIENT-SESSION-10`). Each item ships independently. **Item 2 includes a small
backend touch** (one bound value + one message string in `modules/user/user-impl`, no schema
change) — folded into this ticket rather than filed as its own backend ticket (user decision,
2026-08-27: too small to warrant a separate ticket/dependency).

**1. Hide the sport badge on `/profile`'s Posts tab.** `Feed` already supports this
(`showSportBadge?: boolean`, default `true`, used by `GroupsPage` as `showSportBadge={activeSport
=== 'all'}`) — `PostsTab.tsx`'s own `<Feed>` call never passes it. Unlike Home Feed/Groups (which can
show "All" and need the per-post badge to say which sport a post belongs to), `/profile` has no
`'all'` state (`PROFILE-4`'s page-wide decision) — the active sport is always already visible via the
page's own `SportSwitcher` pill, so the badge on every post card is redundant. Fix:
`showSportBadge={false}` in `PostsTab.tsx`.

**2. `EditProfileModal`'s shoe-size field caps too low — client + backend.** Currently `max={35}`
(`#edit-profile-shoe-size`), matching the backend's real bound exactly:
`UserServiceImpl.updateProfile()` (`modules/user/user-impl`) rejects `shoeSizeCm` outside 10–35
(`"shoeSizeCm must be between 10 and 35"`, line 189-191) — a bound `U7` confirmed with the user at
the time, now revisited. Raise **both** together (the client bound is documented as "a soft UX hint
only, the server's bound is authoritative" — `PROFILE-5`'s implementation summary — so raising only
the client side would let someone submit 36–500 and hit a confusing server rejection):
- Backend: `UserServiceImpl`'s upper bound 35 → 500 (lower bound 10 unchanged, not raised, not
  discussed), update the error message text to match. No entity/DTO/migration change —
  `shoe_size_cm` is a plain `INTEGER` column with no DB-level `CHECK` constraint
  (`V024__add_physical_stats_to_users.sql`); the 10–35 bound is Java-side only.
- Client: `EditProfileModal`'s `max={35}` → `max={500}`.

**3. Settings tab has no unsaved-changes guard.** Flagged and explicitly deferred at `PROFILE-6`
pickup (its Delta note: "declined to build a `PROFILE-4`-flagged unsaved-Settings-changes guard on
sport switch... left as a real known gap for a future ticket if it turns out to matter in
practice") — it does now. Scope: same three leave-points `GroupsPage`'s existing
`useSettingsUnsavedGuard` (`features/groups/useSettingsUnsavedGuard.ts`) already covers for Groups —
in-page switch (here: away from the Settings tab to Posts/Memories, *and* switching the
`SportSwitcher` pill while on Settings — the exact case `PROFILE-6` declined), in-app navigation away
from `/profile` (`useBlocker`), and browser close/refresh (`beforeunload`, native prompt only).
Reuses `SettingsUnsavedChangesDialog` for the in-page/in-app cases, same component Groups already
shows. Profile's version has one dimension (`activeSport`) instead of Groups' two (`groupId` +
settings-vs-info-section) — a new `useProfileSettingsUnsavedGuard` scoped to this page's own shape is
the expected shape, not a forced generalization of the Groups hook.

**4. Post composer has no unsaved-changes guard — app-wide, not `/profile`-specific.**
`CreatePostForm` is mounted on Home Feed, Groups' Posts tab, and `/profile`'s Posts tab. Typed-but-
unsubmitted composer text should warn before the caller navigates away in-app or closes/refreshes the
tab — same two leave-points as item 3, minus the tab-switch case (the composer isn't tied to a page
tab the way Settings is). **Explicitly bundled into this ticket despite reaching beyond `/profile`**
(user decision, 2026-08-27) — the natural home for the guard is `CreatePostForm` itself (or a hook it
uses), which every hosting page picks up for free once built there, not three separate per-page
changes. Worth noting at pickup: items 3 and 4 are both "warn before leaving if X is true" — a shared
`useUnsavedChangesGuard(hasUnsavedChanges)` primitive both could sit on top of is a reasonable design
option to consider, not a decision made here.

**5. Bio styling.** `ProfileHeader`'s bio paragraph
(`<p className="max-w-150 text-2sm text-text-primary">{user.bio}</p>`) renders as plain text. Render
it italicized and wrapped in double quotes instead.

**6. `SportSwitcher` pill hover/selected scale.** Pills (`SportSwitcher.tsx`'s `Pill`) should grow
~5% smoothly on hover and when selected/active — label text included, which scaling the whole button
achieves for free, no separate text-only treatment needed — with a transition alongside the existing
`transition-colors`. Scoped to the sport pills only; the dashed "Add sport" pill is unchanged (not
mentioned, and already has its own distinct treatment).

## Explicitly out of scope

Any other physical-stat bound (`heightCm`/`weightKg` — item 2 only touches `shoeSizeCm`). Extending
the unsaved-changes guard to any other form (`EditProfileModal` itself isn't guarded — not
requested). Reduced-motion handling for item 6 beyond whatever this app's existing baseline does
elsewhere — worth checking against `client/CLAUDE.md`'s a11y baseline at pickup, not decided here.

## Tests

Per item: (1) `PostsTab.test.tsx` — no sport badge rendered; (2) backend —
`UserServiceImplSpec.groovy`'s `"updateProfile throws BadRequestException when shoeSizeCm is out of
bounds"` data table currently asserts `[9, 36]` as out-of-bounds; `36` becomes valid under the new
bound, replace it with a value above 500, keep `9` for the unchanged lower bound; client —
`EditProfileModal.test.tsx` — input accepts up to 500, rejects above; (3) new hook test +
`ProfilePage.test.tsx` cases — leaving Settings with unsaved edits via tab switch / sport-pill
switch / in-app nav all prompt, `beforeunload` wiring covered the same way
`useSettingsUnsavedGuard`'s own tests do; (4) same shape,
scoped to wherever the guard lands; (5) `ProfileHeader.test.tsx` — italic + quoted rendering; (6)
visual only — covered by `PROFILE-7`'s visual-regression pass if it lands after this ticket,
otherwise a Storybook check.
