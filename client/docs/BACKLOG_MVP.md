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
2. **BE-1 (refresh token via httpOnly cookie) — SHIPPED 2026-07-08.** `POST /api/auth/refresh` now
   reads the token from an httpOnly `refreshToken` cookie (never the body); login/register/refresh
   set it via `Set-Cookie`. Tracked as **A2** in `modules/auth/docs/BACKLOG_MVP.md`, `DONE`.
   **AUTH-3 and AUTH-5 are unblocked.**
3. **BE-2 (logout authorization) — SHIPPED 2026-07-08.** `POST /api/auth/logout` now derives the
   caller from the `Authorization: Bearer` header — no `userId` param at all, 401 if
   missing/invalid. Tracked as **A3** in `modules/auth/docs/BACKLOG_MVP.md`, `DONE`. See
   AUTH-4's entry below for the exact new contract.
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
| 14c | HF-13 | Regenerate visual-regression baselines (follow-up from AUTH-1's cn() border-hairline fix) | `DONE` |
| 14d | HF-14 | Regenerate visual-regression baselines (follow-up from AUTH-4's TopBar avatar-menu change) | `DONE` |
| 14e | HF-15 | Regenerate visual-regression baselines (follow-up from FEED-1's real feed + delete menu) | `DONE` |
| 14f | HF-16 | Regenerate visual-regression baselines (follow-up from FEED-2's comment button + dialog) | `DONE` |
| **Phase 5 — Auth integration (epic is draft — review first; BE-1/BE-2 shipped 2026-07-08, no longer blocking)** | | | |
| 15 | MSW-0 | Mock Service Worker handler setup | `DONE` |
| 16 | AUTH-0 | Types, API client, auth store | `DONE` |
| 17 | AUTH-1 | Login | `DONE` |
| 18 | AUTH-2 | Register | `DONE` |
| 19 | AUTH-3 | Session bootstrap on app load | `DONE` |
| 20 | AUTH-4 | ProtectedRoute + logout | `DONE` |
| 21 | AUTH-5 | 401 refresh-retry interceptor | `DONE` |
| 22 | AUTH-6 | Auth hardening (errors, rate-limit messaging, a11y) | `DONE` |
| 23 | AUTH-8 | E2E functional test — auth journey | `DONE` |
| 24 | AUTH-7 | QA / acceptance checklist (auth) | `DONE` |
| **Phase 6 — Feed/groups/sport integration (de-mocks HF-2/3/5/6)** | | | |
| 25 | FEED-0 | Types + TanStack Query hooks scaffold | `DONE` |
| 26 | FEED-1 | Feed + PostCard (real — absorbs post-impl's old F1) | `DONE` |
| 27 | FEED-2 | CommentSection (real) | `DONE` |
| 28 | FEED-3 | CreatePostForm (real) | `DONE` |
| 29 | FEED-4 | Group switching (real groups list) | `TODO` |
| 30 | FEED-5 | CreateGroupModal + JoinGroupModal (real) | `TODO` |
| 31 | FEED-6 | TrendingHashtags (real) — de-mocks HF-5 | `TODO` |
| 32 | FEED-7 | GroupBroadcasts (real) — de-mocks HF-6 | `TODO` |
| 33 | SPORT-1 | Sport switcher (real) — de-mocks HF-2, **new ticket, not in the epics** | `TODO` |
| 34 | FEED-8 | Integration hardening (loading/error/empty states, pagination edges) | `TODO` |
| 35 | FEED-10 | E2E functional test — feed/groups journey | `TODO` |
| 36 | FEED-9 | QA / acceptance checklist (integration) | `TODO` |
| 37 | MSW-1 | Standalone mock server for e2e — replaces per-navigation Service Worker setup | `TODO` |
| 38 | FEED-12 | Comment modal fetches its own post + URL-addressable deep link — **new ticket, not in either epic** | `TODO` |
| 39 | FEED-11 | Visual regression harness for the post comment modal — **new ticket, not in either epic** | `TODO` |

**Dependencies:**
```
HF-00 → everything
HF-0, HF-10a → HF-1..HF-6 (components need types; parallel with each other)
HF-1..HF-6 → HF-7 → HF-8, HF-10b, HF-11 → HF-9
Phase 5 is independent of Phases 1–4 code-wise but the epic says to finish Home Feed first.
MSW-0 ∥ AUTH-0 → AUTH-1..AUTH-6 → AUTH-8 → AUTH-7
AUTH-3, AUTH-5, AUTH-4 → previously blocked on auth backlog A2/A3 — BOTH SHIPPED 2026-07-08,
  no longer blocking. Build against the cookie-based /refresh contract and the param-less
  /logout contract (see AUTH-3/AUTH-4/AUTH-5 entries below).
Phase 5 → all of Phase 6
FEED-0 → FEED-1..FEED-7, SPORT-1 → FEED-8 → FEED-10 → FEED-9
FEED-2 → FEED-12 → FEED-11 (FEED-12 decouples the comment modal from the feed's loaded-post cache
  and makes it URL-addressable; FEED-11's visual-regression spec is simpler once it can just
  page.goto() a post URL instead of clicking through the feed — sequence FEED-12 before FEED-11,
  though FEED-11 doesn't hard-block on it if picked up first).
HF-4 (matches) is NOT de-mocked in this MVP — no backend module exists.
```

**Backend blockers (tracked outside this backlog):**

| Blocker | Where tracked | Blocked | Status |
|---|---|---|---|
| BE-1: refresh token → httpOnly cookie | `modules/auth/docs/BACKLOG_MVP.md` · A2 | AUTH-3, AUTH-5 | `DONE` (2026-07-08) |
| BE-2: logout derives user from principal | `modules/auth/docs/BACKLOG_MVP.md` · A3 | AUTH-4 (production) | `DONE` (2026-07-08) |
| BE-3: login/registration rate limiting | `modules/auth/docs/BACKLOG_MVP.md` · A5 | a future client ticket (not yet filed) for rate-limit error surfacing, split out of AUTH-6 on 2026-07-12 | `TODO` |
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

### HF-13 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-09) · **Type:** Infrastructure (Testing) · **Dependency:** AUTH-1's `cn()` fix ·
**Summary:** `client/docs/HF-13_REGENERATE_VISUAL_BASELINES.md`

**Found during AUTH-1:** `cn()` (`src/shared/lib/utils.ts`, built on `tailwind-merge`) silently
dropped the custom `border-hairline`/`-t`/`-r`/`-b` utilities whenever combined with any
`border-{color}` class in the same className — `tailwind-merge` didn't recognize the custom name
and bucketed it into the border-color conflict group, so only the color class survived and
`border-width` fell back to the browser default of `0px`. This broke every `Button` `default`/
`outline` variant's border app-wide (silently, since `default`'s background fill still read as a
button visually) — AUTH-1's borderless OAuth buttons were the first place with nothing to mask it.
Fixed in AUTH-1 by registering these utilities under their real `tailwind-merge` conflict groups
(`border-w`/`border-w-t`/`border-w-r`/`border-w-b`) via `extendTailwindMerge`. See AUTH-1's summary
for the full investigation.

**Why this is its own ticket, not folded into AUTH-1:** the fix is global (`cn()` is shared
infrastructure), so it also changes Home Feed's already-shipped rendering — buttons/pills that
were silently missing their border now show it, shifting layout enough that HF-10b's committed
baselines (`e2e/visual/__screenshots__/`) are stale (confirmed: `pnpm test:visual` diff ratios
jumped from the known ~0.01 Windows/Linux noise floor to up to 0.05, with actual image-dimension
changes on some breakpoints). User decision: keep the fix (it's correct, and leaving it half-fixed
would be worse), regenerate baselines as this separate follow-up rather than blocking AUTH-1 on it.

**To execute:** same process as HF-12 — trigger the `client-ci` workflow's `update-baselines`
manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. A human visual check of the new
baselines against `design-reference-home-feed.html` is worth doing at the same time, to confirm
the now-visible borders genuinely match the mockup's intent and this isn't masking a second bug.

### HF-14 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-10) · **Type:** Infrastructure (Testing) · **Dependency:** AUTH-4's TopBar avatar-menu change ·
**Summary:** `client/docs/HF-14_REGENERATE_VISUAL_BASELINES.md`

**Found during AUTH-4:** `TopBar.tsx`'s avatar area changed (chevron + dropdown-menu wiring for the
new logout entry point) — `TopBar` renders on every page, so this shifts Home Feed's already-shipped
rendering the same way AUTH-1's `cn()` fix did (HF-13). Confirmed via `pnpm test:visual`: all 9
committed baselines now legitimately diff (0.02–0.03 pixel-ratio, consistent across repeated runs —
not flakiness), since the top-right corner of every capture now shows the new chevron/avatar-menu
markup. Same reasoning as HF-13 for why this is its own ticket: the change is correct and shouldn't
be reverted, but regenerating baselines is a separate concern from the feature that caused the drift.

**To execute:** identical process to HF-12/HF-13 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
new baselines show the avatar chevron correctly and nothing else drifted unexpectedly.

### HF-15 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-14) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-1's real feed + delete menu ·
**Summary:** `client/docs/FEED-1_FEED_POSTCARD_REAL.md`

**Found during FEED-1:** Home Feed's `Feed`/`PostCard` are real now (`usePersonalFeed()`), and
`PostCard` gained a new "..." delete menu (owned-post only). Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (0.01–0.03 pixel-ratio) — real post content (different author names/text) differs
from the old mock content, and 2 of the 3 e2e fixture posts are owned by the seeded test user, so
the new delete menu icon now appears on them. Direct image inspection of the actual vs. expected
screenshots confirmed this is the correct new rendering, not a regression. Same reasoning as
HF-13/HF-14 for why this is its own ticket: the feature change is correct and shouldn't be
reverted, but regenerating baselines is a separate concern.

**To execute:** identical process to HF-12/HF-13/HF-14 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
3 real posts, their sport badges, and the 2 delete-menu icons all render as expected and nothing
else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed before overwriting). Human visual
check of the `default`/`empty` @ 1280px captures confirmed the 3 real posts, correct sport badges,
correct like/comment counts, and the 2 delete-menu icons all render exactly as expected — nothing
else drifted. `pnpm exec playwright test --project=visual-regression` still shows all 9 as
"different" when run **locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; local Windows runs diverge on font rendering; CI is the authoritative environment).
Confirmed via direct diff-image inspection that the residual local diff is sub-pixel text
positioning (anti-aliasing), not a content mismatch — same text, same layout, same data in both.
Committed on `feature/feed-1-feed-postcard-real` (not a separate branch) since the baselines and
the code that changed the rendering need to land together — this repo's `master` never had
FEED-1's changes, so there's no "baselines vs. shipped code" mismatch window to avoid, unlike the
HF-13/HF-14 case where the triggering change had already merged.

### HF-16 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-14) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-2's comment button + dialog ·
**Summary:** `client/docs/FEED-2_COMMENTSECTION_REAL.md`

**Found during FEED-2:** `PostCard`'s comment icon changed from a static `<span>` to a clickable
`<button>` (needed for the new comment dialog). Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (~0.01–0.02 pixel-ratio) — a small but real layout nudge from the button's
padding/focus-ring affordances. Direct image inspection of the actual render confirmed correct
content/layout, not a regression. Same reasoning as HF-13/14/15: the feature change is correct and
shouldn't be reverted, but regenerating baselines is a separate concern from the feature that caused
the drift.

**To execute:** identical process to HF-12/13/14/15 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
comment button renders correctly (no dialog-open state leaking into a static capture) and nothing
else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed via byte comparison before
overwriting). **Only 6 of the 9 actually changed** (`default`/`basketball` at all 3 breakpoints) —
the 3 `empty`-state baselines came back byte-identical to what was already committed, which makes
sense: the empty state renders zero posts, so `PostCard`'s comment button never appears in that
capture at all, nothing to shift. Human visual check of the `default`/`basketball` captures at all 3
breakpoints confirmed content, layout, sport badges, and like/comment counts all render exactly as
expected — no visible difference at normal viewing, consistent with the diff being a sub-pixel
padding nudge. `pnpm exec playwright test --project=visual-regression` still shows all 9 as
"different" when run **locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; CI is the authoritative visual environment). Confirmed via direct diff-image
inspection of the `empty` state (byte-identical to the prior baseline, so any local diff there is
*purely* Windows-vs-Linux font-rendering noise) that the same characteristic anti-aliasing pattern —
not a content mismatch — accounts for the `default`/`basketball` diffs too.

