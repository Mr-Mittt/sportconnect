# PROFILE-10 · `/profile` page enhancements — sport badge, edit-modal bound, unsaved-changes guards, bio styling, SportSwitcher hover

**Status:** `DONE` (2026-08-27) · **Type:** Enhancement · **Depends on:** none ·
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
~10% smoothly on hover and when selected/active (raised from the original ~5% at pickup, user
decision) — label text included, which scaling the whole button
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

---

## Implementation summary (2026-08-27)

**Built as approved**, one commit per item as requested at pickup, all landing as designed with one
real discovery along the way (below).

**1. Sport badge (`PostsTab.tsx`).** One line — `showSportBadge={false}` on the `<Feed>` call. New
Vitest case confirms neither fixture sport's label renders on the card.

**2. Shoe-size bound (backend + client).** `UserServiceImpl.updateProfile()` 35→500 + message text;
`UserServiceImplSpec.groovy`'s out-of-bounds data table `[9, 36]` → `[9, 501]`;
`EditProfileModal.tsx`'s `max={35}` → `max={500}`. No entity/DTO/migration change, confirmed against
`V024__add_physical_stats_to_users.sql` — plain `INTEGER` column, no DB `CHECK` constraint.

**3. Settings tab unsaved-changes guard — the largest piece, and the one real design discovery.**
Building this surfaced that `useSportProfileSettingsTabData()` needed to move from being called
*inside* `SportProfileSettingsTab` to being called by `ProfilePage` and passed down as props — the
same conversion `PROFILE-4`'s own doc comment predicted PROFILE-6/10 would eventually need
("cannot intercept the [SportSwitcher] click itself... not buildable from inside this isolated
component"). Built:
- **New `shared/hooks/useUnsavedChangesGuard.ts`** — generic `useBlocker` + `beforeunload` +
  `pendingAction` primitive, extracted from `GroupsPage`'s `useSettingsUnsavedGuard`
  (`features/groups/`), which is left untouched (migrating it onto this primitive is a real
  refactor with its own regression risk, not requested).
- **`SportProfileSettingsTab.tsx` converts from self-contained to controlled** — mirrors
  `GroupSettingsTab`/`GroupsPage` exactly. `SportProfileSettingsTab.test.tsx` rewritten as pure
  prop-driven tests (no more API mocking for this component's own tests, a net simplification).
- **`useSportProfileSettingsTabData.ts` gains `save(options?: { onSuccess })` and `discard()`** —
  both additive/backward-compatible. `discard()` turned out to be a real necessity, not a nice-to-
  have: once the hook is called persistently from `ProfilePage` (not conditionally mounted with the
  tab), the tab-switch case no longer naturally destroys the stale draft via unmount the way it
  would have if the hook had stayed inside the tab — `discard()` resets it explicitly instead.
- **New `features/profile/components/SettingsUnsavedChangesDialog.tsx`** — same shape as Groups'
  version, not reused directly since its message text is hardcoded per-feature.
- **`ProfilePage`** now calls the data hook + guard directly, wraps `ProfileTabs`' and
  `SportSwitcher`'s `onChange` in `guard()`, renders the dialog. Calling
  `useSportProfileSettingsTabData()` unconditionally (not gated to when Settings is active, unlike
  `GroupsPage`'s own settings queries) means its `useSportAttributeSchema` fetch now runs on every
  `/profile` visit — a small, deliberate eagerness trade-off, noted in the page's own doc comment:
  the guard needs to know `isDirty` before the user has necessarily ever opened Settings this
  session, and the request itself is cheap and cached.
- 4 new `ProfilePage.test.tsx` cases (tab-switch block+discard, sport-pill block+save-then-proceed,
  cancel, no-op when clean) + 6 new `useUnsavedChangesGuard.test.tsx` cases + 1 new
  `useSportProfileSettingsTabData.test.tsx` case (`discard`) + `SportProfileSettingsTab.test.tsx`
  fully rewritten (7 cases, all prop-driven).

**4. Post composer unsaved-changes guard — app-wide, self-contained in `CreatePostForm`.** Reuses
`useUnsavedChangesGuard(hasText)` — no lifting needed, since `CreatePostForm` already owns `content`
and the scope here is only in-app-nav + browser-close (no tab-switch leg, unlike Settings). New
`shared/components/UnsavedPostConfirmDialog.tsx` (Leave/Keep-editing — no Save option, since a
composer draft has nothing to persist). Every hosting page (Home Feed, Groups, `/profile`) picks
this up for free.
- **Ripple effect, expected going in:** `useBlocker` requires a data router, so every test that
  renders `CreatePostForm` (directly or via a hosting page) needed its router wrapper upgraded from
  a plain `<MemoryRouter>`/no router to `createMemoryRouter`/`RouterProvider` — `CreatePostForm.test.tsx`
  (+3 new guard cases), `CreatePostForm.stories.tsx` (router decorator), `HomeFeedPage.test.tsx`,
  `PostsTab.test.tsx`. `GroupsPage` also mounts `CreatePostForm` but has no dedicated test file, so
  nothing there needed updating.

**5. Bio styling (`ProfileHeader.tsx`).** Italic, wrapped in curly quotes (`&ldquo;`/`&rdquo;`).
`ProfileHeader.test.tsx` updated to match the new rendered text (quote characters are now part of
the paragraph's text content).

**6. `SportSwitcher` pill hover/selected scale.** `hover:scale-110` on every pill,
`scale-110` additionally on the active one (stacks with the existing 2px active border), both with
`motion-reduce:` overrides back to `scale-100` — addresses the ticket's own flagged a11y-baseline
check proactively rather than leaving it for later. New Vitest case confirms the class split between
active/inactive/hover. **Delta (post-close, user-flagged):** raised from the originally-shipped
`scale-105` to `scale-110` — user tried the 5% version and asked for 10% instead.

**Verification:** `tsc -b` clean throughout, `pnpm lint` clean (same 2 pre-existing unrelated
warnings in `SessionStartTimePicker.tsx`), full Vitest suite green (153 files, 1029 tests, up from
152/1006 at ticket start — 23 net new tests, no regressions), `build-storybook` green after each of
items 3/4/6, `:modules:user:user-impl:test` green for item 2's Spock change. The Claude-in-Chrome
browser extension was not connected this session (same recurring gap noted on `PROFILE-0`/`1`/`5`/
`6`) — could not visually confirm the Storybook stories or walk the guards' happy paths in a real
browser; `PROFILE-7` remains the ticket that will produce the first real screenshot evidence.
