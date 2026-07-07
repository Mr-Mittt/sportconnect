# Client — Feature Backlog (SportHub rebuild)

**Version:** MVP v1  
**Module:** `client` (new SportHub app — the existing CRA app in this folder is being dropped and rebuilt, see `client/CLAUDE.md`)  
**Last updated:** 2026-07-06

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon client mvp` to resume

Full ticket specs live in the two epic docs in this folder — this backlog is the single ordered
queue across both, plus corrections found when the backlog was created (see "Reality check" below):

- `sporthub-home-feed-tickets.md` — HF epic (Home Feed screen)
- `sporthub-auth-feed-integration-tickets.md` — AUTH/FEED epic (real backend integration)

---

## Reality check at backlog creation (2026-07-06) — corrections to the epic docs

Verified against the actual backend source, not the docs:

1. **`SportController` now exists.** Both epic docs say the sport module "has no REST layer" and
   that the sport switcher "stays mock until a backend ticket adds the controller." That backend
   ticket happened — `modules/sport/sport-impl` shipped `SportController` (its backlog tickets
   A1–A4 are all `DONE`), including `GET /api/sports` and `GET /api/sports/profiles/user/{userId}`.
   The sport switcher **can** be de-mocked → new ticket **SPORT-1** below, not present in either epic.
2. **BE-1 (refresh token via httpOnly cookie) has NOT shipped.** `POST /api/auth/refresh` still
   takes `{ refreshToken }` in the body and returns it in the body (verified in `AuthController.java`).
   Now tracked as **A2** in `modules/auth/docs/BACKLOG_MVP.md`. Blocks AUTH-3 and AUTH-5.
3. **BE-2 (logout authorization) has NOT shipped.** `POST /api/auth/logout` is still
   `logout(@RequestParam UUID userId)` with no principal check. Now tracked as **A3** in
   `modules/auth/docs/BACKLOG_MVP.md`. Should land before AUTH-4 reaches production.
4. **Only matches/tournaments remain genuinely mock-only.** No backend module exists — HF-4 stays
   on `mockData.ts` through this entire MVP.
5. **Post-impl's old F1 ticket** ("Frontend — personalized feed", noted in
   `modules/social/post-impl/docs/BACKLOG_MVP.md` as moved here) is absorbed by **FEED-1** —
   it is not a separate ticket.

The AUTH/FEED epic is marked *"draft, for discussion once the Home Feed epic is finished"* — re-read
its "Backend reality check" section and re-verify BE-1/BE-2 status before starting Phase 5.

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| **Phase 0 — Foundations** | | | |
| 1 | HF-00 | Project scaffolding + tooling (Vite, TS, Tailwind, Storybook, Playwright) | `DONE` |
| 2 | HF-0 | Shared types + mock data layer | `DONE` |
| 3 | HF-10a | Visual-regression harness (baseline screenshots from reference HTML) | `DONE` |
| **Phase 1 — Core components (parallelizable after HF-0)** | | | |
| 4 | HF-1 | TopBar + NavTabs | `DONE` |
| 5 | HF-2 | SportSwitcher | `DONE` |
| 6 | HF-3 | PostCard + Feed | `DONE` |
| 7 | HF-4 | UpcomingMatches | `DONE` |
| 8 | HF-5 | TrendingHashtags | `DONE` |
| 9 | HF-6 | GroupBroadcasts | `DONE` |
| **Phase 2 — Page integration** | | | |
| 10 | HF-7 | HomeFeedPage — layout, state wiring, data hook | `DONE` |
| **Phase 3 — Hardening** | | | |
| 11 | HF-8 | Responsive + accessibility pass | `DONE` |
| 12 | HF-10b | Full-page visual regression + CI gate | `DONE` |
| 13 | HF-11 | E2E functional test — Home Feed journey | `DONE` |
| **Phase 4 — Home Feed release readiness** | | | |
| 14 | HF-9 | QA / acceptance checklist (Home Feed) | `DONE` |
| 14b | HF-12 | CI bootstrap + first green run (follow-up from HF-9 item 7) | `DONE` |
| **Phase 5 — Auth integration (epic is draft — review first; BE-1 blocks AUTH-3/AUTH-5)** | | | |
| 15 | MSW-0 | Mock Service Worker handler setup | `TODO` |
| 16 | AUTH-0 | Types, API client, auth store | `TODO` |
| 17 | AUTH-1 | Login | `TODO` |
| 18 | AUTH-2 | Register | `TODO` |
| 19 | AUTH-3 | Session bootstrap on app load | `TODO` |
| 20 | AUTH-4 | ProtectedRoute + logout | `TODO` |
| 21 | AUTH-5 | 401 refresh-retry interceptor | `TODO` |
| 22 | AUTH-6 | Auth hardening (errors, rate-limit messaging, a11y) | `TODO` |
| 23 | AUTH-8 | E2E functional test — auth journey | `TODO` |
| 24 | AUTH-7 | QA / acceptance checklist (auth) | `TODO` |
| **Phase 6 — Feed/groups/sport integration (de-mocks HF-2/3/5/6)** | | | |
| 25 | FEED-0 | Types + TanStack Query hooks scaffold | `TODO` |
| 26 | FEED-1 | Feed + PostCard (real — absorbs post-impl's old F1) | `TODO` |
| 27 | FEED-2 | CommentSection (real) | `TODO` |
| 28 | FEED-3 | CreatePostForm (real) | `TODO` |
| 29 | FEED-4 | Group switching (real groups list) | `TODO` |
| 30 | FEED-5 | CreateGroupModal + JoinGroupModal (real) | `TODO` |
| 31 | FEED-6 | TrendingHashtags (real) — de-mocks HF-5 | `TODO` |
| 32 | FEED-7 | GroupBroadcasts (real) — de-mocks HF-6 | `TODO` |
| 33 | SPORT-1 | Sport switcher (real) — de-mocks HF-2, **new ticket, not in the epics** | `TODO` |
| 34 | FEED-8 | Integration hardening (loading/error/empty states, pagination edges) | `TODO` |
| 35 | FEED-10 | E2E functional test — feed/groups journey | `TODO` |
| 36 | FEED-9 | QA / acceptance checklist (integration) | `TODO` |

**Dependencies:**
```
HF-00 → everything
HF-0, HF-10a → HF-1..HF-6 (components need types; parallel with each other)
HF-1..HF-6 → HF-7 → HF-8, HF-10b, HF-11 → HF-9
Phase 5 is independent of Phases 1–4 code-wise but the epic says to finish Home Feed first.
MSW-0 ∥ AUTH-0 → AUTH-1..AUTH-6 → AUTH-8 → AUTH-7
AUTH-3, AUTH-5 → blocked on auth backlog A2 (BE-1, httpOnly cookie) — do not build against
  the body-based contract as a "temporary" version (client/CLAUDE.md forbids it)