### MSW-0 · Mock Service Worker handler setup
**Status:** `DONE` (2026-07-08) · **Type:** Infrastructure (Testing) · **Dependency:** HF-00 · **Spec:** AUTH/FEED epic § MSW-0 ·
**Summary:** `client/docs/MSW-0_MOCK_SERVICE_WORKER_HANDLER_SETUP.md`

Browser-mode MSW wired into a Playwright fixture; handlers for auth/feed/groups typed against the
same `types.ts` as the real hooks; zero real network calls verified via Playwright's network log.
**Delta:** also add sport handlers (`GET /api/sports`, `GET /api/sports/profiles/user/{userId}`)
for SPORT-1, which didn't exist when the epic was written.
**Delta (2026-07-08, resequenced):** the backlog's implementation order lists MSW-0 before AUTH-0,
but its own acceptance criteria requires handlers to be typed against AUTH-0/FEED-0's `types.ts`
files — which don't exist until those tickets ship. User decision: do **AUTH-0 first**, then
MSW-0, despite the `∥` (parallel) marking in the dependency graph. MSW-0 remains `TODO` until
AUTH-0 lands.
**Delta (2026-07-08, scope narrowed):** shipped **auth handlers only**
(`e2e/mocks/handlers/auth.ts`). The same problem that blocked MSW-0 on AUTH-0 recurs for
`feed.ts`/`groups.ts`/sport handlers — they'd need FEED-0/SPORT-1's `types.ts` files, which also
don't exist yet. Applied the same principle rather than re-asking: **FEED-0/FEED-6/FEED-7/SPORT-1
each add their own handler file when they ship** (same pattern as `HF-11`'s MSW upgrade map).
`e2e/mocks/handlers/index.ts` documents this explicitly. The Playwright fixture
(`e2e/mocks/test.ts`) and worker (`e2e/mocks/server.ts`) are feature-agnostic — later tickets only
add a new handlers file and extend `index.ts`'s array, no fixture/wiring changes needed.

### AUTH-0 · Types, API client, auth store
**Status:** `DONE` (2026-07-08) · **Type:** Foundation · **Dependency:** HF-00 · **Spec:** AUTH/FEED epic § AUTH-0 ·
**Summary:** `client/docs/AUTH-0_TYPES_API_CLIENT_STORE.md`

Types 1:1 with real DTOs, `apiClient` with `withCredentials: true` + Bearer interceptor, Zustand
auth slice. Access token in memory only — a test asserts no storage API is touched.

**Deltas for later tickets:**
- **`User.firstName`/`lastName`/`username` are non-nullable `string`**, not `string | null` as the
  epic sketch guessed — the backend coerces a missing value to `""` before serialization.
- **`avatarUrl`/`phoneNumber` added to the backend response** (`AuthServiceImpl.toUserResponse()`)
  as part of this ticket — they didn't exist in `AuthResponse.user` before, only in the unrelated
  full `UserResponse` DTO the epic's reality-check section was actually describing. Both are
  `string | null` on the client type.
- New shared `src/shared/types/api.ts` (`ApiResponse<T>`) — reuse this for FEED-0's types, don't
  redefine the envelope per feature.
- `attachAuthHeader` in `src/app/apiClient.ts` is a named export specifically so AUTH-1..AUTH-5 (and
  their tests) can exercise it directly rather than mocking axios internals.
- TopBar is still not wired to `avatarUrl` — no ticket in either epic covers that; flagged, not
  built.

### AUTH-1 · Login
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-1 ·
**Summary:** `client/docs/AUTH-1_LOGIN.md`

**Deltas for later tickets:**
- **`design-reference-login.html` now exists** (`client/design-reference/`) — created mid-ticket,
  supersedes the epic's plain-text description as the visual spec. Its left-panel two-column card
  layout (`CommunityIllustration` + form) is shared with AUTH-2's Register page per the mockup —
  reuse `CommunityIllustration` and the `shadow-card`/elevated-card token, don't rebuild.
- **OAuth buttons (Facebook/Google/Apple) render disabled**, not omitted — matches the mockup
  visually but non-functional until a real OAuth ticket exists. AUTH-2 should follow the same
  pattern if its mockup includes them.
- **Password show/hide toggle shipped in AUTH-1**, not AUTH-6 as the epic originally assigned —
  the mockup made it core to the form. AUTH-6 no longer needs to add this.
- **New shared primitives:** `src/shared/ui/input.tsx`, `label.tsx` (hand-written, not shadcn
  CLI-generated — the CLI writes to a broken path on Windows and pulls in an inconsistent
  dependency, see AUTH-1's summary), `Button`'s new `primary` variant (solid `border-accent` fill).
  Reuse these rather than re-deriving styles for AUTH-2's form fields/submit button.
- **`cn()` bug fix (`src/shared/lib/utils.ts`):** `border-hairline` utilities are now correctly
  registered with `tailwind-merge` — no longer silently dropped when combined with a
  `border-{color}` class. This changes rendering for every existing `border-hairline` usage
  app-wide (previously invisible borders now show). See **HF-13** (new ticket, `TODO`) for the
  required visual-regression baseline regen this causes.
- **`QueryClientProvider` now wraps the app** (`main.tsx`) — FEED-0 and later tickets needing
  TanStack Query don't need to add this themselves.

### AUTH-2 · Register
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-2 ·
**Summary:** `client/docs/AUTH-2_REGISTER.md`

Register auto-logs-in (same `AuthResult` shape as login) — no artificial "now go log in" step.

**Deltas for later tickets:**
- **No `design-reference-register.html` exists** — user decision (recommended options): Register
  reuses Login's two-column shell verbatim (now extracted as `AuthShell.tsx`,
  `src/features/auth/components/`) plus a disabled OAuth row for visual parity. Any future auth
  page (e.g. forgot-password, if unblocked later) should reuse `AuthShell` too rather than re-
  inlining the shell markup.
- **jsdom does not enforce `minLength` (`tooShort` is hardcoded `false` in jsdom's
  `HTMLInputElement` impl)** — don't write a Vitest/RTL test asserting a `minLength` blocks
  submission, it will pass falsely or fail depending on jsdom internals. Assert the attribute
  instead (`toHaveAttribute('minLength', ...)`) and verify the real constraint manually in a
  browser. `required` is unaffected — jsdom does enforce that one.

### AUTH-3 · Session bootstrap on app load
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-3 ·
**Summary:** `client/docs/AUTH-3_SESSION_BOOTSTRAP.md`

Refresh-on-load restores the session from the httpOnly cookie; the refresh response's `user` object
doubles as "who am I" (no `/api/users/me` exists). **No longer blocked** — auth backlog A2 (BE-1)
shipped 2026-07-08; `POST /api/auth/refresh` genuinely reads/sets the cookie now. See
`modules/auth/docs/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md`.

**Deltas for later tickets:**
- **`App.test.tsx` now always wraps `QueryClientProvider`** (`renderApp` helper used by every case,
  not just `/login`/`/register`) — `App` calls `useSessionBootstrap()` unconditionally, so any test
  rendering `<App />` needs a query client, matching real `main.tsx` structure. Future tests adding
  cases to this file should keep using `renderApp`, not a bare `<MemoryRouter>`.
- **Found and fixed a real backend bug bundled into this branch (user decision — own-branch was the
  alternative, declined):** `JwtTokenServiceImpl.generateToken()` had no random component, so two
  refresh tokens for the same user within the same second collided on `refresh_tokens.token`'s
  `UNIQUE` constraint (500). Fixed with a `jti` claim. See **A4**
  (`modules/auth/docs/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`) — not a client-side concern for AUTH-4/5
  to work around, the fix is already in place.
- **`useSessionBootstrap()` is called once, at the app root (`App.tsx`), regardless of route** —
  AUTH-4's `ProtectedRoute` should read `authStore.isBootstrapping`/`user` rather than re-triggering
  or duplicating this call anywhere else.

### AUTH-4 · ProtectedRoute + logout
**Status:** `DONE` (2026-07-10) · **Type:** Feature · **Dependency:** AUTH-3 · **Spec:** AUTH/FEED epic § AUTH-4 ·
**Summary:** `client/docs/AUTH-4_PROTECTED_ROUTE_LOGOUT.md`

Wait for bootstrap before redirecting; logout clears the session even if the network call fails;
redirect-back after login.

**Delta (2026-07-08):** auth backlog A3 (BE-2) has **shipped** — `POST /api/auth/logout` no
longer takes a `userId` query param at all; it derives the caller from the `Authorization: Bearer`
header (401 if missing/invalid). Implement against `POST /api/auth/logout` with no query string.
See `modules/auth/docs/A3_FIX_LOGOUT_AUTHORIZATION.md`.

**Deltas for later tickets:**
- **Logout entry point is an avatar dropdown menu** (`TopBar`'s `user`/`onLogout` props, new
  `src/shared/ui/dropdown-menu.tsx` primitive) — user decision after reviewing an HTML mockup pitch
  built from real design tokens; not frozen as a `design-reference-*.html`. `TopBar`'s API changed:
  `userInitials`/`onAvatarClick` → `user: { initials, name, email }` + `onLogout`.
  `requiredRole`-mismatch redirects to `/` (no dedicated unauthorized page exists).
- **`e2e/mocks/fixtures.ts` gained `seedAuthenticatedSession(page, targetPath?)`** — the only
  reliable way to reach a route behind `ProtectedRoute` in an E2E spec. AUTH-8/FEED-10 (both build
  new E2E specs touching authenticated routes) should use this rather than re-deriving an
  auth-seeding approach — see AUTH-4's summary for why direct cookie injection and raw-fetch-based
  seeding both failed under real parallel-worker load.
- **HF-14 filed**: Home Feed's 9 committed visual-regression baselines are stale (TopBar's markup
  changed). Any ticket touching `TopBar` again before HF-14 lands should expect the same staleness
  and roll it into the same regen rather than filing a third near-identical ticket.
