# SportHub — project conventions

This file is read automatically at the start of every Claude Code session in this repo. It exists so that every new page (Home Feed, Groups, Matches, Profile, Friends, onboarding, and whatever comes after) is built the same way, without re-explaining these decisions each time. Treat it as the single source of truth for "how we do things here" — if a ticket or a person says something different, this file wins unless it's explicitly updated.

## What this app is

A multi-sport social app. After signup, a user picks up to 3 sports and gets a sport profile for each. From there they find friends per sport, join groups/clans, find or create matches/sessions, and manage groups they own. See `sporthub-home-feed-tickets.md` for the first fully-specified screen (Home Feed) — it's the reference implementation for how a screen should be broken down and built.

## Important: existing backend, rebuilt client

This is **not** a greenfield project. There is an existing, substantial Java/Spring Boot backend (Gradle multi-module monorepo under `modules/`) that is staying as-is. The `client/` React app is being **dropped and rebuilt from scratch** on the stack below — do not reuse code from the old client, but do integrate against the real backend APIs it already exposes wherever they exist. Don't invent a parallel mock API contract for something the backend already serves for real.

### Backend modules that already exist (do not rebuild these)

| Module | Status | Notes |
|---|---|---|
| `auth` | Complete | Custom JWT (Spring Security), chosen deliberately over Keycloak — see `modules/auth/docs/KEYCLOAK_VS_CUSTOM_AUTH.md`. Endpoints: register, login, logout, refresh, forgot/reset password, verify-email, OAuth2 Google/Facebook scaffolding. |
| `user` | Complete | User entity, roles, preferences. |
| `social` (post + group) | Complete | Full group CRUD, membership, roles, join requests, settings, permissions (24 endpoints). Paginated feed with likes and comments (`/posts/feed`, `/posts/group/{id}`, like/unlike, delete, comments). This is production-ready — the new client should call these endpoints for real, not mock them. |
| `sport` | Partial | `Sport` and `UserSportProfile` entities, repositories, and services exist — this is exactly the "sport profile" concept the Home Feed sport switcher needs — **but the REST controller was never built** (tracked as "Phase 4, pending" in `modules/sport/docs/PHASE_3_SPORT_MODULE_SUMMARY.md`). The sport switcher cannot call a real API until `SportController` exists. This is a backend ticket, not a frontend one — flag it, don't silently mock around it forever. |

### Backend gaps — genuinely new, nothing exists yet

