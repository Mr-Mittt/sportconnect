# SportHub client

The rebuilt SportConnect frontend. Conventions live in [`CLAUDE.md`](./CLAUDE.md) (source of truth);
the build order lives in [`docs/BACKLOG_MVP.md`](./docs/BACKLOG_MVP.md).

**Stack:** Vite · React 18 + TypeScript (`strict`) · Tailwind CSS v4 · React Router ·
Vitest + React Testing Library · Storybook · Playwright · pnpm

## Prerequisites

- Node 20.19+ (Node 24 recommended)
- pnpm 10 — `npm install -g pnpm@10` (or `corepack enable pnpm` where corepack is allowed)
- For E2E/visual tests, Playwright browsers: `pnpm exec playwright install chromium`

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Vite dev server on http://localhost:5173 (`/api` proxied to `:8080`) |
| `pnpm build` | Type-check (`tsc -b`) + production build to `dist/` |
| `pnpm test` | Unit/component tests (Vitest, jsdom) — single run |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm lint` | ESLint (includes `jsx-a11y` accessibility rules) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm storybook` | Storybook on http://localhost:6006 |
| `pnpm build-storybook` | Static Storybook build to `storybook-static/` |
| `pnpm e2e` | Playwright functional flows (`e2e/flows/`, starts the dev server itself) |
| `pnpm test:visual` | Playwright visual-regression project (`e2e/visual/`) |

Gradle equivalents (used by CI / the monorepo root build; they download their own pinned
Node + pnpm into `client/.gradle/`): `./gradlew :client:buildClient`, `:client:testClient`,
`:client:start`. The root `./gradlew build` runs `buildClient` too.

## Design tokens

Tailwind v4 theme tokens are defined in [`src/index.css`](./src/index.css) under `@theme`, named
1:1 after the CSS variables in the approved mockup
([`design-reference/design-reference-home-feed.html`](./design-reference/design-reference-home-feed.html)).
**Never hardcode a hex value in a component** — add a token first if one is missing.

| Token | Value | Tailwind usage (examples) |
|---|---|---|
| `surface-0` | `#f7f7f4` | `bg-surface-0` (page background) |
| `surface-1` | `#f1efe8` | `bg-surface-1` (subtle/card) |
| `surface-2` | `#ffffff` | `bg-surface-2` (raised/white) |
| `text-primary` | `#1a1a18` | `text-text-primary` |
| `text-secondary` | `#5f5e5a` | `text-text-secondary` |
| `text-muted` | `#888780` | `text-text-muted` |
| `text-accent` | `#185fa5` | `text-text-accent` |
| `text-danger` | `#a32d2d` | `text-text-danger` |
| `bg-accent` | `#e6f1fb` | `bg-bg-accent` (chips/highlights) |
| `border` | `rgba(44,44,42,.12)` | `border-border` |
| `border-strong` | `rgba(44,44,42,.24)` | `border-border-strong` |
| `border-accent` | `#378add` | `border-border-accent` |
| `teal-50` / `teal-800` | `#e1f5ee` / `#085041` | Football ramp (`bg-teal-50 text-teal-800`) |
| `coral-50` / `coral-800` | `#faece7` / `#712b13` | Basketball ramp |
| `purple-50` / `purple-800` | `#eeedfe` / `#3c3489` | Tennis ramp |

Tailwind's default `teal`/`purple` scales are cleared in `@theme` — only the approved ramp steps
exist, so a stray `teal-500` fails to compile instead of silently drifting from the design.
Sport-ramp assignment rules (which sport gets which ramp, what a 4th sport gets) are in `CLAUDE.md`.

## Testing layers

Four layers, each catching a different kind of problem (details in `CLAUDE.md`):

1. **Vitest + RTL** — logic/behavior; `*.test.tsx` next to the component
2. **Storybook** — one story per visual state; `*.stories.tsx` next to the component; `addon-a11y` runs in the sidebar
3. **Visual regression** — Playwright `visual-regression` project, specs in `e2e/visual/` (see below)
4. **E2E flows** — Playwright `e2e` project, specs in `e2e/flows/` (MSW network mocking arrives with ticket MSW-0)

## Visual regression (HF-10a harness)

Frozen, approved mockups live in [`design-reference/`](./design-reference/) — self-contained HTML
(icon font vendored under `design-reference/assets/`), never imported by app code.
`e2e/visual/reference-home-feed.spec.ts` screenshots the Home Feed reference at **375/768/1280px ×
3 states** (default "All", Basketball selected, empty feed) into committed baselines under
`e2e/visual/__screenshots__/`.

- **Check against baselines:** `pnpm test:visual`
- **Regenerate after an approved mockup change:** `pnpm test:visual --update-snapshots` (commit the
  changed PNGs together with the mockup change — an unexplained baseline diff in review is a red flag)
- Snapshot paths are platform/test-agnostic (`snapshotPathTemplate` in `playwright.config.ts`) so
  HF-10b can diff the real built page against these exact files.
- **Caveat:** rendering differs slightly across OSes; the committed baselines were generated on
  Windows. When CI (Linux) is introduced, regenerate them once in CI and treat that as the canonical
  set. No CI pipeline exists in this repo yet — making this a required check is HF-10b's job.
