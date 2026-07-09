# AUTH-1 — Login

**Status:** DONE (2026-07-09)
**Spec:** `client/docs/sporthub-auth-feed-integration-tickets.md` § AUTH-1, plus
`client/design-reference/design-reference-login.html` (new mockup, created mid-ticket — see
decisions below)

## Context

Login form and submission flow against `POST /api/auth/login`, per the epic: client-side
validation mirrors the server's, successful login populates `authStore` and redirects to Home
Feed with no reload, failed login shows the server's generic error inline without revealing which
field was wrong.

Unlike HF-1..HF-9, there was no `design-reference-login.html` when this ticket started — the user
created one mid-ticket, after an initial design-token briefing. That mockup became the authoritative
visual spec (per this backlog's own convention: verified reality wins over the epic's original,
narrower text) and materially expanded scope beyond the epic's plain description.

## Decisions confirmed before implementation

The mockup introduced several elements the epic didn't call for, or that conflicted with other
backlog entries. Resolved before building, not assumed:

1. **OAuth buttons (Facebook/Google/Apple):** rendered exactly as the mockup shows, but
   **disabled/non-functional** — `client/CLAUDE.md`'s backlog explicitly defers real OAuth to its
   own future ticket. Visual completeness now, no dead click target, no premature backend
   assumption.
2. **"Forgot password?" link:** **omitted entirely** — `/api/auth/forgot-password` is a
   non-functional backend placeholder (backlog: "building UI against it now would do nothing").
3. **Password show/hide toggle:** the epic assigns this to AUTH-6 (hardening), but the mockup
   shows it as core to the form. Built now, in AUTH-1 — the mockup is the more current source of
   truth, and it's a small, self-contained addition.
4. **Left-panel illustration + "Create an account" link:** built at full fidelity, not simplified.
   The illustration is its own component (`CommunityIllustration`) specifically because AUTH-2's
   Register page reuses the same left panel per the mockup. The `/register` link is wired now even
   though AUTH-2 doesn't exist yet — it's next in the queue, so the dead-link window is short.
5. **Button label:** mockup's prototype-tool placeholder said "Sign in or Sign up" (a combined
   action, left over from the tool's own click-through wiring to a different screen). Since this
   form only performs login, labeled it "Log in" — plain login semantics, register is its own
   screen/link.

## What was built

### Backend — none (AUTH-0 already added the fields this ticket needed)

### New shared primitives

- `src/shared/ui/input.tsx`, `src/shared/ui/label.tsx` (new) — hand-written, not
  CLI-generated. `pnpm dlx shadcn@latest add input label` was tried first but wrote to a broken
  path on Windows (`client/@/shared/ui/*.tsx` — the `@/` alias taken as a literal directory name)
  and pulled in the `radix-ui` meta-package, inconsistent with this repo's existing individual
  `@radix-ui/react-*` dependencies. Removed both, hand-wrote instead, matching `Button`/`Avatar`'s
  existing idiom and the exact mockup styling (border-strong hairline border, border-accent +
  bg-accent 3px focus ring).
- `Button` gained a `primary` variant (`bg-border-accent text-white hover:opacity-90`) — the first
  use of `border-accent`'s color as a fill rather than a border/text accent (the mockup's solid
  blue CTA). Reused the existing token rather than inventing a new one.
- `index.css` gained: `--color-decor-hub` (a deliberately-not-a-sport-ramp accent for the
  illustration's central hub icon — doesn't follow the pink/gray 4th-ramp sequence since it's not
  a real `SportKey`), `animate-float-avatar` keyframe utility, `shadow-card` utility (the elevated
  two-shadow card treatment, distinct from the plain hairline-bordered cards elsewhere), and a
  `border-hairline-r` utility (only `-t`/`-b` existed before).

### A real, pre-existing bug found and fixed: `cn()` silently dropped `border-hairline`

`src/shared/lib/utils.ts`'s `cn()` (built on `tailwind-merge`) didn't know about the custom
`border-hairline`/`-t`/`-r`/`-b` utilities. `tailwind-merge`'s default config bucketed them into
the border-*color* conflict group (pattern-matching the generic `border-X` shape), so any
className combining `border-hairline` with a `border-{color}` utility — which is every real usage
in this codebase — silently dropped `border-hairline` entirely, leaving `border-width: 0`
(invisible). This affected `Button`'s `default`/`outline` variants everywhere they're already
used, not just this ticket's new code — it went unnoticed because `default`'s background fill
still reads as a button regardless of a missing border. AUTH-1's borderless OAuth buttons were the
first place with nothing to mask it.

Fixed by switching to `extendTailwindMerge`, registering the custom utilities under their real
conflict groups (`border-w`/`border-w-t`/`border-w-r`/`border-w-b`). Verified via
`twMerge('border-hairline border-border-strong')` → now correctly keeps both classes (previously
dropped the first).

