# HF-00 · Project scaffolding and tooling setup — implementation summary

**Ticket:** HF-00 (`client/docs/BACKLOG_MVP.md` #1, spec in `sporthub-home-feed-tickets.md` § HF-00)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Scaffold the new SportHub client in place in `client/` (old CRA app deleted earlier the same day),
per the HF-00 spec plus three decisions confirmed with the user before implementation:

1. **Package manager: pnpm** (pinned via `"packageManager"` in `package.json`)
2. **Gradle: re-wire the client into the root build** (node-gradle plugin, `./gradlew build` builds the client again)
3. **shadcn/ui: deferred to HF-1** — HF-00 stays pure scaffolding per its written spec

Plan: create-vite react-ts base → curated dependency versions → Tailwind v4 tokens named 1:1 with
the mockup's CSS variables → React Router stub routes → Vitest/RTL + Storybook + Playwright
(two projects) + ESLint/Prettier → README with command + token tables → Gradle wiring.

## What was built

```
client/
  package.json            pnpm@10.34.4; scripts: dev/build/preview/lint/format/test/test:watch/
                          storybook/build-storybook/e2e/test:visual
  vite.config.ts          react + tailwindcss plugins; /api proxy → localhost:8080
  vitest.config.ts        separate from Vite config; jsdom, RTL setup file
  playwright.config.ts    one install, two projects: e2e (e2e/flows/) + visual-regression (e2e/visual/);
                          webServer starts pnpm dev automatically
  eslint.config.js        flat config: ts-eslint + jsx-a11y + react-hooks + react-refresh + prettier
  .prettierrc / .prettierignore / .gitignore (dist, storybook-static, playwright artifacts, .gradle)
  .storybook/             react-vite framework + addon-a11y; preview imports src/index.css
  src/
    index.css             Tailwind v4 @theme with ALL design tokens (see below)
    main.tsx              StrictMode + BrowserRouter
    App.tsx               routes: / → HomeFeedPage; /friends|/groups|/matches|/profile → ComingSoonPage
    App.test.tsx          smoke tests (2)
    test/setup.ts         jest-dom matchers
    features/home-feed/HomeFeedPage.tsx        placeholder (HF-1..HF-7 build the real one)
    shared/components/ComingSoonPage.tsx       + .stories.tsx (placeholder story)
  e2e/flows/smoke.spec.ts e2e/visual/placeholder.spec.ts
  build.gradle            node-gradle 7.0.1, pnpm mode, pinned Node 24.14.0 + pnpm 10.34.4,
                          tasks: start / buildClient / testClient
  README.md               commands (pnpm + Gradle), full token table, testing layers
```

Root changes: `settings.gradle` re-includes `client`; root `build.gradle`'s `subprojects` block
skips `client` (no Java plugin on it — cleaner than the old guard that half-applied Java), and
`build` depends on `:client:buildClient` again.

## Key decisions & divergences from the spec

| Decision | Why |
|---|---|
| **Tailwind v4 (`@theme` in `src/index.css`), not `tailwind.config.ts`** | Spec predates Tailwind v4; v4 is CSS-first and maps the mockup's CSS variables 1:1. Approved as a deviation in Phase 3. **Token classes are `bg-surface-0`, `text-text-primary`, `border-border-strong`** — the `text-`/`border-` doubling is the price of keeping token names identical to the mockup variables. |
| **Default `teal`/`purple` Tailwind scales cleared** (`--color-teal-*: initial`) | Only the approved ramp steps (50/800) exist — a stray `teal-500` fails at build time instead of silently drifting from the design. |
| **Added `bg-accent` token** (`#e6f1fb`) | Present in the reference HTML but missing from the epic's token list. |
| **Vite 7 / TS 5.9 / React 18.3 / ESLint 9** (template offered Vite 8 / TS 6 / React 19 / ESLint 10) | React 18 + `strict` per spec/CLAUDE.md; Vite 7 + TS 5.9 + ESLint 9 because Tailwind's Vite plugin, typescript-eslint, and `eslint-plugin-jsx-a11y` don't yet peer-support the newest majors (jsx-a11y ⟂ ESLint 10 was a hard conflict). |
| **oxlint → ESLint** | Current create-vite template ships oxlint; spec requires ESLint + `eslint-plugin-jsx-a11y` (feeds HF-8). |
| **react-hooks flat preset is `configs.flat.recommended`** | v7 gotcha: `recommended`/`recommended-latest` are both legacy-format and crash ESLint 9 flat config. |
| **pnpm installed via `npm i -g pnpm@10`** | `corepack enable` needs admin rights on this machine (EPERM writing to Program Files). `packageManager` field still pins the version. |
| **pnpm `onlyBuiltDependencies`: esbuild, @tailwindcss/oxide** | pnpm 10 blocks postinstall scripts by default; these two need theirs. |

## Verification (all passing)

- `pnpm lint` — clean (after the react-hooks preset fix above)
- `pnpm test` — 2/2 (App routing smoke tests, jsdom)
- `pnpm build` — `tsc -b` + Vite build OK (~180 kB JS gzip 59 kB)
- `pnpm exec playwright test` — 2/2 across both projects (`e2e` + `visual-regression`), Chromium, dev server auto-started; this also covered the browser happy-path walk (/, /friends)
- `pnpm build-storybook` — builds with addon-a11y; placeholder story renders
- `./gradlew :client:buildClient` — run as final check (downloads pinned Node/pnpm on first use)

## Follow-ups for later tickets

- **HF-1:** shadcn/ui init (deferred by decision above); restyle to tokens on arrival
- **HF-0/HF-10a:** unblocked — types/mock data and the visual-regression harness can start now
- Any HF ticket text mentioning `tailwind.config.ts` should read "the `@theme` block in `src/index.css`"

---

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
