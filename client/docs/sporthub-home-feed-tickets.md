# Epic: SportHub — home feed screen (React implementation)

Source: approved interactive mockup (sport switcher + feed + right rail: upcoming matches, trending, group broadcasts).

Scope of this epic: build the **Home feed** screen, as interactive UI, on a **new** client (see `CLAUDE.md` — the existing `client/` app is being dropped and rebuilt). This is no longer a pure mock-data exercise: a real Java/Spring Boot backend already exists for auth and for posts/groups, and the new client should integrate against it for real. Mock data (HF-0) is now scoped down to only the pieces with no backend yet. See the scope update below before starting.

---

## Scope update — existing backend discovered

Partway through planning, it turned out this isn't a greenfield project: there's an existing Gradle multi-module Java backend (`modules/auth`, `modules/user`, `modules/sport`, `modules/social`) and an old CRA-based client that's being discarded. This changes what "mock data" means for each part of this screen:

**Correction after deeper code review** (reading actual controllers, not just docs): trending hashtags and group broadcasts turned out to already have real backend support — the table below reflects the corrected picture.

| Home Feed piece | Backend status | Implication for HF tickets |
|---|---|---|
| Auth (current user, login/session) | Complete (`modules/auth`) | New client's auth needs real integration — see `sporthub-auth-feed-integration-tickets.md`, and the token-storage change noted in `CLAUDE.md` (access token in memory, refresh in httpOnly cookie — needs a small backend change too). |
| Feed posts, likes, comments (HF-3) | Complete (`PostController`: `/api/posts/feed`, `/api/posts/group/{id}`, like/unlike, comments) | HF-3 should call the real feed endpoint via TanStack Query, not `mockData.ts`, once Auth Integration lands. Detailed in `sporthub-auth-feed-integration-tickets.md`. |
| Trending hashtags (HF-5) | **Complete** (`HashtagController`: `GET /api/hashtags/trending`, `GET /api/hashtags/suggest`) | Not mock-only after all — de-mock as part of the Feed Integration epic, not a future backend ticket. |
| Group broadcasts (HF-6) | **Complete** — modeled as a `Post` with `postType=GROUP_BROADCAST` and an expiring `broadcastEndTime`, not a separate entity (`PostController`: `GET /api/posts/broadcast`, `PATCH /api/posts/{id}/broadcast-end-time`) | Also de-mocks as part of Feed Integration, not new backend work. |
| Sport switcher (HF-2) | Entities/services exist (`modules/sport`) but `SportController` (the REST layer) was never built | Still genuinely blocked — stays mock until a backend ticket adds the controller. |
| Upcoming matches (HF-4) | No backend at all — no `matches`/`booking` module exists in `modules/` | Stays mock until scoped as new backend work, outside this epic's scope. |

**Companion epic**: `sporthub-auth-feed-integration-tickets.md` covers Auth Integration and Groups/Feed Integration in full HF-style detail (types, component APIs, acceptance criteria) — including a real backend security finding (`/api/auth/logout` currently has no auth check on the `userId` it revokes) and the exact request/response shapes for every endpoint above. Read it before starting HF-3, HF-5, or HF-6, since those three get de-mocked by that epic rather than staying mock indefinitely.

**Still-open backend gaps** (outside both epics for now):
- **Backend: SportController** (Phase 4 in `modules/sport`): exposes the existing `Sport`/`UserSportProfile` services over REST. Needed before HF-2 can be de-mocked.
- **Backend: matches/tournaments**: no data model exists yet. Needs its own design pass.

The ticket breakdown below is otherwise unchanged — HF-0's mock data still applies to sport profiles and matches only now, not to auth, the core feed, hashtags, or broadcasts.

---

## Implementation roadmap

**Should Playwright be set up first?** Yes — set up the visual-regression harness (HF-10a below) in Phase 0, in parallel with HF-0, not at the end. If it's left until everything is built (as a literal reading of "HF-10 comes last" would suggest), every component ships without a check against the mockup and any drift only surfaces in one large diff at the very end, when it's more expensive to trace back and fix. Standing up the harness early costs almost nothing (it only needs the reference HTML, not the app) and means every component PR from Phase 1 onward can be screenshot-diffed as it lands.

To make that possible, HF-10 is split into two parts:
- **HF-10a — harness setup** (Phase 0): install Playwright, load `design-reference-home-feed.html`, generate baseline screenshots. No dependency on app code.
- **HF-10b — full coverage + CI gate** (Phase 3): extend the harness to the real built page across breakpoints and states, and make it a required CI check.

