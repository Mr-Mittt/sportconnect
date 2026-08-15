# SPORT-4 · Use the real per-sport `iconUrl` instead of the Tabler stand-in

**Status:** `DONE` (client-side; one production-only gap tracked separately, see below) ·
**Type:** Enhancement (visual accuracy) · **Filed:** 2026-08-14, raised by the user after noticing
Badminton rendered a tennis-ball Tabler icon instead of its real crossed-rackets+shuttlecock art.

## Problem

`GET /api/sports` already returned a real, correct, sport-specific `iconUrl` per sport
(`SportResponse.iconUrl`), backed by real PNG assets `sport-impl` serves at `/images/sports/*.png`
with a 1-year `Cache-Control` (`WebConfig.setCachePeriod(31536000)`, already in place — no backend
change needed). The client fetched this field but discarded it: `useSportCatalog.ts`'s
`SportCatalogEntry` mapping kept only `{ id, key, name }`, and every sport badge instead rendered a
hand-picked Tabler icon name from `sportProfileConfig.ts`'s static `SPORT_PROFILE_CONFIG` (e.g.
Badminton → `IconBallTennis`, chosen by SPORT-3 as the closest available stand-in since Tabler has
no dedicated badminton/pickleball icon).

## Decisions (confirmed with the user before implementation)

1. **Full replacement, not selective**: real PNGs replace the Tabler stand-in at every real
   per-sport badge site (not a mix of Tabler-in-some-spots).
2. **Retire the stand-ins**: Badminton's `ball-tennis` and Pickleball's `tournament` entries are
   removed from `sportProfileConfig.ts` now that real icons exist for both, rather than left as
   dead mappings.
3. **Caching: HTTP cache headers only**, not an explicit client-side blob/IndexedDB cache — the
   backend's existing 1-year `Cache-Control` already gives "load once, reused by the browser for
   the rest of the session and future visits" for free. No backend change was needed; this was
   already in place before the ticket started.

## What was built

### Types & data layer
- `SportCatalogEntry` (`shared/types/sport.ts`) gained `iconUrl: string | null`, threaded through
  in `useSportCatalog.ts`'s mapping (previously dropped).
- `SportProfile.icon: string` → `SportProfile.iconUrl: string | null`.
- New `sportIconUrlForId(sportId)` in `features/feed/sportIdMap.ts`, mirroring the existing
  `sportKeyForId` — resolves a sport's real icon via `sportCatalogStore` by id.
- `useSportProfilesForUser.ts` (the one place `SportProfile` objects are constructed) merges in
  `iconUrl: sportIconUrlForId(profile.sportId)` alongside the existing `getSportProfileConfig`
  spread — `iconUrl` is resolved independently of the static label/colorRamp config, so it's
  populated even for a sport that falls through to `getSportProfileConfig`'s generic fallback.
- `sportProfileConfig.ts`: dropped the `icon` field entirely from `SPORT_PROFILE_CONFIG` and its
  fallback; removed the Badminton/Pickleball stand-in entries.

### New component: `SportIcon`
`shared/components/SportIcon.tsx` (+ `.stories.tsx`, `.test.tsx`) — renders
`<img src={iconUrl} alt="" aria-hidden />` when present, else a generic `IconQuestionMark` fallback
(same "unknown sport, don't crash" precedent the old `getSportIcon` had). Decorative in every case:
every call site already renders the sport name as visible text alongside the icon.

### Call sites
Replaced `createElement(getSportIcon(sport.icon), {...})` with `<SportIcon iconUrl={...} />` (or,
where a component-reference prop was needed, a pre-rendered `ReactNode`) at all 8 real per-sport
badge sites: `PostCard`, `CommentSection`, `SessionDetailModal`, `GroupCoverBanner`,
`SessionListCard`, `UpcomingMatches`, `SportSwitcher`'s `Pill`, `JoinGroupModal`'s
`SportFilterPill`/`ResultSection`. `sportIcons.ts` (the old name-based Tabler lookup table) was
deleted entirely.

**Deliberate exclusion:** `CreatePostForm.tsx`'s "Tag sport" toolbar button
(`getSportIcon('ball-football')`) is a generic decorative glyph — same visual role as the Location
pin next to it — not bound to any specific `SportProfile`. It now imports `IconBallFootball`
directly instead of going through the retired lookup helper, but stays a plain Tabler icon. This is
**not** one of the "8 real per-sport badge sites" even though the ticket's own text listed
`CreatePostForm` among `getSportIcon()`'s call sites — flagged inline with a code comment so it
isn't mistaken for a miss later.