AUTH-4 in production → blocked on auth backlog A3 (BE-2, logout authorization)
Phase 5 → all of Phase 6
FEED-0 → FEED-1..FEED-7, SPORT-1 → FEED-8 → FEED-10 → FEED-9
HF-4 (matches) is NOT de-mocked in this MVP — no backend module exists.
```

**Backend blockers (tracked outside this backlog):**

| Blocker | Where tracked | Blocks |
|---|---|---|
| BE-1: refresh token → httpOnly cookie | `modules/auth/docs/BACKLOG_MVP.md` · A2 | AUTH-3, AUTH-5 |
| BE-2: logout derives user from principal | `modules/auth/docs/BACKLOG_MVP.md` · A3 | AUTH-4 (production) |
| Matches/tournaments module | Nowhere yet — needs its own design pass | de-mocking HF-4 |

---

## Tickets

Phases 0–4: full specs in `sporthub-home-feed-tickets.md`. Phases 5–6: full specs in
`sporthub-auth-feed-integration-tickets.md`. Entries below are summaries plus any delta/correction
discovered since the epics were written — the epic doc is the spec, this file is the queue.

### HF-00 · Project scaffolding and tooling setup
**Status:** `DONE` (2026-07-06) · **Type:** Infrastructure · **Spec:** HF epic § HF-00 ·
**Summary:** `client/docs/HF-00_PROJECT_SCAFFOLDING.md`

Vite + React 18 + TS strict, Tailwind theme mapped 1:1 to the mockup's design tokens, React Router
with stub routes, Vitest/RTL, Storybook, Playwright (own config). Pure scaffolding, no feature code.
Decisions: pnpm; re-wired into Gradle (`./gradlew :client:buildClient`); shadcn/ui deferred to HF-1.

**Deltas for later tickets:**
- Tailwind is **v4** — tokens live in the `@theme` block of `src/index.css`, not `tailwind.config.ts`
  as the epic text says. Token utility classes double the prefix: `text-text-primary`,
  `border-border-strong`, `bg-bg-accent`.
- Default Tailwind `teal`/`purple` scales are cleared — only the approved ramp steps (50/800) compile.
- ESLint is v9 (jsx-a11y doesn't support v10 yet); react-hooks flat preset is `configs.flat.recommended`.

### HF-0 · Shared types and mock data layer
**Status:** `DONE` (2026-07-06) · **Type:** Foundation · **Dependency:** HF-00 · **Spec:** HF epic § HF-0 ·
**Summary:** `client/docs/HF-0_SHARED_TYPES_AND_MOCK_DATA.md`

`src/features/home-feed/types.ts` (`SportKey`, `SportProfile`, `Post`, `UpcomingMatch`,
`TrendingHashtag`, `GroupBroadcast`) + `mockData.ts`. Per the epic's scope update, mock data is a
temporary stand-in for everything except matches — and with SPORT-1 now real (see Reality check),
matches are the only piece whose mock survives this MVP.

**Deltas for later tickets:**
- Mock timestamps are computed from load time (`hoursAgo()`/`hoursFromNow()` in `mockData.ts`),
  not hardcoded — don't assert exact timestamp values in tests, assert relative behavior.
- `mockSportProfiles` has no synthetic `'All'` entry (HF-2's component adds it) and `icon` values
  are bare names (`ball-football`), not `ti-` CSS classes.
- Hashtags include the `#` prefix in both `Post.hashtags` and `TrendingHashtag.tag`.
- `mockData.test.ts` encodes HF-0's coverage acceptance criteria — extend it if you extend the data.