**Phase 0 — Foundations**
- HF-00: project scaffolding and tooling setup (do first — everything else depends on the repo existing)
- HF-0: shared types and mock data (parallel with HF-10a, once HF-00 merges)
- HF-10a: Playwright/visual-regression harness setup (parallel with HF-0, once HF-00 merges)

**Phase 1 — Core components (parallelizable across people once HF-0 lands; each can be Storybook-diffed against the reference HTML as it's built, using the HF-10a harness)**
- HF-1: TopBar + NavTabs
- HF-2: SportSwitcher
- HF-3: PostCard + Feed
- HF-4: UpcomingMatches
- HF-5: TrendingHashtags
- HF-6: GroupBroadcasts

**Phase 2 — Integration (depends on Phase 1 + HF-0)**
- HF-7: HomeFeedPage — layout, state wiring, data hook

**Phase 3 — Hardening (depends on HF-7)**
- HF-8: Responsive and accessibility pass
- HF-10b: Full-page visual regression across breakpoints, CI gate enabled
- HF-11: E2E functional test — Home Feed journey

**Phase 4 — Release readiness (depends on everything above)**
- HF-9: QA / acceptance checklist

---

## HF-00: Project scaffolding and tooling setup

**Description**
Bootstrap the (currently empty) repository with the agreed stack so every other ticket has a consistent, already-configured base. This blocks everything else — HF-0 and HF-10a start the moment this merges.

**Stack decisions**
| Concern | Choice | Why |
|---|---|---|
| Build tool | Vite | Fast dev server, minimal config, no SSR/API routes needed for an authenticated app screen |
| Framework | React 18 + TypeScript (`strict: true`) | Matches the ticket specs, which are already written as typed component props |
| Routing | React Router (client-side) | Gives `NavTabs` (HF-1) real routes instead of no-op callbacks |
| Styling | Tailwind CSS | Utility-first, zero runtime cost, theme config maps 1:1 onto the mockup's design tokens |
| Unit/component tests | Vitest + React Testing Library + `@testing-library/jest-dom` | Native ESM/TS, fastest pairing with Vite |
| Component workshop | Storybook (Vite builder), `addon-a11y`, `addon-interactions` | Needed for the per-component visual parity checks described in HF-1–HF-6 and HF-10b |
| E2E / visual regression | Playwright, configured independently from Vitest | This is what HF-10a and HF-10b are built on |
| Package manager | pnpm (or npm — not a hard requirement, just pick one and standardize) | Faster installs, stricter dependency resolution |

**Deliverables**
- Repo scaffolded via `create vite` with the `react-ts` template.
- Tailwind installed; `tailwind.config.ts` theme extended so the mockup's CSS variables have a direct Tailwind equivalent — this mapping should be a literal table in the PR description so component authors don't have to re-derive values:
  - `surface-0 / surface-1 / surface-2` → background colors
  - `text-primary / text-secondary / text-muted / text-accent / text-danger` → text colors
  - `border / border-strong / border-accent` → border colors
  - Sport ramps as named colors: `teal-50/800`, `coral-50/800`, `purple-50/800` (matches the hex values already used in `design-reference-home-feed.html`)
- ESLint + Prettier configured, including `eslint-plugin-jsx-a11y` (feeds directly into the HF-8 accessibility pass).
- React Router installed with a placeholder route table: `/` → `HomeFeedPage`, plus stub routes for `/friends`, `/groups`, `/matches`, `/profile` (a simple "coming soon" placeholder is enough) so `NavTabs` has somewhere real to navigate.
- Vitest configured (`vitest.config.ts`, jsdom environment, RTL setup file).
- Storybook initialized and confirmed working with one placeholder story.
- Playwright installed as a separate top-level dependency (own config, not sharing Vitest's).
- `README.md` documenting how to run the dev server, unit tests, Storybook, and Playwright.

**Acceptance criteria**
- `dev`, `test`, `storybook`, and Playwright's test command each run successfully against trivial placeholders (blank app, smoke test, one story, one e2e spec).
- Tailwind theme tokens are named to match the mockup's CSS variables one-for-one.
- Nothing in this ticket references home-feed-specific logic — it's pure scaffolding.

---

## HF-0: Shared types and mock data layer

**Description**
Create the TypeScript models and a mock data module every other component consumes, so components can be built in parallel against a stable contract.

**Deliverables**
`src/features/home-feed/types.ts`:
```ts
export type SportKey = 'football' | 'basketball' | 'tennis'; // extend as sports are added

export interface SportProfile {
  key: SportKey;
  label: string;
  icon: string;      // icon name, e.g. 'ball-football'
  colorRamp: string; // design-token ramp name, e.g. 'teal'
}

export interface Post {
  id: string;
  sport: SportKey;
  authorName: string;
  authorInitials: string;
  authorAvatarUrl?: string;
  createdAt: string;      // ISO timestamp
  text: string;
  hashtags: string[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface UpcomingMatch {
  id: string;
  sport: SportKey;
  title: string;
  startsAt: string;   // ISO timestamp
  location: string;
  spotsLeft: number;  // 0 = full
}

export interface TrendingHashtag {
  tag: string;
  postCount: number;
}

export interface GroupBroadcast {
  id: string;
  groupId: string;
  groupName: string;
  groupInitials: string;
  colorRamp: string;
  text: string;
  createdAt: string; // ISO timestamp
}
```

`src/features/home-feed/mockData.ts` — exports arrays typed against the above (port directly from the mockup's `sports`, `posts`, `upcoming`, `hashtags`, `broadcasts`).

**Acceptance criteria**
- Types compile with `strict` mode on.
- Mock data covers all 3 sports, at least 1 full and 1 open match, at least 4 hashtags, at least 2 broadcasts.
- No component imports raw mock arrays directly — they go through a hook (see HF-7) so swapping in a real API later only touches one file.

---

## HF-1: `TopBar` + `NavTabs` components

**Description**
Top app bar (logo, search icon, notification bell, avatar) and the primary nav row (Home, Friends, Groups, Matches, Profile) directly beneath it.

**Component API**
```ts
interface TopBarProps {
  userInitials: string;
  onSearchClick?: () => void;
  onNotificationsClick?: () => void;
  onAvatarClick?: () => void;
}

interface NavTabsProps {
  active: 'home' | 'friends' | 'groups' | 'matches' | 'profile';
  onChange: (tab: NavTabsProps['active']) => void;
}
```

**Behavior**
- `NavTabs` is presentational only — it does not own routing. Parent decides what happens on `onChange` (in this epic: no-op / console log, since other screens aren't built yet).
- Active tab is bold, `text-primary`; inactive tabs are `text-secondary`.
- Icons: home, users, users-group, calendar-event, user (per mockup).

**Acceptance criteria**
- Keyboard accessible (tabs reachable via Tab key, activated via Enter/Space).
- Active tab has `aria-current="page"`.
- Notification bell and avatar are separate click targets from search.

---

## HF-2: `SportSwitcher` component

**Description**
Horizontal pill row for switching between the user's sport profiles, plus an "Add sport" affordance. This is the primary filter control for the screen — its selected value drives both the feed and the upcoming-matches list.

**Component API**
```ts
interface SportSwitcherProps {
  sports: SportProfile[];       // does NOT include the synthetic "All" entry — component adds it
  active: SportKey | 'all';
  onChange: (key: SportKey | 'all') => void;
  onAddSport: () => void;       // fires when user has < 3 sport profiles and clicks "Add sport"
  maxSports?: number;           // default 3
}
```

**Behavior**
- Renders "All" pill first, then one pill per `sports` entry, then "Add sport" (dashed border) if `sports.length < maxSports`.
- Active pill: `2px solid` accent border (per design system, this is the one approved exception to the 0.5px border rule).
- Each pill shows sport icon + label; icon/color mapping comes from `SportProfile.icon` / `colorRamp`.
- Pills wrap to a second line on narrow viewports rather than overflow/scroll (confirm with design — see Open Questions).

**Acceptance criteria**
- Clicking a pill calls `onChange` with that sport's key; clicking "All" calls `onChange('all')`.
- When `sports.length === maxSports`, "Add sport" is not rendered.
- Component is controlled (no internal state for `active`) — parent owns selection.

---

## HF-3: `PostCard` + `Feed` components

*Build against mock data as specified below to unblock UI work in parallel, but wire to the real `GET /api/posts/feed` endpoint per `sporthub-auth-feed-integration-tickets.md` before this ships — a real feed backend already exists.*

**Description**
`Feed` renders a filtered, scrollable list of `PostCard`s. `PostCard` is a single post: author, sport badge, body text, hashtags, like/comment actions.

**Component API**
```ts
interface FeedProps {
  posts: Post[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>; // for badge icon/color lookup
  onToggleLike: (postId: string) => void;
  onHashtagClick: (tag: string) => void;
}

interface PostCardProps {
  post: Post;
  sport: SportProfile;
  onToggleLike: (postId: string) => void;
  onHashtagClick: (tag: string) => void;
}
```

**Behavior**
- `Feed` filters `posts` by `activeSport` (no filtering when `'all'`) and renders an empty state ("No posts yet for this sport.") when the filtered list is empty.
- `PostCard` header: avatar (initials fallback if no `authorAvatarUrl`), name, relative time (e.g. "2h ago" — use a date lib, don't hand-roll), sport badge pinned right.
- Like button toggles filled/outline heart, optimistically increments/decrements the visible count; calls `onToggleLike(post.id)` so the parent/hook owns the source of truth.
- Hashtags are clickable, call `onHashtagClick(tag)`.
- Comment count is display-only in this epic (no comment thread yet).

**Acceptance criteria**
- Like toggle updates immediately (no perceptible delay) and is reversible.
- Empty state renders correctly per sport filter, including sports with zero posts.
- Relative time recalculates correctly regardless of when the page is viewed (compute from `createdAt`, not a hardcoded string).
- All interactive elements have visible focus states.

---

## HF-4: `UpcomingMatches` (right rail, top block)

**Description**
Card listing the user's upcoming matches/sessions, filtered by the same `activeSport` as the feed. Each match shows sport icon, title, date/time, location, and a join/full CTA.

**Component API**
```ts
interface UpcomingMatchesProps {
  matches: UpcomingMatch[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>;
  onSeeAll: () => void;
  onSelectMatch: (matchId: string) => void;
}
```

**Behavior**
- Header row: "Upcoming" label + "See all" link (routes to the not-yet-built Matches screen — wire as a callback for now).
- Filters `matches` by `activeSport` same as `Feed`; empty state: "No upcoming matches for this sport."
- Each match card CTA reads `"{spotsLeft} spots left, join"` when `spotsLeft > 0`, or `"Full, view details"` when `spotsLeft === 0`. Clicking either calls `onSelectMatch(match.id)` — this epic does not implement the destination screen, just the hook.

**Acceptance criteria**
- List re-filters immediately when `activeSport` changes (shared state with `Feed`, see HF-7).
- Full vs. open visual states are distinguishable without relying on color alone (label text differs, per above).
- Max visible items before scroll/truncation should be capped (recommend 3–4 with "See all" for the rest) — confirm with design.

---

## HF-5: `TrendingHashtags` component

*Real backend already exists: `GET /api/hashtags/trending`. Build against mock data below to unblock UI work, then de-mock per `sporthub-auth-feed-integration-tickets.md` — this is not a future/unscoped backend gap.*

**Description**
Static-ish card listing trending hashtags with post counts.

**Component API**
```ts
interface TrendingHashtagsProps {
  hashtags: TrendingHashtag[];
  onHashtagClick: (tag: string) => void;
}
```

**Behavior**
- Each row: tag (accent color, clickable) left-aligned, post count right-aligned, muted.
- No filtering by `activeSport` in this epic (open question below — mockup currently shows all hashtags regardless of selected sport).

**Acceptance criteria**
- Clicking a hashtag calls `onHashtagClick(tag)`.
- List order is caller-provided (component does not re-sort).

---

## HF-6: `GroupBroadcasts` component

*Real backend already exists: broadcasts are `Post` records with `postType=GROUP_BROADCAST` and an expiring `broadcastEndTime`, served via `GET /api/posts/broadcast` — not a separate entity. Build against mock data below to unblock UI work, then de-mock per `sporthub-auth-feed-integration-tickets.md`.*

**Description**
Card listing recent broadcast messages from groups/clans the user belongs to (owner/admin-only posts, read-only for members).

**Component API**
```ts
interface GroupBroadcastsProps {
  broadcasts: GroupBroadcast[];
  onBroadcastClick: (broadcastId: string) => void;
}
```

**Behavior**
- Each row: group avatar (initials, colored by `colorRamp`), group name + relative time, message text (line-clamp to ~2 lines).

**Acceptance criteria**
- Long broadcast text truncates gracefully (no layout overflow) rather than stretching the card.
- Clicking a broadcast calls `onBroadcastClick`.

---

## HF-7: `HomeFeedPage` — layout, state wiring, data hook

**Description**
Assembles HF-1 through HF-6 into the full screen and owns the state that's shared across components (selected sport, like toggles). This is the integration ticket — do last, once HF-1–HF-6 exist (can build against mocked props/Storybook in the meantime).

**Deliverables**
- `useHomeFeedData()` hook: currently reads from `mockData.ts` (HF-0), returns `{ sportProfiles, posts, upcomingMatches, hashtags, broadcasts, toggleLike }`. Structure it so swapping the internals for a real data-fetching hook (React Query/SWR) later doesn't change the page component's code.
- `HomeFeedPage` component: two-column layout — main column (`Feed`), right rail (`UpcomingMatches` → `TrendingHashtags` → `GroupBroadcasts`, in that order) — plus `TopBar`, `NavTabs`, `SportSwitcher` above.
- `activeSport` state (`useState<SportKey | 'all'>('all')`) lives here and is passed to `SportSwitcher`, `Feed`, and `UpcomingMatches`.

**Layout notes (from mockup)**
- Right rail width ≈ 38% of main content on desktop (`grid-template-columns: 1.6fr 1fr` in the mockup — treat as a starting point, not final spec).
- Below a tablet breakpoint, right rail stacks under the feed (single column). Confirm exact breakpoint with design (mockup was built at a fixed 680px width and hasn't been tested at full desktop or mobile widths).

**Acceptance criteria**
- Changing sport in `SportSwitcher` updates `Feed` and `UpcomingMatches` in the same render pass (no flash of stale content).
- `TrendingHashtags` and `GroupBroadcasts` are unaffected by sport selection (per current mockup behavior — flag if product wants this to change).
- Adding a sport ("Add sport" pill) is wired to a callback only; the add-sport flow itself is out of scope for this epic.

---

## HF-8: Responsive and accessibility pass

**Description**
Mockup was designed at a single fixed width. Before this ships, verify and fix:
- Layout at common breakpoints: mobile (~375px), tablet (~768px), desktop (~1280px+).
- Sport switcher pill wrapping/scrolling behavior on narrow screens.
- Color contrast for all badge/pill text-on-background combinations (sport ramp colors) meets WCAG AA.
- Full keyboard navigation across nav tabs, sport switcher, like buttons, hashtag links, match CTAs.
- Screen reader labels on icon-only buttons (bell, search, avatar).

**Acceptance criteria**
- No horizontal scroll or overflow at any of the three breakpoints above.
- Axe (or equivalent) accessibility scan passes with no critical/serious violations.

---

## HF-11: E2E functional test — Home Feed journey

**Description**
Scripted Playwright flow through the real built Home Feed screen, in the `e2e` project (see `CLAUDE.md`'s testing convention). No MSW needed for this ticket specifically — at this stage every piece of Home Feed (sport switcher, feed, matches, trending, broadcasts) is driven by `mockData.ts` behind the data hooks, not a real network call, so there's no network layer to intercept yet. Once `sporthub-auth-feed-integration-tickets.md` lands and some of these hooks start making real HTTP calls, this test will need MSW handlers added for the now-real pieces — flag that as follow-up work on this ticket rather than scoping it now.

**Journey covered**
1. Load Home Feed — TopBar, NavTabs, SportSwitcher, feed, and all three right-rail blocks render with content.
2. Click a sport pill (e.g. Basketball) — feed and Upcoming Matches both filter to that sport; Trending and Broadcasts stay unchanged.
3. Click "All" — filters clear.
4. Like a post — heart fills, count increments; click again — reverts.
5. Click a hashtag — triggers the expected callback/navigation (whatever HF-5's real behavior is by the time this runs, mock-driven or real).
6. Click an open match's CTA and a full match's CTA — confirm both distinct states are reachable and behave per HF-4's spec.
7. Click "Add sport" when under the 3-sport cap — confirms the callback fires (doesn't need to test the actual add-sport flow, that's a separate future screen).

**Acceptance criteria**
- Runs headless in CI as part of the same Playwright install used for visual regression (`e2e` project, not `visual-regression`).
- Flakiness budget: no `sleep`/arbitrary waits — assert on visible state changes (Playwright's built-in auto-waiting).
- Documented in the ticket itself which steps will need MSW handlers once Auth/Feed Integration lands, so that follow-up isn't lost.

---

## HF-9: QA / acceptance checklist

- [ ] All 5 components (HF-1–HF-6) render correctly in isolation (Storybook or equivalent) with mock data.
- [ ] Sport filter cascades correctly to Feed and Upcoming Matches; Trending and Broadcasts remain unfiltered (confirm this is still the intended behavior at build time).
- [ ] Like toggle is optimistic, reversible, and count math is correct after repeated toggling.
- [ ] Empty states verified for: a sport with zero posts, a sport with zero upcoming matches.
- [ ] Responsive behavior verified at mobile/tablet/desktop.
- [ ] No hardcoded colors — all styling via design tokens/theme so dark mode (if in scope) works for free.
- [ ] HF-11's E2E journey passes in CI.

---

## HF-10a: Visual regression harness setup (do first, Phase 0)

**Description**
Stand up the tooling needed to diff against the mockup before any component work starts, so every subsequent PR can be checked against a real baseline instead of bolting this on at the end.

**Deliverables**
- Playwright is already installed as part of HF-00 — this ticket wires it up specifically for visual regression, with a minimal config that can screenshot a static HTML file.
- Check `design-reference-home-feed.html` into the repo, e.g. under `design-reference/`. It's a frozen, self-contained snapshot of the approved mockup — same markup, layout, and mock data, restyled with literal hex values instead of the app's theme so it renders standalone with no build step. It's a visual reference only, not production code, and should never be imported into the app.
- Write a script/CI job that loads `design-reference-home-feed.html` and captures baseline screenshots at 375px, 768px, and 1280px widths, for these states: default ("All" sport selected), a specific sport selected (e.g. Basketball), and the empty-feed state. Commit these images as the baseline set.
- Note: this planning environment had no headless browser or npm registry access to generate these baseline PNGs directly — that's the first task here, not something pre-done.

**Acceptance criteria**
- `npx playwright test` (or equivalent) runs locally and in CI, producing screenshots from the reference HTML with no app code involved.
- Baseline images are committed and documented (where they live, how to regenerate them if the mockup changes).
- No dependency on any HF-1–HF-7 ticket — this can be built the moment HF-0 is scoped.

---

## HF-10b: Full-page visual regression + CI gate (Phase 3, after HF-7/HF-8)

**Description**
Extend the HF-10a harness to diff the real built page against the same baseline, and make it a required check.

**Recommended process**
1. **Automated pixel diff (primary).** Load the built `HomeFeedPage` route at the same 375/768/1280px widths and same three states used in HF-10a; diff against the committed baseline images; fail CI above an agreed pixel-difference threshold.
2. **Component-level Storybook parity (secondary, do incrementally during Phase 1, not here).** Each component ticket (HF-1–HF-6) should already include a Storybook story per visual state, compared against the corresponding section of the reference HTML during PR review — this ticket just confirms that coverage is complete before closing the epic.
3. **Manual interaction walkthrough.** Open the reference HTML and the built app side by side; step through switching sport profiles, liking a post, clicking a hashtag, clicking a match CTA. Confirm both visuals and callback behavior match each ticket's acceptance criteria.
4. **Token audit.** Grep the implementation for hardcoded hex values or px paddings that should instead reference design tokens/theme — a common way builds silently drift from the reference even when they look right at a glance.

**Acceptance criteria**
- CI fails on unintended visual diffs above the agreed threshold and is a required check on PRs touching this screen.
- PR review checklist includes "compared against `design-reference-home-feed.html`" as a required item.
- All three states (default, sport-filtered, empty) and all three breakpoints are covered.

---

## Suggested folder structure

```
src/features/home-feed/
  types.ts
  mockData.ts
  useHomeFeedData.ts
  components/
    TopBar.tsx
    NavTabs.tsx
    SportSwitcher.tsx
    Feed.tsx
    PostCard.tsx
    UpcomingMatches.tsx
    TrendingHashtags.tsx
    GroupBroadcasts.tsx
  HomeFeedPage.tsx
```

## Out of scope (this epic)
- Real API/backend integration (mock data only).
- Destination screens for Friends, Groups, Matches, Profile nav taps, "See all" matches, hashtag detail, and broadcast detail.
- Add-sport flow (only the entry-point callback is wired).
- Comment thread UI (comment count is display-only).

## Open questions for product/design before HF-7/HF-8
1. Should Trending hashtags and Group broadcasts also filter by the active sport, or stay global? (Current mockup: global.)
2. Exact responsive breakpoints and right-rail collapse behavior on mobile.
3. Cap on visible upcoming matches before "See all" truncates the list.
4. Real icon set / asset source if not using an open icon library (mockup used Tabler icons as placeholders).