Matches/sessions/tournaments, trending hashtags, and group broadcasts (all three from the Home Feed mockup's right rail) have **no backend module at all**. These need real scoping (schema, entities, endpoints) as backend work, not just frontend mock data forever. Until that scoping happens, the client builds these against `mockData.ts` per the data layer convention below, behind a hook boundary that can swap to a real API later without touching components.

### Auth token storage — being fixed, not carried over

The old client stored both the access token and refresh token in `localStorage` (readable by any injected script — an XSS exposure). The project's own `AUTHENTICATION_DESIGN.md` already specifies the right approach, and the new client follows it: **access token held in memory only** (never persisted — lost on refresh, reacquired via the refresh flow), **refresh token in an httpOnly cookie**. This requires a small backend change too: `auth-impl`'s login/refresh endpoints currently return `refreshToken` in the JSON response body — they need to instead set it via `Set-Cookie: httpOnly` and stop returning it in the body. Track this as a backend ticket alongside the frontend auth work; the new client's auth code should assume the cookie-based contract from the start rather than being built against the old body-based one and patched later.

## Tech stack (new client, applies to the whole app, not just Home Feed)

| Concern | Choice |
|---|---|
| Backend | Existing Java/Spring Boot, Gradle multi-module (`modules/auth`, `modules/user`, `modules/sport`, `modules/social`) — unchanged, integrate against it |
| Build tool | Vite |
| Framework | React 18 + TypeScript, `strict: true` |
| Routing | React Router (client-side) |
| Styling | Tailwind CSS |
| UI primitives | shadcn/ui (Radix-based, copied into the repo, restyled via our tokens) |
| Cross-page/client state | Zustand — current user, active sport profile, UI-only state |
| Server state | TanStack Query — posts, groups, matches, hashtags; wraps calls to the real backend endpoints listed above |
| Data fetching from hooks | Explicit `{ data, isLoading, isError }` from every `use<Feature>Data()` hook — matches what `useQuery` returns natively |
| Unit/component tests | Vitest + React Testing Library + `@testing-library/jest-dom` |
| Component workshop | Storybook (Vite builder), `addon-a11y`, `addon-interactions` |
| E2E + visual regression | Playwright — one config, two projects: `visual-regression` (screenshot diffing) and `e2e` (functional flows) |
| E2E network layer | Mock Service Worker (MSW) — E2E never hits the real backend; handlers mirror the documented API contracts |
| Icons | Tabler icons, outline style only |
| Package manager | pnpm (decided at HF-00 — pinned via `packageManager` in `package.json`; don't mix in npm/yarn) |

Don't introduce a second styling system, a second test runner, or a second icon set for a new page "because it was faster." If the stack above genuinely doesn't fit a new requirement, that's a conversation to have and record here, not a silent per-page exception.

## Design tokens — the actual source of truth

Every screen's colors, spacing, and type styles come from the Tailwind theme — defined in the `@theme` block of `src/index.css` (Tailwind v4 is CSS-first; there is no `tailwind.config.ts`) — which mirrors the CSS variables used in every approved mockup / `design-reference-*.html` file:

- Surfaces: `surface-0` (page bg), `surface-1` (subtle/card), `surface-2` (white/raised)
- Text: `text-primary`, `text-secondary`, `text-muted`, `text-accent`, `text-danger`
- Borders: `border`, `border-strong`, `border-accent`
- Sport ramps (see below)

**Never hardcode a hex value or an arbitrary Tailwind color in a component.** If a mockup uses a color that doesn't have a token yet, add it to the theme config first, then reference the token — don't inline it. This is the single biggest way implementations silently drift from approved designs over time, and it's exactly what HF-10's visual regression check is there to catch, so don't make that check do more work than it needs to.

shadcn/ui components get restyled to these same tokens when they're added to the repo — don't leave them on shadcn's default palette.

### Sport color ramps

Each sport gets one consistent color, used everywhere that sport shows up (badges, pills, avatars, icons) across every page:

| Sport | Ramp | Light bg / text |
|---|---|---|
| Football | teal | `teal-50` / `teal-800` |
| Basketball | coral | `coral-50` / `coral-800` |
| Tennis | purple | `purple-50` / `purple-800` |

When a 4th sport is added, assign it the next ramp from this priority order: `pink`, then `gray`. Do not reach for `blue`, `green`, `amber`, or `red` for a sport — those are reserved app-wide for semantic meaning (accent/info, success, warning, danger respectively) and reusing them for a sport would make a badge look like a status indicator by accident.

## Folder structure convention

One folder per feature/page under `src/features/`, following the exact pattern already used for Home Feed:

```
src/features/<feature-name>/
  types.ts              # TypeScript models for this feature
  mockData.ts            # mock data matching types.ts — only for features with no real backend yet (matches, hashtags, broadcasts, sport profiles until SportController ships)
  use<Feature>Data.ts     # hook wrapping TanStack Query (or, temporarily, the mock file); returns { data, isLoading, isError } either way
  components/
    <ComponentName>.tsx
    <ComponentName>.stories.tsx
    <ComponentName>.test.tsx
  <Feature>Page.tsx       # assembles the components, owns page-level state, wires the data hook
```

Shared, cross-page pieces (`TopBar`, `NavTabs`, `SportSwitcher`, design tokens, shadcn primitives, the Zustand store) live in `src/shared/` or `src/app/`, not duplicated per feature. Every page reuses the same `TopBar` + `NavTabs` shell — don't let a new page quietly rebuild its own version of either.

## Component conventions

- Components are presentational and controlled: they receive data and callbacks as props, they don't own state that other components need to react to. Page-level components (`<Feature>Page.tsx`) own shared state and pass it down — this is the pattern HF-1 through HF-7 already follow, keep using it.
- Naming: components are `PascalCase`, hooks are `camelCase` prefixed with `use`, files match the export name.
- Build on shadcn/ui primitives (Button, Card, Avatar, Badge, Dialog, etc.) rather than hand-rolling each one per feature — restyle via tokens, don't fork the behavior.
- Every interactive element (button, pill, link) is reachable by keyboard and has a visible focus state — not a per-page decision, a baseline requirement everywhere.
- Icon-only buttons always get `aria-label`. Decorative icons always get `aria-hidden="true"`.

## Data layer convention

All data access goes through a `use<Feature>Data()` hook, never a direct import of `mockData.ts` into a component, and never a direct `fetch`/`axios` call from inside a component. For features backed by a real endpoint today (auth, posts, groups), the hook wraps **TanStack Query** against the real API. For features with no backend yet (sport profiles until `SportController` ships, matches, trending hashtags, group broadcasts), the hook reads `mockData.ts` but returns the exact same `{ data, isLoading, isError }` shape — so swapping the internals later is a non-event for every component that consumes the hook.

The split: **Zustand owns client/UI state** (current user identity/session flag, active sport profile), **TanStack Query owns server state** (posts, matches, groups, hashtags). Don't put fetched server data into the Zustand store, and don't put server state's loading/error flags anywhere but the query itself.

## Cross-page state (Zustand)

Global concerns that multiple pages need — the active sport profile, the current user/session, anything like unread counts or notification state — live in a Zustand store under `src/app/store.ts` (or split into small stores per concern if it grows). Page-local state (a form's current input, whether a modal is open) stays local `useState`/`useReducer` inside that page — don't put everything in the global store by default.

**Update (2026-07-25, reverses the original guidance below):** each page's active sport pill is its own independent Zustand store (`homeFeedStore` for Home Feed, `groupsPageStore` for the Groups page — both `sessionStorage`-persisted, same "restore my view on reload" scope), not one value shared across pages. This was tried the other way first (a single shared `activeSport` in one store, per the struck-through paragraph below) and caused a real bug: switching sport on one page could silently change what the other page was showing, purely because they read/wrote the same field. A page that needs to hand off to another page's state does so explicitly (e.g. Home Feed's `goToGroup` calls the Groups page's own `selectGroup` directly when navigating there from a group post link) — that's a deliberate one-off write into the *other* page's state, not a sign the two share a value day-to-day.

~~The active sport profile in particular should live in the global store, not page-local state, from the point a second page needs it. Home Feed's HF-7 ticket currently specifies `activeSport` as local page state; when the next page (Groups or Matches) is scoped, move it into the shared store so switching sport profile in one place is reflected everywhere, rather than resetting per page.~~

## Auth conventions (new client)

- Access token: held in memory only (e.g. a module-level variable or a non-persisted store slice) — never written to `localStorage` or `sessionStorage`. Lost on hard refresh by design; the app re-acquires it via the refresh flow on load.
- Refresh token: never touched by JavaScript — it lives in an httpOnly cookie set by the backend, sent automatically by the browser.
- `ProtectedRoute` wraps any route requiring a logged-in user, checks the in-memory auth state (and triggers a refresh-flow check on app load), and redirects to `/login` if that fails.
- This depends on the backend change described above (cookie-based refresh instead of body-based) — don't build the new client's auth flow against the old body-based contract.

## Accessibility baseline (every page, not a one-time pass)

- Keyboard-navigable, visible focus rings, `aria-current="page"` on active nav items.
- Color is never the only signal for state (e.g. "full" vs "open" match uses different label text, not just a color change).
- Contrast on every token combination meets WCAG AA — check this when adding a new token, not just at the end of a feature.

## Testing & design verification convention

Four layers, each catching a different kind of problem — don't collapse them into each other:

1. **Unit/component tests** (Vitest + React Testing Library): logic and behavior in isolation — does this hook return the right shape, does this button call the right callback. Live next to the component they test.
2. **Storybook**: one story per meaningful visual state of every component (active/inactive, liked/unliked, full/open, loading, error, empty). Human-reviewed during development, and where `addon-a11y` catches accessibility issues early.
3. **Visual regression** (Playwright, `visual-regression` project): each new screen gets its own frozen `design-reference-<page-name>.html` (same approach as `design-reference-home-feed.html`) checked into `design-reference/`, screenshotted at 375/768/1280px, diffed against the real built page in CI.
4. **E2E functional tests** (Playwright, `e2e` project, network mocked via MSW): scripted user journeys through the real running app — login, view feed, like a post, switch groups, and so on. MSW intercepts network calls with handlers that mirror the documented API response shapes exactly (see `sporthub-auth-feed-integration-tickets.md` for the real DTOs those handlers are built from), so these tests run fast and deterministically without a live backend in CI.
   - **Known limitation, accept consciously**: MSW passing does not prove the real backend still matches its documented contract. If a backend endpoint's shape changes, these tests can stay green while production breaks. Re-verify MSW handlers against the real backend response shapes periodically (e.g. before a release), not just when a test starts failing.
   - E2E test files live under `e2e/flows/`; visual-regression specs live under `e2e/visual/` — same Playwright install, same config, separate `testDir`/project per purpose.

A screen doesn't ship without: Storybook coverage of its components, a passing visual-regression check against its reference HTML, an E2E flow covering its critical user journey, and a keyboard/screen-reader pass.

## Ticket-writing convention for new pages

When scoping a new page, break it down the same way `sporthub-home-feed-tickets.md` does:

1. Shared types + data hook for that feature (real API via TanStack Query if the backend already serves it, mock data behind the same hook shape if not) — parallel with visual-regression harness setup, if not already done globally.
2. Presentational components, one ticket each, buildable in parallel once types exist.
3. Page-level integration ticket: layout, shared state wiring, the data hook.
4. Hardening ticket: responsive behavior + accessibility + full visual regression.
5. QA/acceptance checklist ticket.

Reuse this shape rather than inventing a new breakdown structure per page — consistency in how tickets are scoped is as important as consistency in how the UI looks. And before scoping a new page, check whether its backend already exists under `modules/` — don't assume mock-data-first by default the way the original Home Feed tickets did, now that we know a real backend is there for auth, posts, and groups.
