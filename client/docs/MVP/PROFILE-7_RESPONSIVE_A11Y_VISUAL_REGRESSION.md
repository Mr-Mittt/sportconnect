# PROFILE-7 · Responsive + accessibility + visual regression

**Status:** `DONE` (2026-08-27) · **Type:** Testing · **Depends on:** `PROFILE-6` ·
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

---

## Implementation summary (2026-08-27)

**Approved design** (confirmed at pickup): responsive check at 375/768/1280px, keyboard/screen-reader
pass, visual-regression spec against `design-reference-profile.html` at all 3 breakpoints — same
shape `HF-8`/`GRP-10`/`CLIENT-SESSION-12` already established for other pages/modals, no new
functionality. Two judgment calls confirmed with the user before implementing: (1) a real MSW
test-infra gap found at pickup (below) was in scope to fix here rather than split out; (2) visual
coverage is 4 curated states (posts/memories/settings/edit-profile-modal), not fewer.

**Built as approved**, plus two real bugs the new checks found and fixed (not left as findings —
matching `HF-8`'s own precedent of fixing what its audit turns up):

1. **MSW gap — `/profile` couldn't be loaded under Playwright at all before this ticket** (`PROFILE-6`/
   `PROFILE-8` never ran it through the real e2e mock backend; `PROFILE-8`, the E2E ticket, is still
   `TODO`). `GET /api/posts/mine` didn't exist in `e2e/mocks/handlers/feed.ts` — added, filtered by
   `userId === mockUser.id`, placed before the `:postId` catch-all (same literal-segment-first
   ordering every other route there already follows). `friends.ts`'s `GET /api/users/:userId`
   returned only the narrow `FriendUser` shape for every id — fine for looking up *other* users, but
   `useMyProfile`/`ProfileHeader`/`EditProfileModal` need the full `UserResponse` for the caller's
   *own* id. Special-cased `userId === mockUser.id` to return a new `mockMyProfile` fixture
   (`e2e/mocks/fixtures.ts`, full `UserResponse` shape), falling through to the existing narrow
   `KNOWN_USERS` directory for every other id — matches the real backend's actual contract (always
   returns the full row, regardless of caller) more accurately than the pre-existing mock did.
2. **Nested `<main>` landmark** — `MemoriesTab` (`PROFILE-3`) mounts `ComingSoonPage` inside
   `ProfilePage`'s own `<main>`. `ComingSoonPage` was still written as a top-level route component
   (`<main>` + `<h1>`), but its only call site anywhere in the app is now this nested one — router-
   level usage was removed once every route it used to placeholder went real. Changed its wrapper to
   a `<div>` (axe: `landmark-main-is-top-level`, invalid document structure otherwise). If a future
   ticket reintroduces a genuine top-level/route use, that call site should own the `<main>` again —
   not assumed to still exist here.
3. **Composer overflow at 375px** — the new `profile page @ 375px — no horizontal overflow` check
   (`a11y.spec.ts`) caught a real bug: `CreatePostForm`'s Photo/Location/Tag-sport/Post action row
   doesn't fit one line once a left tab rail (`ProfileTabs`, `w-37.5`) eats into a narrow viewport.
   The identical bug is reachable on the already-shipped Groups page too (`GroupTabs` is the same
   width) — never caught there because no overflow assertion was ever added for it. Fixed with the
   same `overflow-x-auto`/`shrink-0` idiom `NavTabs` already established (`HF-8`): the icon-button
   group scrolls within itself instead of pushing the Post button off-canvas or the page overflowing
   sideways. **Verified the fix's blast radius directly**, not assumed: stashed just this file's
   change, re-ran Home Feed's and Groups' full visual-regression suites — every one of those failures
   reproduced identically with the fix reverted (pure pre-existing local Windows font-rendering noise,
   the same already-documented/accepted class `CLIENT-SESSION-12` describes, unrelated to this
   change) — then restored the fix. Home Feed/Groups baselines were **not** touched.

**Built:**
- `e2e/visual/app-profile.spec.ts` — 4 states (`posts`/`memories`/`settings`/`edit-profile-modal`) ×
  3 breakpoints = 12 baselines. Full-page except `edit-profile-modal` (dialog-scoped, matching
  `app-session-detail-modal.spec.ts`'s reasoning). Neither `settings` nor `edit-profile-modal` needed
  a PUT mutation handler — Save stays disabled until dirty, and the modal state is never submitted,
  so both are static, non-interactive baselines.
- `e2e/flows/a11y.spec.ts` extended: overflow + axe at all 3 breakpoints for the default (Posts)
  state (this ticket's own text explicitly asked for the full per-breakpoint gate, unlike Groups'/
  Friends' single representative check), plus one representative axe check each for Settings tab and
  the Edit Profile modal open (matching `GRP-3`/`FRIEND-1`'s "richer state, not a full matrix"
  scoping for those two).
- `e2e/mocks/fixtures.ts` — new `mockMyProfile` fixture. `e2e/mocks/handlers/feed.ts` — new
  `GET /api/posts/mine`. `e2e/mocks/handlers/friends.ts` — `GET /api/users/:userId` now special-cases
  the caller's own id.
- `src/shared/components/ComingSoonPage.tsx` — `<main>` → `<div>`.
- `src/shared/components/CreatePostForm.tsx` — action row's icon-button group now
  `min-w-0 flex-1 overflow-x-auto` with `shrink-0` buttons and a `shrink-0` Post button.

**Verification:** `tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings in
`SessionStartTimePicker.tsx`), full Vitest suite green (153 files, 1029 tests, no regressions),
`build-storybook` green, full `--project=e2e` run green (73/73, confirms the `CreatePostForm`/MSW
changes broke nothing elsewhere), `--project=visual-regression app-profile.spec.ts` stable (12/12,
one local re-run flake at the documented ~0.01 Windows-noise ratio, not a real diff — same class
`CLIENT-SESSION-12` already accepts). `client/docs/E2E_OVERVIEW.md` updated (§3 directory listing,
§5's `a11y.spec.ts` table, new §6 entry for `app-profile.spec.ts`).

**Baselines — Windows-rendered locally, need the `client-ci` `update-baselines` dispatch swap**
(same "chicken and egg" every prior visual-regression ticket in this backlog has hit — triggering a
GitHub Actions `workflow_dispatch` isn't possible from this environment) before CI's real Linux runs
of `app-profile.spec.ts` will pass clean. **Remaining step for whoever merges this:** GitHub →
Actions → `client-ci` → Run workflow → `update-baselines: true` → download the `visual-baselines`
artifact → replace `client/e2e/visual/__screenshots__/profile-*.png` → commit.
