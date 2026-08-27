# PROFILE-8 · E2E functional test — profile journey

**Status:** `DONE` (2026-08-27) · **Type:** Testing · **Depends on:** `PROFILE-6` ·
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

---

## Implementation summary (2026-08-27)

**Built as approved** — the exact 7-step script this ticket's own text specifies, one `test('Profile
journey', ...)` with `test.step` blocks, matching every other `*-journey.spec.ts` in this suite
(`home-feed-journey.spec.ts`, `friends-journey.spec.ts`): 1) load — header/bio + default Posts tab
with both own posts. 2) `SportSwitcher` — Pickleball has no own posts (empty state), Badminton
restores them. 3) post from the composer — new article first, tagged with the active sport. 4)
comment modal — opens empty on the new post, adding a comment shows it and bumps the count. 5)
Settings tab — edits `skillLevel` **and** the `SportAttributesFields` "Racket brand" attribute
(Badminton's only schema field), saves, both persist. 6) Edit Profile modal — changes the bio, saves,
modal closes and `ProfileHeader` reflects it. 7) Memories tab — `ComingSoonPage` placeholder.

**Two real MSW mutation gaps found and fixed at pickup**, same class of finding `PROFILE-7` made for
the GET side — neither existed before this ticket, since `PROFILE-7`'s visual-regression baselines
never exercised a save, only a clean load:
1. **`PUT /api/sports/profiles/:profileId`** (`e2e/mocks/handlers/sport.ts`) — didn't exist. Added,
   stateful (patches `sportSessions`' `userSportProfilesState`). `attributes` merges into the
   existing map rather than replacing it wholesale — mirrors the real
   `UserSportProfileServiceImpl.updateProfile`'s "an omitted key keeps its stored value" behavior,
   which `buildSportProfileUpdatePayload`'s own doc comment (client code) already documents as
   load-bearing for this exact reason.
2. **`PUT /api/users/:userId/profile`** (`e2e/mocks/handlers/friends.ts`) — didn't exist either.
   `PROFILE-7`'s own `GET /api/users/:userId` own-id branch read a fixed `mockMyProfile` constant;
   this ticket made it session-scoped (`FriendsSession.myProfileState`, seeded from `mockMyProfile`)
   and added the `PUT`, so a save actually changes what the next `GET` returns — same "small
   stateful fake backend" pattern every other mutable fixture in this suite already uses (`feed.ts`'s
   `postsState`, `sport.ts`'s `userSportProfilesState`, etc.).

**Two real locator bugs found and fixed during Phase 5 (not left as `.first()` workarounds without
understanding why)**: `getByText('Jordan Lee')` is ambiguous (also matches both own posts' author
name) — scoped with `.first()`, since the header renders first in DOM order. `getByRole('button', {
name: 'Post' })` without `exact: true` also matches "Post options" (each post's own menu trigger,
whose accessible name contains "Post") and the trending card's "#fridayrun 12 posts" button — same
class of gap `app-create-session-modal.spec.ts`'s own `{ name: 'Create your session' }` dialog-name
scoping and `friends-journey.spec.ts`'s `{ name: 'Accept', exact: true }` fix already document
elsewhere in this suite; fixed with `exact: true`.

**Verification:** `tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings in
`SessionStartTimePicker.tsx`), full Vitest suite green (153 files, 1029 tests, no regressions),
`build-storybook` green, `--project=e2e profile-journey.spec.ts` stable (`--repeat-each=3`, 3/3), full
`--project=e2e` run 73/74 (the one failure, `auth-journey.spec.ts`'s deep-link step, is a `page.goto`
timeout unrelated to this ticket's changes — reproduced as a pass in isolation on immediate re-run,
same class of environment flake this suite already documents elsewhere). No Claude-in-Chrome browser
extension connected this session (same recurring gap `PROFILE-0`/`PROFILE-1`/`PROFILE-5`/`PROFILE-6`
all noted) — the Playwright journey itself is real, headed Chromium automation locally
(`playwright.config.ts`'s `headless: !!process.env.CI`), so this is the browser evidence for this
ticket, not a substitute for it. `client/docs/E2E_OVERVIEW.md` updated (§3 directory listing, §5's
fixtures reference — `mockMyProfile`/`mockSportProfiles` notes — and a new §6 entry).