**Consequence, handled as a separate follow-up (user decision):** this fix is global, so it also
changes Home Feed's already-shipped rendering (previously-invisible borders now show), shifting
layout enough that HF-10b's committed visual-regression baselines are stale. Filed as **HF-13** in
this backlog rather than blocking AUTH-1 on a baseline regen.

### Auth feature

- `src/features/auth/components/CommunityIllustration.tsx` (new) — the left-panel decorative
  illustration, transcribed from the mockup's exact coordinates (earth image, 15 SVG connector
  lines colored by sport ramp + the decor-hub accent, 3 static sport-accent icons, 9 floating
  avatar circles with staggered animation delays). Entirely `aria-hidden` — none of it conveys
  information.
- `src/features/auth/components/LoginForm.tsx` (new) — presentational/controlled per
  `client/CLAUDE.md`. Owns only its own field values and the password-visibility toggle (ephemeral
  UI state). Validation relies on native HTML5 constraint validation (`required`, `type="email"`)
  rather than a hand-rolled validator — the server response is the actual source of truth.
- `src/features/auth/useLogin.ts` (new) — `useMutation` wrapping `POST /auth/login` via the
  existing `apiClient`; unwraps `ApiResponse<AuthResult>`; calls `authStore.setSession()` directly
  on success (callers don't need a separate "now save the session" step); accepts an optional
  `onSuccess(user)` callback so `LoginPage` can trigger the redirect once the session is actually
  populated, not just once the network call resolves.
- `src/features/auth/LoginPage.tsx` (new) — assembles the two-column card; owns the mutation +
  `useNavigate()`-based redirect to `/`.
- `src/App.tsx` — new `/login` route, deliberately **outside** the `AppShell`-wrapped route group
  (no TopBar/NavTabs for a logged-out visitor).
- `src/main.tsx` — wrapped in `QueryClientProvider` (first ticket needing TanStack Query; per
  `client/CLAUDE.md`'s data layer convention, auth is explicitly one of the TanStack-Query-backed
  features).

### New dependencies

`@tanstack/react-query`. (`axios`/`zustand` already existed from AUTH-0.)

### Tests

- `LoginForm.test.tsx` — valid submit, Enter-key submit, empty-password blocks submit (native
  validation), inline error rendering, password-visibility toggle, pending-state disables submit,
  OAuth buttons render disabled, register link points to `/register`.
- `useLogin.test.tsx` — successful login populates `authStore` and calls `onSuccess`; failed login
  surfaces the server's message without touching `authStore`.
- `LoginPage.test.tsx` — renders the form; redirects to `/` once `useLogin` reports success
  (mocks the hook, captures and manually invokes the `onSuccess` callback).
- `App.test.tsx` — new case: `/login` renders outside `AppShell` (no TopBar/NavTabs).
- Storybook: `LoginForm.stories.tsx` (Default/Submitting/Error), wrapped in `MemoryRouter` — the
  first component using `<Link>`, so the first story needing a router decorator.

## Explicitly out of scope

- Register (AUTH-2), session bootstrap (AUTH-3), ProtectedRoute/logout (AUTH-4), refresh-retry
  (AUTH-5) — all separate tickets.
- Wiring TopBar's `userInitials`/avatar to the now-real authenticated user — still not covered by
  any ticket (same gap noted in AUTH-0's summary).
- No new E2E spec added to `e2e/flows/` for this ticket specifically (AUTH-8 owns the full auth
  journey) — verification instead used throwaway Playwright scripts (see Verification), deleted
  after use, not committed.

## Verification

- `pnpm exec tsc -b` — clean.
- `pnpm lint` — clean (two new targeted exceptions: `jsx-a11y/label-has-associated-control` inline
  block-disable in `label.tsx`'s definition, since `htmlFor` only reaches the real `<label>` via
  spread props which the rule can't statically see; `react-hooks/rules-of-hooks` was already
  disabled for `e2e/**` from MSW-0).
- `pnpm test` — 77/77 (existing 69 + 8 new).
- `pnpm build-storybook` — succeeds, `LoginForm.stories` included.
- Manual browser walk (throwaway Playwright scripts, MSW-backed via `e2e/mocks/test.ts`, deleted
  after use): fill + submit + redirect to Home Feed; wrong password shows inline error and stays
  on `/login`; 375px viewport correctly hides the illustration panel and stacks to a single column.
  Screenshots reviewed directly.
- **Real backend verification** (`./gradlew :server:bootRun`, dev profile, existing
  Postgres/Redis containers): registered a real user via `curl`, confirmed the live
  `AuthResponse.user` shape matches `AuthResult`/`User` exactly (including AUTH-0's `avatarUrl`/
  `phoneNumber` fix, live in the actual response), then drove the real `/login` UI against the
  live backend — successful login redirected to Home Feed, wrong password surfaced the exact same
  `"Invalid email or password"` message MSW-0's mock already simulated.