### HF-10a · Visual-regression harness setup
**Status:** `DONE` (2026-07-06) · **Type:** Infrastructure (Testing) · **Dependency:** HF-00 ·
**Spec:** HF epic § HF-10a · **Summary:** `client/docs/HF-10a_VISUAL_REGRESSION_HARNESS.md`

Check `design-reference-home-feed.html` into `design-reference/`, capture committed baseline
screenshots at 375/768/1280px × three states (all / sport-filtered / empty). No app-code dependency.

**Deltas for later tickets:**
- Reference now lives at `client/design-reference/design-reference-home-feed.html` (epic text says
  `client/docs/`). Icon font is vendored under `design-reference/assets/tabler/` — the mockup's
  original CDN link was a 404, so the committed baselines render icons the approved mockup didn't.
- Baselines: `e2e/visual/__screenshots__/home-feed-<state>-<width>.png`. **HF-10b must reuse these
  exact snapshot names** (the `visual-regression` project's `snapshotPathTemplate` makes names
  test-agnostic) to diff the real page against them.
- Baselines were rendered on Windows — regenerate once on Linux when CI is introduced (no CI exists
  repo-wide yet; the required-check gate is HF-10b's deliverable).

### HF-1 · TopBar + NavTabs
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-1 ·
**Summary:** `client/docs/HF-1_TOPBAR_NAVTABS.md`

Presentational, controlled; keyboard accessible; `aria-current="page"` on the active tab. These are
cross-page shell components — build in `src/shared/`, not inside the home-feed feature folder
(per `client/CLAUDE.md`).

**Deltas for later tickets:**
- shadcn foundation exists now: `cn()` at `@/shared/lib/utils`, Button/Avatar at `@/shared/ui/`
  (token-styled), `components.json` + `@/` alias configured — use `pnpm dlx shadcn@latest add <x>`
  or hand-write in the same idiom. Icons come from `@tabler/icons-react` only.
- New design-system pieces in `src/index.css`: `border-hairline` utility (the 0.5px rule),
  `max-w-frame` (960px), `text-2xs` (11px), `text-2sm` (13px) — use these, not arbitrary values.
- An `AppShell` layout route already renders TopBar + NavTabs around every page — HF-7 must NOT
  re-add them on the page; it only assembles the home-feed content area.
- RTL `cleanup()` runs from `src/test/setup.ts` (Vitest has no globals here — don't remove it).

### HF-2 · SportSwitcher
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-2 ·
**Summary:** `client/docs/HF-2_SPORTSWITCHER.md`

Controlled pill row ("All" + up to `maxSports=3` sports + dashed "Add sport"). Also a shared
component (`src/shared/`). The 3-sport cap is a real backend rule — `createProfile` rejects a 4th
active profile — so keep the default at 3. Builds against mock sport profiles; de-mocked by SPORT-1.

**Deltas for later tickets:**
- **Cap behavior changed from the spec (user decision):** "Add sport" is ALWAYS rendered (mockup/
  baseline parity); at the cap it's `aria-disabled` + no-op instead of hidden. Epic's "not rendered
  at max" is superseded.
- Epic open question #2 (wrap vs scroll) resolved: pills **wrap** (`flex-wrap`).
- `SportKey`/`SportProfile` now live in `@/shared/types/sport` (feature `types.ts` re-exports).
- `getSportIcon()` in `@/shared/lib/sportIcons.ts` maps icon names → Tabler components — HF-3's
  sport badge and HF-4's match rows must reuse it, not redefine the mapping.
- `colorRamp` is deliberately unused in the switcher (mockup pills are neutral) — ramps are for
  badges/avatars in HF-3/HF-4/HF-6.

### HF-3 · PostCard + Feed
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-3 ·
**Summary:** `client/docs/HF-3_POSTCARD_FEED.md`

Filterable post list, optimistic like toggle, clickable hashtags, empty state per sport, relative
timestamps via a date lib. Builds against mock data; de-mocked by FEED-1 before ship.

**Deltas for later tickets:**
- **Like state is controlled** (CLAUDE.md wins over the epic's local-optimistic wording): PostCard
  renders from props; the parent hook owns the flip. FEED-1 implements optimism in the mutation.
- **date-fns** is the date lib; use `formatRelativeTime()` from `@/shared/lib/relativeTime` for all
  relative timestamps (HF-6 broadcasts included) — don't format ad hoc.
- **Ramp classes**: use `getRampBadgeClasses()` from `@/shared/lib/rampStyles` — template-string
  classes like `bg-${ramp}-50` generate no CSS (Tailwind static scanning).
- **Hairline borders**: new `border-hairline-t` / `border-hairline-b` utilities; NEVER combine
  `border-hairline` with `border-t/b` (stacks 0.5px all-sides + 1px directional — this bug was also
  fixed retroactively in HF-1's NavTabs).

### HF-4 · UpcomingMatches
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-4 ·
**Summary:** `client/docs/HF-4_UPCOMINGMATCHES.md`

Right-rail block, filters by `activeSport`, "spots left, join" vs "Full, view details" CTAs
(distinguishable without color). **Stays mock for the whole MVP** — no matches backend exists.

**Deltas for later tickets:**
- **Cap resolved (user decision):** at most 4 matches render after filtering; the rest are behind
  "See all". Exposed as `maxVisible?: number` (default 4) beyond the spec's prop list.
- `formatStartTime()` in `@/shared/lib/startTime.ts` formats *future* timestamps ("Today/Tomorrow,
  7:00 PM" → weekday < 7 days → date). The future Matches screen must reuse it, not re-format;
  `formatRelativeTime` remains past-only.
- CTA buttons carry `aria-label` = `"{title} — {ctaText}"` — keep this pattern when the Matches
  page renders similar cards.

### HF-5 · TrendingHashtags
**Status:** `DONE` (2026-07-07) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-5 ·
**Summary:** `client/docs/HF-5_TRENDINGHASHTAGS.md`

Tag + post-count rows, caller-provided order. Real endpoint already exists
(`GET /api/hashtags/trending`); de-mocked by FEED-6.

**Deltas for later tickets:**
- **Epic open question #1 resolved (user decision): trending stays global** — no `activeSport`
  prop. If FEED-6's real endpoint introduces sport-aware trending, that's a FEED-6 design point,
  not a regression here.
- Empty state exists: header + muted "Nothing trending right now." — FEED-6 should map an empty
  200 response to this, not hide the card.
- Rows report tags **with the `#` prefix** (`onHashtagClick('#tournament')`), same as PostCard's
  hashtag callback — HF-7 can share one handler for both.

### HF-6 · GroupBroadcasts
**Status:** `DONE` (2026-07-07) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-6 ·
**Summary:** `client/docs/HF-6_GROUPBROADCASTS.md`

Group avatar + name + line-clamped message rows. Real endpoint already exists
(`GET /api/posts/broadcast` — broadcasts are `Post` rows with `postType=GROUP_BROADCAST`);
de-mocked by FEED-7.

**Deltas for later tickets:**
- **Rows are clickable buttons (user decision, spec wins over mockup's static divs)** —
  `onBroadcastClick(broadcastId)`; HF-7 must wire a handler even if it's a no-op for now.
- **Epic open question #1 resolved for broadcasts too: global**, no `activeSport` prop (matches
  the HF-5 resolution).
- Empty state exists: header + muted "No broadcasts from your groups." — FEED-7 maps an empty
  response here, doesn't hide the card.
- **CSS trap (joins HF-3's list): never combine `line-clamp-*` with `block`** — `display: block`
  overrides line-clamp's `-webkit-box` and silently disables clamping, regardless of class order.

### HF-7 · HomeFeedPage — layout, state wiring, data hook
**Status:** `DONE` (2026-07-07) · **Type:** Integration · **Dependency:** HF-1..HF-6 · **Spec:** HF epic § HF-7 ·
**Summary:** `client/docs/HF-7_HOMEFEEDPAGE.md`

Two-column layout, `useHomeFeedData()` hook boundary, `activeSport` state shared by SportSwitcher /
Feed / UpcomingMatches in one render pass. Per `client/CLAUDE.md`, move `activeSport` from page-local
state into the Zustand store as soon as a second page needs it.

**Deltas for later tickets:**
- **Hook shape supersedes the epic's flat sketch:** `useHomeFeedData()` returns
  `{ data: {…5 datasets}, isLoading, isError, toggleLike }` (CLAUDE.md convention). FEED-0/1/6/7
  and SPORT-1 swap internals behind this exact seam; the page must not change.
- **Rail-stacking breakpoint = md (768px)** — chosen as the starting point (spec left it open);
  HF-8 owns confirming/adjusting it.
- `isLoading`/`isError` are hardcoded false and unrendered — skeleton/error UI is FEED-8, not a
  gap in HF-7.
- Page-level tests must scope rail assertions via `within(getByRole('region', { name }))` —
  `#fridayrun` exists in both a post and the trending card.
- `App.test.tsx`'s "/" route test now asserts the assembled page (the placeholder-heading premise
  died with the placeholder).

### HF-8 · Responsive and accessibility pass
**Status:** `DONE` (2026-07-07) · **Type:** Hardening · **Dependency:** HF-7 · **Spec:** HF epic § HF-8 ·
**Summary:** `client/docs/HF-8_RESPONSIVE_A11Y_PASS.md`

375/768/1280px, pill wrapping, WCAG AA contrast on all sport-ramp combinations, full keyboard nav,
axe scan with no critical/serious violations.

**Deltas for later tickets:**
- **`--color-text-muted` is now #6e6d66** (was the mockup's #888780 — 3.4:1, failed AA). The
  reference HTML was updated to match and **all 9 HF-10a baselines were regenerated** — HF-10b
  diffs against the regenerated set; don't "restore" the old value from an outdated mockup copy.
- **A11y gate is a committed spec** (`e2e/flows/a11y.spec.ts`, runs in the `e2e` project):
  overflow + axe critical/serious at 3 breakpoints. New pages should extend it, not fork it.
- NavTabs scrolls horizontally within itself below ~424px (`overflow-x-auto` + `shrink-0` tabs).
- HomeFeedPage has an `sr-only` h1 "Home Feed" — this is what `smoke.spec.ts`'s heading assertion
  matches (HF-7's placeholder removal had silently broken it; e2e hadn't been run since).
- e2e specs: `page.evaluate` takes a string (no DOM lib in the e2e tsconfig); import the named
  `AxeBuilder`, not the default.

### HF-10b · Full-page visual regression + CI gate
**Status:** `DONE` (2026-07-07) · **Type:** Hardening (Testing) · **Dependency:** HF-7, HF-10a · **Spec:** HF epic § HF-10b ·
**Summary:** `client/docs/HF-10B_VISUAL_REGRESSION_CI_GATE.md`

Diff the real built page against HF-10a's baselines (3 breakpoints × 3 states), required CI check,
token audit for hardcoded hex/px values.

**Deltas for later tickets:**
- **Baselines now capture the REAL page, not the mockup** (user decision; supersedes HF-10a's
  "diff against the mockup baselines"). Mockup fidelity was certified by a one-time human parity
  review; the ongoing gate is self-regression at a tight threshold. Same 9 snapshot names;
  `reference-home-feed.spec.ts` is retired.
- **`?visual-state=empty`** on `/` empties posts+matches via the hook's mock internals (the empty
  state is otherwise unreachable). **FEED-1 must replace this seam with MSW handlers** and keep
  the visual spec's empty state working.
- The visual spec freezes the clock (`page.clock.setFixedTime` BEFORE `goto`) — any future
  timestamp-rendering component must stay deterministic under it.
- **CI exists now** (`client-ci` workflow). Two manual bootstrap steps pending on GitHub: run the
  `update-baselines` dispatch and commit the Linux artifact; mark `client-ci / test` required.
  Until then local baselines are Windows-rendered.
- PR template added (`.github/PULL_REQUEST_TEMPLATE.md`) with the spec-required
  "compared against `design-reference-*.html`" checklist line.

### HF-11 · E2E functional test — Home Feed journey
**Status:** `DONE` (2026-07-07) · **Type:** Testing · **Dependency:** HF-7 · **Spec:** HF epic § HF-11 ·
**Summary:** `client/docs/HF-11_E2E_HOME_FEED_JOURNEY.md`

7-step Playwright journey in the `e2e` project. No MSW needed while everything is mock-driven;
document on the ticket which steps need MSW handlers once Phases 5–6 make hooks hit the network.

**Deltas for later tickets:**
- **Premise corrections (user-approved):** steps 5/6 assert reachability + "click doesn't
  navigate/break" because hashtag/CTA callbacks are deliberate no-ops until FEED-6/FEED-1;
  step 7 asserts the at-cap `aria-disabled` state (mock user has 3 sports — the epic's
  under-cap premise needs SPORT-1's fixtures).
- **MSW upgrade map for this spec** (also in the spec header): step 1 → feed/trending/
  broadcasts/sport-profile handlers (FEED-1/6/7, SPORT-1); step 4 → like mutation (FEED-1);
  step 5 → real hashtag destination (FEED-6); step 7 → under-cap fixture (SPORT-1 + MSW-0).
  These tickets must update `home-feed-journey.spec.ts`, not just their own tests.

### HF-9 · QA / acceptance checklist (Home Feed)
**Status:** `DONE` (2026-07-07) · **Type:** QA · **Dependency:** HF-8, HF-10b, HF-11 · **Spec:** HF epic § HF-9 ·
**Summary:** `client/docs/HF-9_QA_ACCEPTANCE_CHECKLIST.md`

6/7 items pass with evidence; item 7 (E2E green **in CI**) is conditional — CI has never
executed. **The Home Feed epic (HF-00..HF-9) is closed**; the unverified CI run is the epic's
release condition, tracked as HF-12.

### HF-12 · CI bootstrap + first green run — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-08) · **Type:** Infrastructure (ops) · **Dependency:** HF-10b, HF-9 ·
**Summary:** `client/docs/HF-12_CI_BOOTSTRAP.md`

Executed: work pushed, first `client-ci` runs surfaced and fixed a real bug (root `.gitignore`'s
`**/lib` had swallowed `client/src/shared/lib` — CI-only TS2307s), `update-baselines` dispatch →
Linux baselines committed via PR #2 → **fully green run, merged**. HF-9's item 7 is resolved.

**Deltas:**
- **Branch protection is NOT available** (GitHub Free + private repo) — `client-ci` runs on every
  PR/push and reports red/green, but nothing physically blocks merging on red. Hard enforcement
  requires making the repo public or upgrading the plan. Until then: a red check is
  merge-blocking by convention.
- Baselines are now **Linux-rendered**: local Windows `pnpm test:visual` will show diffs — CI is
  the authoritative visual environment (working model in HF-10b's summary).
- Root `.gitignore` has a scoped negation keeping `client/src/shared/lib` tracked — don't
  "clean up" the `!client/src/shared/lib` lines.

### MSW-0 · Mock Service Worker handler setup
**Status:** `TODO` · **Type:** Infrastructure (Testing) · **Dependency:** HF-00 · **Spec:** AUTH/FEED epic § MSW-0

Browser-mode MSW wired into a Playwright fixture; handlers for auth/feed/groups typed against the
same `types.ts` as the real hooks; zero real network calls verified via Playwright's network log.
**Delta:** also add sport handlers (`GET /api/sports`, `GET /api/sports/profiles/user/{userId}`)
for SPORT-1, which didn't exist when the epic was written.

### AUTH-0 · Types, API client, auth store
**Status:** `TODO` · **Type:** Foundation · **Dependency:** HF-00 · **Spec:** AUTH/FEED epic § AUTH-0

Types 1:1 with real DTOs, `apiClient` with `withCredentials: true` + Bearer interceptor, Zustand
auth slice. Access token in memory only — a test asserts no storage API is touched.

### AUTH-1 · Login
**Status:** `TODO` · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-1

### AUTH-2 · Register
**Status:** `TODO` · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-2

Register auto-logs-in (same `AuthResult` shape as login) — no artificial "now go log in" step.

### AUTH-3 · Session bootstrap on app load
**Status:** `TODO` · **Type:** Feature · **Dependency:** AUTH-0, **auth backlog A2 (BE-1)** · **Spec:** AUTH/FEED epic § AUTH-3

Refresh-on-load restores the session from the httpOnly cookie; the refresh response's `user` object
doubles as "who am I" (no `/api/users/me` exists). **Hard-blocked on BE-1** — verified still
unshipped 2026-07-06; do not build against the body-based contract.

### AUTH-4 · ProtectedRoute + logout
**Status:** `TODO` · **Type:** Feature · **Dependency:** AUTH-3 · **Spec:** AUTH/FEED epic § AUTH-4

Wait for bootstrap before redirecting; logout clears the session even if the network call fails;
redirect-back after login. Current logout contract is `POST /api/auth/logout?userId=` (query param,
no body) — **re-check before implementing**, because auth backlog A3 (BE-2) changes it to
principal-derived with no param.

### AUTH-5 · 401 refresh-retry interceptor
**Status:** `TODO` · **Type:** Feature · **Dependency:** AUTH-0, **auth backlog A2 (BE-1)** · **Spec:** AUTH/FEED epic § AUTH-5

One silent refresh + one retry on 401; refresh failure → clean logout, never a retry loop.

### AUTH-6 · Auth hardening
**Status:** `TODO` · **Type:** Hardening · **Dependency:** AUTH-1, AUTH-2 · **Spec:** AUTH/FEED epic § AUTH-6

Rate-limit error surfacing (confirm the actual error shape first — unverified), a11y, show/hide
password toggle.

### AUTH-8 · E2E functional test — auth journey
**Status:** `TODO` · **Type:** Testing · **Dependency:** MSW-0, AUTH-1..AUTH-5 · **Spec:** AUTH/FEED epic § AUTH-8

### AUTH-7 · QA / acceptance checklist (auth)
**Status:** `TODO` · **Type:** QA · **Dependency:** AUTH-6, AUTH-8 · **Spec:** AUTH/FEED epic § AUTH-7

Includes a manual pass against the *real* backend (MSW doesn't substitute) and a BE-1/BE-2
status check.

### FEED-0 · Types + data hooks scaffold
**Status:** `TODO` · **Type:** Foundation · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § FEED-0

TanStack Query hooks (`usePersonalFeed`, `useGroupFeed`, `useTrendingHashtags`,
`useActiveBroadcasts`, `useUserGroups`, mutations) with `useInfiniteQuery` paging off Spring's
`Page` shape.

### FEED-1 · Feed + PostCard (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-0, HF-3 · **Spec:** AUTH/FEED epic § FEED-1

De-mocks HF-3 against `GET /api/posts/feed`; optimistic like with rollback; delete own posts.
Absorbs post-impl's old F1 ticket ("Frontend — personalized feed").

### FEED-2 · CommentSection (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-1 · **Spec:** AUTH/FEED epic § FEED-2

### FEED-3 · CreatePostForm (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-0 · **Spec:** AUTH/FEED epic § FEED-3

Maps to `CreatePostRequest`; 5000-char limit enforced client-side; broadcast creation belongs to
FEED-7, not this composer.

### FEED-4 · Group switching (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-0 · **Spec:** AUTH/FEED epic § FEED-4

`useUserGroups(currentUser.id)`; selected space is UI state in Zustand, not in TanStack Query.

### FEED-5 · CreateGroupModal + JoinGroupModal (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-4 · **Spec:** AUTH/FEED epic § FEED-5

### FEED-6 · TrendingHashtags (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-0, HF-5 · **Spec:** AUTH/FEED epic § FEED-6

Pure data-source swap behind HF-5's component; hashtag click routes to `usePostsByHashtag(tag)`.

### FEED-7 · GroupBroadcasts (real)
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-0, HF-6 · **Spec:** AUTH/FEED epic § FEED-7

De-mocks HF-6 via `useActiveBroadcasts()`; adds owner/admin-only "create broadcast" action
(`postType: GROUP_BROADCAST`, server defaults expiry to +24h).

### SPORT-1 · Sport switcher (real) — new ticket, not in either epic
**Status:** `TODO` · **Type:** Integration · **Dependency:** FEED-0 (hook conventions), HF-2, AUTH phase

De-mocks HF-2 now that `SportController` exists (shipped after the epics were written — see
Reality check). Full spec lives here since no epic covers it:

**Endpoints (verified in `modules/sport/sport-impl`):**
- `GET /api/sports/profiles/user/{userId}` — the caller's sport profiles (public GET)
- `GET /api/sports` — active sport catalog (public), for icon/name lookup and the future add-sport flow

**Deliverables:**
- `useSportProfiles()` hook (TanStack Query) replacing the mock sport-profile array behind the
  same `{ data, isLoading, isError }` shape — components untouched, per the data-layer convention.
- Mapping layer `UserSportProfileResponse` → `SportProfile { key, label, icon, colorRamp }`:
  `colorRamp` and icon come from a **static client-side config object** keyed by sport (this exact
  approach was already decided in sport-impl's A3 ticket for sport attributes — reuse it, don't
  invent a backend-driven mapping). Follow `client/CLAUDE.md`'s ramp assignment rules
  (football→teal, basketball→coral, tennis→purple; next: pink, then gray; never blue/green/amber/red).
- MSW handlers for both endpoints (added under MSW-0's structure).
- "Add sport" stays a callback-only entry point in this MVP (the add-sport flow is its own future
  screen), but note `POST /api/sports/profiles` already exists for when that screen is scoped.

**Acceptance criteria:**
- SportSwitcher renders the real profiles for the logged-in user; a user with 3 profiles sees no
  "Add sport" pill (backend enforces the same cap of 3 active profiles).
- A user with zero sport profiles doesn't break the page — "All" plus "Add sport" renders, feed
  filter still works.
- Sport keys used for feed filtering stay consistent with the `sportId`/`sportName` the posts API
  returns, so HF-3's filter keeps working after both are de-mocked.

### FEED-8 · Integration hardening
**Status:** `TODO` · **Type:** Hardening · **Dependency:** FEED-1..FEED-7, SPORT-1 · **Spec:** AUTH/FEED epic § FEED-8

Skeletons while loading, retry affordance on error (failed fetch ≠ empty feed), empty states match
the mock versions'.

### FEED-10 · E2E functional test — feed/groups journey
**Status:** `TODO` · **Type:** Testing · **Dependency:** MSW-0, FEED-8 · **Spec:** AUTH/FEED epic § FEED-10

**Delta:** add a step for SPORT-1 — switching to a real sport profile filters the feed, and the
zero-profiles fixture renders without error.

### FEED-9 · QA / acceptance checklist (integration)
**Status:** `TODO` · **Type:** QA · **Dependency:** FEED-10 · **Spec:** AUTH/FEED epic § FEED-9

**Delta:** add a checklist line — HF-2's mock swapped for SPORT-1's real hook with no visible UI
regression (same bar as HF-3/HF-5/HF-6).

---

## Removed / Deferred

| Item | Decision |
|---|---|
| De-mock HF-4 (UpcomingMatches) | Deferred — no matches/tournaments backend module exists; needs its own backend design pass first. HF-4 ships mock-backed in this MVP. |
| Forgot/reset password screens | Deferred — `POST /api/auth/forgot-password` is a non-functional server-side placeholder; building UI against it now would do nothing. |
| OAuth2 social login (Google/Facebook) | Deferred — scaffolded server-side but unverified; own ticket if prioritized. |
| Group invitations / pinned posts / ownership transfer UI | Deferred — real endpoints exist but belong to a future Groups-page epic, not Home Feed MVP. |
| Add-sport flow screen | Deferred — only the entry-point callback is wired (HF-2/SPORT-1); `POST /api/sports/profiles` is ready when this gets scoped. |