- **`a11y.spec.ts`, `smoke.spec.ts`, `home-feed-journey.spec.ts`, `app-home-feed.spec.ts`** now import
  `test`/`expect` from `../mocks/test.ts` (MSW-wired) instead of `@playwright/test` directly, and
  seed a session before asserting on Home Feed. Any new E2E spec touching an authenticated route
  should follow the same pattern from the start.
- **Added `PublicOnlyRoute`** (new, `src/shared/components/`, inverse of `ProtectedRoute`) wrapping
  `/login`/`/register` — an already-authenticated visitor is redirected to `/` instead of seeing the
  form again. Not in the original epic; added after review. **If any future route guard needs to
  react to `authStore.user` changing while it stays mounted, decide once via a `useRef` (see
  `PublicOnlyRoute`'s own implementation comment) rather than re-evaluating live on every render** —
  a reactive redirect here raced a just-completed login's own `navigate()` call, both triggered by
  the same `setSession()` update, and which one won was not a safe assumption.

### AUTH-5 · 401 refresh-retry interceptor
**Status:** `DONE` (2026-07-11) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-5 ·
**Summary:** `client/docs/AUTH-5_401_REFRESH_RETRY_INTERCEPTOR.md`

One silent refresh + one retry on 401; refresh failure → clean logout, never a retry loop.

**Deltas for later tickets:**
- **`handleResponseError()`** is a new named export on `apiClient.ts` (same reasoning as AUTH-0's
  `attachAuthHeader`) — reuse it as the reference pattern for any future interceptor logic that
  needs direct unit-testability instead of mocking axios's adapter pipeline.
- **`/auth/refresh`, `/auth/login`, `/auth/register` are excluded from the retry flow**
  (`NO_RETRY_URLS` in `apiClient.ts`) — a 401 on any of those means "recursion risk" or "bad
  credentials", not "expired session". **`/auth/logout` is deliberately NOT excluded** (user
  decision) — a logout racing an expired token still gets retried so it fully revokes server-side.