### Discovered during verification: client/backend origin mismatch (not in the original plan)

The first visual-regression run after the swap showed **broken images**, not just a cosmetic diff —
`Sport.iconUrl` is a server-relative path (`/images/sports/badminton.png`), and `vite.config.ts`'s
dev proxy only forwarded `/api` (and `/api/chat`) to the backend, not `/images`. A raw
`<img src={iconUrl}>` therefore 404'd against the Vite dev server's own origin. The same problem
exists in production for a different reason: `infra/documentation/INFRA-3_HOSTING_DECISION.md`
plans the client on S3/CloudFront and the backend on a separate EC2 instance — genuinely different
origins, and that infra piece (INFRA-5) hasn't shipped yet either.

Presented to the user as a decision point (fix dev now + file an infra follow-up for production, vs.
build an absolute-URL env var now and guess a production value ahead of INFRA-5). **User chose the
former.** Fixed:
- `vite.config.ts`: added a `/images` proxy entry, same target resolution as `/api`.
- `e2e/mocks/mockServer.ts`: added static-file serving for `/images/**` (the MSW handlers are
  JSON-only and can't serve binary assets) — copied the real `badminton.png`/`pickleball.png` from
  `sport-impl`'s resources into `e2e/mocks/assets/images/sports/` so e2e/visual-regression renders
  the actual real icon art, not a broken image or a placeholder.
- Filed a delta on **INFRA-5** (`infra/documentation/BACKLOG_MVP.md`) for the production gap —
  extends that ticket's existing "confirm `/api` calls target the real production server URL" item
  rather than forking a duplicate ticket, since it's the same origin-resolution problem for a
  second endpoint category.

### Tests
- New `SportIcon.test.tsx`/`.stories.tsx`.
- ~20 existing test/story fixture files constructed `SportProfile` object literals with
  `icon: 'ball-football'` etc. — mechanical rename to `iconUrl: '/images/sports/football.png'`
  (TypeScript strict mode flagged every one).
- Two tests needed real fixes, not just a rename, because their assertions depended on the old
  behavior:
  - `useSportProfiles.test.tsx`: expected `iconUrl: null` for the generic-fallback case — wrong now,
    since `iconUrl` resolves from the live catalog independently of whether the static label/ramp
    config has a bespoke entry. Fixed to expect the seeded catalog's real `iconUrl`.
  - `GroupCoverBanner.test.tsx`: "renders no image element when coverUrl is null" — no longer true,
    since the sport icon is now its own real `<img>` regardless of the cover photo. Fixed to
    distinguish the cover photo (`.object-cover` class) from the sport icon's `<img>`.
- Full suite: 837 tests passed (123 files), 0 lint errors, clean `tsc -b`, Storybook builds clean.

## Verification

- `tsc -b --noEmit`: clean.
- `pnpm lint`: clean (2 pre-existing unrelated warnings in `SessionStartTimePicker.tsx`).
- `pnpm test`: 837/837 passed.
- `pnpm exec storybook build`: clean, including new `SportIcon` stories.
- `pnpm exec playwright test --project=visual-regression`: 18 of 18 affected specs (the two whose
  captures show a sport badge — `app-home-feed.spec.ts`, `app-post-modal.spec.ts`, both × 3
  states/cases × 3 breakpoints) diff against the committed baselines, as expected — human-verified
  by direct image inspection that the new renders show the correct real icon art (crossed
  rackets+shuttlecock for Badminton, paddle+ball for Pickleball, not swapped) with nothing else
  shifted, both in the Home Feed page and the post-comment modal.

## Remaining step: baseline regeneration

Per this ticket's own scope, baselines are in-scope here (not deferred to a follow-up ticket, per
the HF-13..HF-20 precedent this repo otherwise uses for baseline drift caused by other tickets).
Regenerating them requires the `client-ci` workflow's `update-baselines` manual GitHub Actions
dispatch — this session has no `gh` CLI and no GitHub UI access, so this step could not be executed
here. **Needs to be run once this branch is pushed**: trigger the dispatch, download the
`visual-baselines` artifact, replace `client/e2e/visual/__screenshots__/` with its contents — all
18 affected baselines (`app-home-feed.spec.ts`'s 9, `app-post-modal.spec.ts`'s 9) change; the
other visual-regression specs have no sport badge in frame and are unaffected — then commit. A
human visual check of the new baselines against the real render (already done above, on the
actual/expected images from this session's local run) is worth repeating once more on the
Linux-rendered CI output, same as prior baseline tickets.