- **Concurrent 401s are deduped** via a shared module-level `refreshPromise` — the backend rotates
  the refresh token on every use, so two independent refresh calls off the same stale cookie would
  race and the loser would 401. Any future code adding a second "trigger a refresh" path (there
  isn't one today beyond `useSessionBootstrap` and this interceptor) should share this same
  primitive rather than introducing a second independent refresh call.
- **No `window.location` redirect on refresh failure** — `clearSession()` alone is sufficient
  because `ProtectedRoute` (AUTH-4) already reacts to `authStore.user` going `null`. Don't
  reintroduce a manual redirect here.
- **Retry uses `apiClient.request(originalRequest)`, not `apiClient(originalRequest)`** — same
  runtime behavior, but only `.request` is spy-able as a normal object method in tests.
- **Real-backend verification used `/auth/logout` as the target endpoint, not `/posts/feed`** —
  Home Feed still reads `mockData.ts` until FEED-1 ships, so today `/auth/logout` is the only real
  authenticated, non-bootstrap call the app actually makes. FEED-1/FEED-6/FEED-7/SPORT-1 should each
  re-confirm this interceptor still works once their real endpoints exist, since a 401 on a
  `GET /posts/feed`-style read has never been exercised against the real backend by this ticket.

### AUTH-6 · Auth hardening
**Status:** `DONE` (2026-07-12) · **Type:** Hardening · **Dependency:** AUTH-1, AUTH-2 · **Spec:** AUTH/FEED epic § AUTH-6 ·
**Summary:** `client/docs/AUTH-6_AUTH_HARDENING.md`

Rate-limit error surfacing (confirm the actual error shape first — unverified), a11y, show/hide
password toggle.

**Delta (scope split, 2026-07-12):** show/hide password toggle already shipped in AUTH-1 (pulled
forward — see AUTH-1's entry above). **Rate-limit error surfacing is out of scope for this ticket**
— verified against the real backend that no rate-limiting exists at all (no filter/interceptor, no
`bucket4j`/`resilience4j`, no config; `AUTHENTICATION_DESIGN.md` documents the intended policy but
`README_AUTH_SETUP.md` explicitly lists it as an unbuilt TODO). There's no error shape to surface
because the backend never returns one. Filed as backend ticket **A5**
(`modules/auth/docs/BACKLOG_MVP.md`) instead of building speculative client code against a made-up
response shape. Once A5 ships, file a new client ticket for the `useLogin`/`useRegister` error
branch — don't fold it back into this one, which is closing out with only its a11y scope. **This
ticket's actual remaining scope is the a11y/axe pass** (keyboard navigation + screen-reader
labeling + a committed axe scan gate on Login/Register, extending `e2e/flows/a11y.spec.ts`'s HF-8
pattern).

**Deltas for later tickets:**
- **`Button`'s `primary` variant now uses a new `--color-accent-solid` token (`#185fa5`), not
  `bg-border-accent`.** The axe gate caught a real WCAG AA contrast failure (white text on
  `border-accent`'s `#378add` = 3.59:1, needs 4.5:1) traced to `design-reference-login.html`'s own
  inline style — the mockup itself has the bug, not just the implementation. Same class of issue as
  HF-8's `text-muted` fix; reference HTML updated to match (`rgb(24, 95, 165)`), don't "restore" the
  original mockup value. Any future page reusing the `primary` button variant inherits the fix
  automatically.
- **`e2e/flows/a11y.spec.ts` now covers `/login`/`/register`** (axe + no-overflow at 3 breakpoints,
  plus explicit Tab-order tests) — future auth-adjacent pages (forgot-password, if unblocked) should
  extend this file too, per HF-8's own precedent, not start a new one.
- **Playwright's `getByLabel()` does substring matching by default** — `getByLabel('Password')`
  collides with the show/hide toggle's `aria-label="Show password"`. Use `{ exact: true }` for any
  future e2e assertion targeting the password field specifically.

### AUTH-8 · E2E functional test — auth journey
**Status:** `DONE` (2026-07-13) · **Type:** Testing · **Dependency:** MSW-0, AUTH-1..AUTH-5 · **Spec:** AUTH/FEED epic § AUTH-8 ·
**Summary:** `client/docs/AUTH-8_E2E_AUTH_JOURNEY.md`

**Delta:** ships 6 of the epic's 7 steps, split across two independent tests instead of one
continuous journey, and drops the "zero real network calls" acceptance criterion. All three changes
trace to one real, instrumented finding: MSW's per-navigation Service Worker setup races the app's
own bootstrap fetch, and the race gets *worse* with more navigations in one test (Vite's module
cache speeds up the app, not MSW's SW handshake). **Step 5 (reload-persistence) is not
implemented** — filed as backend/infra ticket **MSW-1** below with a recommended fix (standalone
mock server). Step 6 (simulated expired session) is redesigned to trigger via AUTH-5's 401-retry
interceptor instead of a reload, avoiding the same race entirely — see the summary doc for the full
investigation, including why a straightforward retry-based fix was tried and made things worse, not
better.

### AUTH-7 · QA / acceptance checklist (auth)
**Status:** `DONE` (2026-07-13) · **Type:** QA · **Dependency:** AUTH-6, AUTH-8 · **Spec:** AUTH/FEED epic § AUTH-7 ·
**Summary:** `client/docs/AUTH-7_QA_ACCEPTANCE_CHECKLIST.md`

Includes a manual pass against the *real* backend (MSW doesn't substitute) and a BE-1/BE-2
status check. 5/5 items pass.

**Deltas for later tickets:**
- **Item 2's epic wording ("query param, not body") is stale** — re-confirmed live against
  `AuthController.java`: logout is header-derived only, no param of any kind (matches AUTH-4's
  already-documented delta). Nothing new here, just re-verified rather than assumed.
- **"Passes in CI" (item 5) verified via a local `pnpm e2e` run (29/29 green)**, not an actual
  GitHub Actions run — this session had no GitHub access. Flagged as a follow-up for a human to
  spot-check the real `client-ci` run once this ticket's branch is up, same "local ≠ CI" caveat
  HF-12/HF-13 already established for the visual-regression project.
- **Phase 5 (auth integration) is fully closed as of this ticket.** Phase 6 (FEED-0 onward) is next.

### FEED-0 · Types + data hooks scaffold
**Status:** `DONE` (2026-07-13) · **Type:** Foundation · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § FEED-0 ·
**Summary:** `client/docs/FEED-0_TYPES_TANSTACK_QUERY_HOOKS_SCAFFOLD.md`

TanStack Query hooks (`usePersonalFeed`, `useGroupFeed`, `useTrendingHashtags`,
`useActiveBroadcasts`, `useUserGroups`, mutations) with `useInfiniteQuery` paging off Spring's
`Page` shape.

**Decision (2026-07-13): `Post`/`Comment`/`Group`/`GroupMember`/`Hashtag` ids are typed `number`**,
matching the backend's current `Long`/`BIGSERIAL` ids as-is. This was a deliberate, discussed choice
— not an oversight — made while aware that a backend Snowflake-ID migration is now filed
(`modules/social/post-impl/docs/BACKLOG_V1.md` · C11, `modules/social/group-impl/docs/BACKLOG_V1.md`
· A1) and would require flipping these fields to `string` (a real Snowflake value can exceed JS's
`Number.MAX_SAFE_INTEGER`, so the backend side of that migration also adds
`@JsonSerialize(ToStringSerializer)` to emit ids as JSON strings). **When C11/A1 ship, file one
follow-up client ticket** covering the `number` → `string` flip across `types.ts`, `queryKeys.ts`,
MSW fixtures, and every ticket built on this one by then (FEED-1/2/3/4/6/7/8/9) — don't fold it
silently into whichever ticket happens to be active when the backend change lands.

**Deltas for later tickets (all found via live real-backend verification, 2026-07-13 — not assumed
from the epic doc):**
- **`Post.userFullName`/`sportName`/`shareCount` are typed nullable, not the epic's implied
  non-null** — `PostServiceImpl.mapToResponse()` never populates any of the three today (confirmed:
  no builder call for them at all). Filed as backend bug **A9**
  (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — **blocks FEED-1** from rendering a real author
  name/avatar until fixed. FEED-1 must build a fallback (e.g. "Unknown" / initials placeholder) for
  as long as A9 is open, not assume the field is always present.
- **`Post.hashtags`/`Hashtag.tag` do NOT include a leading `#`** — verified against the real
  extraction regex (`#(\w+)`, captures group 1 only). This is real, permanent backend behavior, not a
  bug — differs from HF-0/HF-3/HF-5's mock-data convention (mock hashtags DO include `#`). FEED-1/
  FEED-6 must prepend `#` when bridging real data into those existing mock-convention components,
  or update the components' convention — a decision for whichever ticket lands first.
- **`GET /api/posts/hashtag/{tag}` (this ticket's `usePostsByHashtag`) 500s unconditionally** —
  confirmed via live calls, both `#`-prefixed and not. Root cause: the repository's custom `@Query`'s
  own `ORDER BY` conflicts with the controller's `@PageableDefault` sort, and Spring Data JPA appends
  a second, invalid `ORDER BY` against the wrong entity. Filed as backend bug **A10**
  (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — **blocks FEED-6**'s hashtag click-through
  entirely until fixed. `usePostsByHashtag` is typed/wired correctly (including stripping the leading
  `#` before calling the endpoint, per the point above) but cannot be exercised end-to-end today.
- All other endpoints this ticket calls (`/posts/feed`, `/posts/group/{id}`, `/posts/broadcast`,
  `/hashtags/trending`, `/groups/user/{id}`, like/unlike/delete/create) were verified live and match
  `types.ts` exactly — the `PageResponse<T>` envelope (`content/totalPages/totalElements/number/size/
  first/last/numberOfElements/empty`) matches Spring's real serialization field-for-field.

### FEED-1 · Feed + PostCard (real)
**Status:** `DONE` (2026-07-14) · **Summary:** `client/docs/FEED-1_FEED_POSTCARD_REAL.md`
**Type:** Integration · **Dependency:** FEED-0, HF-3 · **Spec:** AUTH/FEED epic § FEED-1

De-mocks HF-3 against `GET /api/posts/feed`; optimistic like with rollback; delete own posts.
Absorbs post-impl's old F1 ticket ("Frontend — personalized feed").

**Deltas for later tickets:**
- **Temporary `sportId` bridge added:** `src/features/feed/sportIdMap.ts` maps `SportKey` →
  real backend `sportId` (football→5/Soccer, basketball→6, tennis→2), confirmed live against
  `GET /api/sports`. SPORT-1 replaces this file with the real backend-driven mapping — reuse the
  same football↔Soccer naming decision, don't re-litigate it.
- **`e2e/mocks/handlers/feed.ts` is now a small stateful fake backend**, not a fixed responder —
  `postsState` is mutated by the like/unlike/delete/create handlers. Any future ticket adding a
  feed-shaped MSW handler with a mutation should follow this pattern, not a static response, or
  its own optimistic-mutation-then-invalidate cycle will self-clobber the same way this ticket's
  first attempt did.
- **`e2e/mocks/fixtures.ts`'s `mockPost.sportId` was `1` (Badminton) — corrected to `5` (Soccer)**,
  a real bug (there's no "Football" sport in the real backend at all). Any ticket relying on
  `mockPost`'s sport should use the corrected value.
- **HF-15 filed** (visual-regression baselines stale — real content + new delete menu). Any
  ticket touching `PostCard`/`Feed` again before HF-15 lands should expect the same staleness and
  roll it into the same regen, per the HF-13/HF-14 precedent.
- **FEED-8's loading/error UI** now has real `isLoading`/`isError` wired all the way through
  (`useHomeFeedData` → `Feed`) — `Feed` currently renders `null` for both (matching HF-7's own
  precedent), FEED-8 replaces that with the real skeleton/retry UI.

### FEED-2 · CommentSection (real)
**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-1 · **Spec:** AUTH/FEED epic § FEED-2 ·
**Summary:** `client/docs/FEED-2_COMMENTSECTION_REAL.md`

De-mocks nothing (no `CommentSection` existed before this ticket) — wires a new modal comment thread
(`GET`/`POST /posts/{postId}/comments`, delete, like/unlike) from `PostCard`'s comment icon. No
`design-reference-*.html` covered this surface, so 3 scope questions were confirmed with the user
before implementation (recorded as deltas below).

**Deltas for later tickets:**
- **Modal dialog (user decision)**, not inline expand — new shared `Dialog` primitive
  (`src/shared/ui/dialog.tsx`, `@radix-ui/react-dialog`) and a new `--color-overlay` token. Any
  future modal (e.g. FEED-5's CreateGroupModal/JoinGroupModal) should reuse this primitive.
- **Reply-to-comment, one level deep, is in scope (user decision)** — the backend already enforces
  "no reply-to-a-reply" server-side and returns each root comment's `replies` fully populated, so no
  generic recursion or extra endpoint was needed.
- **"View more comments" is a plain button (user decision)**, not `Feed`'s
  `useInfiniteScrollSentinel` auto-load pattern.
- **`CommentSection` takes all data as props — no internal data hook, no `postId` prop.**
  `HomeFeedPage` owns `useCommentsData(activeCommentsPostId, isOpen)`, matching every other Home
  Feed component's presentational/controlled convention (this was a mid-implementation correction —
  see the summary doc). Any future ticket extending `CommentSection` should keep it hook-free.
- **`MAX_COMMENT_LENGTH` (1000, matches the backend's real `@Size(max = 1000)`) now lives in
  `feed/types.ts`** — reuse it, don't hardcode `1000` again.
- **Real bug found and fixed in `useDeleteComment`'s optimistic rollback** (two overlapping cache
  snapshots, one silently clobbering the other) — see the summary doc; the fix pattern (one snapshot
  scoped to `feedKeys.all`, since `feedKeys.comments(postId)` nests under it by design) is the
  reference for any future hook needing to roll back more than one cache scope at once.
- **HF-16 filed and now `DONE`** (visual-regression baselines stale — comment `<span>` became a
  `<button>` — regenerated via the `client-ci` `update-baselines` dispatch). Any ticket touching
  `PostCard` again should expect the same staleness and roll a baseline regen into itself, per the
  HF-13/14/15/16 precedent.
- **`design-reference-post-modal.html` added retroactively** (`client/design-reference/`),
  extracted from the shipped implementation rather than pre-implementation (no mockup existed for
  this ticket). Static, interactive (like/reply/delete/add-comment all wired in vanilla JS,
  mirroring the real optimistic behavior) — not yet wired into the `visual-regression` Playwright
  project (no baseline screenshots/spec file exist for it, unlike HF-10a's home-feed baselines).
  **Filed as FEED-11** (`TODO`, below) rather than left as an open question.
- **The reference was then hand-revised by the user and the implementation updated to match** (same
  day) — the dialog header now shows the commented-on post itself (author/time/sport badge, close
  button stacked above the badge) instead of a generic "Comments" title, and the post's own content
  is repeated at the top of the dialog body above the comment list. `CommentSection` gained `post`/
  `sport` props (resolved by `HomeFeedPage` from its loaded feed data) for this. The composer/reply
  "Post" buttons also picked up a muted-gray→solid-blue disabled/enabled color swap (a `className`
  override on `Button`, not a new variant — see FEED-2's summary doc addendum for why, and note for
  FEED-3 if its composer's own `border-accent`-swap button ends up wanting the same pattern a third
  time). `shared/ui/dialog.tsx`'s title-only `DialogHeader` was removed as dead code in favor of
  lower-level `DialogTitle`/`DialogClose` exports, since `CommentSection` now builds a custom header.

### FEED-3 · CreatePostForm (real)
**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-0 (also practically
wants FEED-1 merged first — see delta below) · **Spec:** AUTH/FEED epic § FEED-3 ·
**Summary:** `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`

Maps to `CreatePostRequest`; 5000-char limit enforced client-side; broadcast creation belongs to
FEED-7, not this composer.

**Deltas (2026-07-14, from design review — not yet implemented):**
- **New visual spec:** `client/design-reference/design-reference-home-feed-v2.html` — adds a
  composer card (avatar + auto-growing textarea, placeholder "What's on your mind, {name}?") between
  the SportSwitcher and the feed. Action row: Photo / Location / Tag sport buttons, plus a Post
  button that's disabled until there's text (enabled state: `border-accent` fill, white text).
  Diffed against the original mockup — this composer card is the **only** structural change;
  everything else (nav, switcher, feed cards, rail) is identical.
- **User decision: v2 replaces v1 as the canonical reference.** When this ticket is picked up,
  rename `design-reference-home-feed-v2.html` → `design-reference-home-feed.html` (replacing the
  old file) rather than keeping both — matches HF-10a's "one frozen reference per page" convention.
  This means HF-10b/FEED-1's existing visual-regression baselines need regenerating for the
  composer too, on top of the already-filed **HF-15** (FEED-1's real-content diff) — likely worth
  doing as one combined baseline regen once this ticket's UI lands, not two separate passes.
- **User decision: Photo / Location / Tag sport buttons stay as inert mockup buttons for this
  ticket** — same pattern as HF-3/HF-4's `sendPrompt`-style no-ops for affordances with no
  destination yet, not real pickers. Only the textarea + Post button are functionally wired to
  `useCreatePost()`.
- **Practical sequencing note:** formal dependency is still just FEED-0, but implementation should
  branch off `feature/feed-1-feed-postcard-real` (not `master`) once picked up — that branch has the
  real `Post` type, `usePersonalFeed()` cache, and `optimisticFeedUpdates.ts` helpers this ticket's
  "prepend the new post to the current feed view without a full refetch" acceptance criterion needs
  to hook into. Building against `master`'s still-mock `Feed` would be throwaway work. Rebase onto
  `master` once FEED-1 actually merges.

**Executed (2026-07-14):** by the time this ticket was picked up, FEED-1 and FEED-2 had already
merged into `master` (PRs #28/#29 and #32), so the sequencing note above was moot — branched off
`master` directly, which already had the real `Post` type/`usePersonalFeed()`/
`optimisticFeedUpdates.ts` this ticket needed. `design-reference-home-feed-v2.html` renamed to
canonical `design-reference-home-feed.html` (git mv) as specified; also fixed a stray CDN icon-font
`<link>` the v2 file shipped with back to HF-10a's vendored `./assets/tabler/` path (the file's own
header comment claimed the vendored path but the actual `href` still pointed at jsdelivr — the same
404-risk class of bug HF-10a already fixed once elsewhere). `useCreatePost`'s `onSuccess` now
prepends the real server-returned post directly into the owning feed cache (`personalFeed` or
`groupFeed(groupId)`) instead of a blanket invalidate, satisfying the "without a full refetch"
criterion; `onSettled` still invalidates in the background. Live-verified end-to-end against the
real running backend (registered a test user, Playwright-driven browser walkthrough) — composer
renders, Post button's enabled/disabled states render correctly, posting prepends the real post and
clears the textarea, renders cleanly at 375px. Full details: `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`.

**Deltas for later tickets:**
- **`POST_BUTTON_DISABLED_OVERRIDE` now lives in `shared/ui/button.tsx`** (named export), not
  locally defined in `CommentSection.tsx` — this ticket was the 3rd call site FEED-2's own summary
  anticipated, so it's hoisted now. While hoisting, also consolidated `CommentItem.tsx`'s reply
  button, which had its own unhoisted inline copy of the same classes. Any future "Post"-style
  composer button should import this constant, not redefine the disabled-state classes again.
- **Visual-regression baseline regen (2026-07-15):** the plan was to do this HF-15/16-style
  (committed into the FEED-3 branch before merge), but the PR merged first — same situation as
  HF-13/14 in the end. Regenerated via the `client-ci` `update-baselines` dispatch on a separate
  branch (`docs/feed-3-regenerate-visual-baselines`) after merge. All 9 baselines changed
  byte-for-byte this time (unlike HF-16's 6-of-9) — the composer renders on every state including
  `empty`, unlike HF-16's comment button which only appeared on rendered posts. Human-verified
  `default`/`empty`/`basketball` at all 3 breakpoints: composer placeholder/action row/Post button,
  correct sport badges, correct like/comment counts, nothing else drifted.
  `pnpm exec playwright test --project=visual-regression` still reports all 9 as "different" locally
  on Windows — expected per HF-12's note (CI is the authoritative Linux-rendered environment);
  confirmed via diff-image inspection the local diff is pure sub-pixel font-rendering ghosting
  (same layout/content/structure), not a content mismatch.
- **`useCreatePost`'s cache-targeting logic (personalFeed vs. groupFeed by `post.groupId`) is a
  known gap for `GROUP_BROADCAST` posts** — they land in `groupFeed(groupId)` but not
  `feedKeys.broadcasts()`. FEED-7 (broadcast creation) needs to either extend
  `useCreatePost`'s onSuccess or add its own targeted cache write when it ships.

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

### MSW-1 · Standalone mock server for e2e
**Status:** `TODO`
**Type:** Infrastructure (Testing)
**Origin:** discovered during AUTH-8 — a genuine, reproducible race between MSW's per-navigation
Service Worker setup and the app's own bootstrap fetch, root-caused with instrumented timing data.
Not fixable by waiting longer or retrying more (see "Why not X" below) — the fix has to change
*how* MSW is wired in, not how long a test waits for it.

**The problem, precisely:** `e2e/mocks/test.ts` re-runs the full `import('/e2e/mocks/server.ts') →
setupWorker() → worker.start()` chain via `page.addInitScript()` on *every* navigation, including
`page.reload()`. That chain takes ~150–300ms (real, measured: Service Worker registration +
activation + a `postMessage` handshake). Meanwhile `App.tsx`'s `useSessionBootstrap()` fires
`POST /api/auth/refresh` as soon as React mounts — and on a `page.reload()` specifically, Vite's
dev-server module cache means the app mounts *faster* on each successive navigation within the same
test, while MSW's setup cost stays roughly flat (Service Worker registration isn't a cacheable HTTP
fetch the way JS modules are). The two curves cross a few navigations in: early on MSW usually wins,
by the 4th–5th real navigation in the same test the app reliably wins and the refresh request falls
through to the real network layer instead of being intercepted.

This is why `AUTH-8`'s step 5 ("reload while logged in — still authenticated") could not be reliably
tested and was skipped rather than shipped flaky — see `client/docs/AUTH-8_E2E_AUTH_JOURNEY.md` for
the full investigation and instrumented timeline.

**Why not X (things that look like fixes but aren't, all tried for AUTH-8):**
- A fixed sleep before checking — the epic's own "no arbitrary waits" rule rules it out anyway, and
  it wouldn't be reliable across machines/CI load regardless.
- A bigger retry budget — makes it *worse*, not better: more retries means more navigations, which
  pushes the app's warm-cache advantage further ahead, not closer. Confirmed empirically: 15 retries
  had a *lower* success rate than 5.
- Gating the `/auth/refresh` request via `page.route()` until MSW is confirmed ready — the request
  never reached MSW's handler at all afterward; CDP-level route interception appears to bypass the
  Service Worker dispatch path once it grabs a request.
- Gating the app's entry module (`/src/main.tsx`) the same way — deadlocked; that also blocked Vite
  dev server's concurrent fetch of the MSW setup module the wait itself depended on.
- A one-time "warm-up" navigation before the real test steps — doesn't help, and plausibly hurts:
  warming up *helps the wrong side* of the race (the app's cache), the same way extra retries do.

**Recommended fix — Version A: run mocking as a real, separate process, not a browser Service
Worker.**

Instead of intercepting requests *inside the page* (which is inherently tied to that page's own
lifecycle and re-triggers on every navigation), run an actual small HTTP server — reusing the
handler *logic* already in `e2e/mocks/handlers/*.ts` — that's already listening on a real port
before any test starts. Point Vite's dev proxy at that port instead of `:8080` for e2e runs.

- **Server:** either (a) a thin adapter that feeds real Node `http` requests through the *same*
  `http.post(url, resolver)` handler definitions already written (convert `IncomingMessage` →
  `Request`, run the matching resolver, write the `Response` back — Node 18+'s global
  `Request`/`Response` from `undici` make this straightforward, no extra dependency), or (b) a
  small hand-written Express/`http` server duplicating the same behavior. (a) avoids maintaining
  two copies of the same auth/feed mock logic and should be the default choice unless it proves
  awkward in practice.
- **Lifecycle:** Playwright's `webServer` config option accepts an array, not just one entry — add
  a second `webServer` block for the mock server alongside the existing `pnpm dev` one, so
  Playwright starts/stops it automatically with the same guarantees the dev server already gets.
- **Routing:** an env var (e.g. `VITE_API_PROXY_TARGET`) read in `vite.config.ts`, set only for the
  e2e/visual-regression Playwright run, pointing the `/api` proxy at the mock server's port instead
  of `:8080`.
- **Verification technique changes:** `response.fromServiceWorker()` (used today in
  `msw-setup.spec.ts` and AUTH-8's journey spec to prove "no real backend involved") no longer
  applies — these become genuine real network calls, just to a fake backend. Replace with an
  introspection point on the mock server itself (a request log the test can query, or a dedicated
  `/__mock/*` endpoint) — needs deciding as part of this ticket, not assumed.
- **A real, valuable side effect:** a real server can set genuine `Set-Cookie` response headers that
  the browser actually honors (unlike a Service-Worker-mocked response — see AUTH-8's summary for
  why that never works, httpOnly or not). This would let a reload-persistence test work directly,
  with no `seedRefreshCookieMirror`-style workaround needed at all.
- **Scope check:** `playwright.config.ts` currently shares one `webServer` (`pnpm dev`) across both
  the `e2e` and `visual-regression` projects — confirm during Phase 2 explore whether
  `visual-regression`'s specs (Home Feed only, still mock-data-internal, no real endpoint calls) are
  affected by switching the shared dev server's proxy target, or whether they need to keep pointing
  at `:8080`/nothing.

**Effort estimate — Version A: ~1.5–2.5 days.** Breakdown: mock server + adapter (~0.5–1 day,
handlers are already well-structured, main work is the Node request/response adapter and getting
cookie semantics right); Playwright `webServer` array + Vite proxy env wiring (~1–2 hours);
migrating the 2–3 specs that use `fromServiceWorker()` today to the new verification technique
(~2–4 hours); full e2e suite re-verification under the new topology (~2–4 hours, exploratory —
likely to surface something not anticipated here). This is a known-working pattern (a real backend
process for e2e mocking is common practice), so the estimate has reasonable confidence.

**Effort estimate — Version B (considered, not recommended): keep the Service Worker, make the
per-navigation handshake itself faster/lighter, rather than replacing the architecture.**
MSW doesn't expose a public "lightweight reconnect to an already-active worker" API — `worker.start()`
is the only documented entry point, and skipping it entirely leaves the new page instance with no
message channel to the (already-active) Service Worker, since Worker "clients" are per-document and
the handshake is what registers this specific document as active. A real Version B would mean either
monkey-patching MSW's internals (fragile — breaks silently on any MSW version bump, and reverse-
engineering undocumented internals is itself the bulk of the work) or hand-rolling a custom, minimal
SW registration protocol talking to the same `mockServiceWorker.js` script MSW ships (a full
reimplementation of part of MSW's browser client). **Estimate: at least 0.5–1 day of pure feasibility
investigation before any implementation estimate is even possible, with no guarantee it's achievable
at all** — meaingfully worse effort-to-confidence ratio than Version A, which is why Version A is the
recommendation despite touching more files.

**Acceptance criteria (once picked up):**
- A `page.reload()`-based reload-persistence test (the one AUTH-8 had to skip) passes reliably —
  run it repeated (`--repeat-each=10` or similar) with zero flakes before considering this done.
- All existing e2e specs still pass under the new mock topology.
- `AUTH-8`'s auth-journey spec gains its step 5 back (or a note explaining why not, if Version A
  turns up a new blocker).

### FEED-12 · Comment modal fetches its own post + URL-addressable deep link — new ticket, not in either epic
**Status:** `TODO` · **Type:** Feature · **Dependency:** FEED-2 (`DONE`) ·
**Origin:** raised by the user right after FEED-2 merged (PR #32) — today `CommentSection`'s `post`/
`sport` props are resolved by `HomeFeedPage` purely by looking up `data.posts.find(post => post.id
=== activeCommentsPostId)` against `usePersonalFeed()`'s already-loaded cache
(`HomeFeedPage.tsx`). Two real consequences of that:

1. **The modal can only ever open for a post the feed has already fetched.** A post outside the
   currently loaded pages (e.g., paginated further than the user has scrolled, or from a different
   feed view entirely) has no path to a comment dialog today.
2. **There is no URL that opens directly to a post's comment thread.** No route reads a `postId`
   from the URL at all — the dialog is 100% driven by in-memory page state
   (`activeCommentsPostId`), so a shared link, a notification deep link, or a page refresh while the
   dialog is open all have nowhere to go.

**What changes:**
1. A new `usePost(postId)` hook (TanStack Query) wrapping `GET /api/posts/{postId}` (confirmed to
   exist — `PostController.getPost()`, returns the same `PostResponse` shape `usePersonalFeed`
   already types against, no new client type needed). Query key should be independent of the feed
   (e.g. `feedKeys.post(postId)`) but consider seeding it via `initialData` from the feed cache when
   the post is already known there, so opening the dialog from within an already-loaded feed doesn't
   trigger a redundant network round-trip — only the "not in cache" / direct-URL path should
   actually hit the network.
2. `CommentSection`'s `post`/`sport` props come from this dedicated fetch instead of
   `HomeFeedPage`'s feed-cache lookup — this decouples the modal entirely from feed pagination
   state, and is what actually makes it work from a cold direct-URL load.
3. A URL route — recommend path-based (`/posts/:postId`), matching this app's existing route style
   (`App.tsx`'s flat `<Route path="/...">` list) over a query param, since a query-param convention
   was already deliberately retired once (`?visual-state=empty`, removed per HF-10b's own delta once
   a real seam existed). **Exactly what renders at that route is a real design decision, not
   assumed here** — same kind of question FEED-2's modal-vs-inline was, worth confirming with the
   user at pickup rather than guessing: does `/posts/:id` render the full `HomeFeedPage` underneath
   with the dialog pre-opened (simplest, reuses everything), or a lighter dedicated single-post
   shell? The former is almost certainly right unless there's a reason to avoid loading/rendering
   the whole feed just to view one post's comments.
4. Close behavior when opened via direct URL needs to be sane — e.g. navigate back to `/` on close
   rather than leaving a bare page behind the dialog. Decide whether browser back/forward should
   also close it (likely yes, for free, if using a real route rather than a state flag).
5. New MSW handler: `GET /api/posts/:postId` doesn't exist in `e2e/mocks/handlers/feed.ts` yet
   (only list/feed endpoints and `DELETE /api/posts/:postId` exist today) — add it, reusing
   `postsState`.

**Sequencing note:** this simplifies **FEED-11** (below) — once the modal is reachable by URL,
FEED-11's visual-regression spec can `page.goto('/posts/123')` directly instead of navigating to `/`
and clicking through a real post card to open the dialog. Recommended to pick this up before FEED-11,
though not a hard blocker if FEED-11 lands first (its spec would just need a follow-up simplification
pass afterward).

**Acceptance criteria:**
- Loading `/posts/{id}` as a fresh page load (no prior feed fetch, e.g. a new tab) renders the
  correct post + comment thread, including for a post that would not be present in the feed's first
  loaded page.
- Opening the dialog via the existing in-feed click-to-open flow still works, with no regression and
  no unnecessary duplicate fetch when the post is already in the feed's cache.
- Closing the dialog when it was opened via direct URL returns to a sane page state (not a bare
  backdrop with nothing behind it).
- `usePost`/MSW handler covered by Vitest, same pattern as `useComments`'s own test file.

### FEED-11 · Visual regression harness for the post comment modal — new ticket, not in either epic
**Status:** `TODO` · **Type:** Infrastructure (Testing) · **Dependency:** FEED-2 (`DONE`) ·
**Origin:** raised during FEED-2's implementation — the modal has no visual-regression coverage
today, unlike Home Feed (HF-10a/b) or the auth pages (their own `a11y.spec.ts`/visual specs).

**Why this is its own ticket, not folded into FEED-2:** the comment dialog already has a
`design-reference-post-modal.html` reference and full Storybook + Vitest coverage — this ticket is
specifically about the missing Playwright `visual-regression` project coverage (pixel-diffing the
real rendered page against frozen baselines), the same layer HF-10a/b added for Home Feed. Deferred
at FEED-2 time because it's a genuine scoping decision (see below), not a quick add.

**What makes this different from HF-10a/b's harness (read before starting):**
- Home Feed's baselines are captured by `page.goto('/')` plus a query param for the empty state —
  a URL is enough. The comment modal is **not reachable by URL today** — a spec has to
  `page.goto('/')`, find a real post card, click its "View comments" button, and wait for the
  dialog's open transition to settle before screenshotting. **Check FEED-12's status before
  starting this**: if FEED-12 (above) has shipped by then, just `page.goto('/posts/{id}')` directly
  instead — simpler and removes the click-through step entirely. If FEED-12 hasn't landed yet, fall
  back to the click-through approach described here rather than blocking on it. Decide whether to
  screenshot the whole page (dialog + dimmed backdrop, matching how a user actually sees it) or just
  the dialog element (`page.locator('[role="dialog"]')`) — the former matches
  `design-reference-post-modal.html`'s own framing, the latter is cheaper to maintain if the backdrop
  content (feed posts) is expected to drift independently.
- **Meaningful states to cover** (mirroring HF-10a's "3 breakpoints × 3 states" shape): empty
  thread, populated (root comments + at least one reply, to catch indentation drift), and the
  disabled→enabled Post button treatment (FEED-2's addendum) — arguably 2 button-state captures at
  one breakpoint rather than duplicated across all 3, to keep the baseline count sane. Loading/error
  states are intentionally NOT frozen here, same precedent as Feed's own visual spec (HF-10b) never
  capturing `isLoading`/`isError` — those are Storybook's job.
- **MSW dependency:** unlike Home Feed's visual spec (which currently drives mock-internal state via
  `usePersonalFeed`'s real query against MSW handlers already wired for `e2e`), this needs the
  `feedHandlers`' `commentsState` (FEED-2) to already have deterministic fixture data seeded for
  whichever post the spec opens — reuse `mockPost`/`mockComment` from `e2e/mocks/fixtures.ts`, don't
  invent a second fixture set.
- **Freezing time still applies** — reuse the same `page.clock.setFixedTime()` pattern HF-10b
  established for Home Feed's relative timestamps, since `CommentItem` also renders
  `formatRelativeTime()`.

**Acceptance criteria (once picked up):**
- New baselines committed under `e2e/visual/__screenshots__/` (naming convention:
  `post-modal-<state>-<width>.png`, matching Home Feed's `home-feed-<state>-<width>.png` pattern).
- Baselines generated via the same `client-ci` `update-baselines` dispatch as Home Feed's (Linux-
  rendered, per HF-12's precedent) — not committed from a local Windows run.
- Wired into the existing `visual-regression` Playwright project (`playwright.config.ts`) — no new
  project/config needed, same as `app-home-feed.spec.ts`.
- A token-hardcoding audit pass over `CommentSection.tsx`/`CommentItem.tsx`/`shared/ui/dialog.tsx`,
  matching HF-10b's own "diff against tokens, not just pixels" scope.

| Item | Decision |
|---|---|
| De-mock HF-4 (UpcomingMatches) | Deferred — no matches/tournaments backend module exists; needs its own backend design pass first. HF-4 ships mock-backed in this MVP. |
| Forgot/reset password screens | Deferred — `POST /api/auth/forgot-password` is a non-functional server-side placeholder; building UI against it now would do nothing. |
| OAuth2 social login (Google/Facebook) | Deferred — scaffolded server-side but unverified; own ticket if prioritized. |
| Group invitations / pinned posts / ownership transfer UI | Deferred — real endpoints exist but belong to a future Groups-page epic, not Home Feed MVP. |
| Add-sport flow screen | Deferred — only the entry-point callback is wired (HF-2/SPORT-1); `POST /api/sports/profiles` is ready when this gets scoped. |
