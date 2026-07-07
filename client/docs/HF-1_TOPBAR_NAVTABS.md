# HF-1 · TopBar + NavTabs — implementation summary

**Ticket:** HF-1 (`client/docs/BACKLOG_MVP.md` #4, spec in `sporthub-home-feed-tickets.md` § HF-1)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Build the cross-page shell components in `src/shared/` (per the backlog delta — not the home-feed
feature folder), with three decisions confirmed in Phase 1:

1. **Icons: `@tabler/icons-react`** — becomes the app's single icon source (Tabler outline, per
   `client/CLAUDE.md`).
2. **shadcn/ui foundation lands here** (deferred from HF-00): `cn()` util + Button + Avatar
   primitives, hand-written in shadcn idiom (cva variants, Radix, Slot) and **token-styled from the
   start** — not CLI-generated, since the registry output would need full restyling anyway. A
   `components.json` + `@/ → src/` path alias (tsconfig, Vite, Vitest) were added so future tickets
   *can* use the shadcn CLI.
3. **AppShell wired now** (the epic's "onChange is a no-op" predates HF-00's real stub routes):
   a React Router layout route rendering TopBar + NavTabs above `<Outlet/>` in the mockup's 960px
   frame. NavTabs stays controlled/presentational — AppShell derives `active` from the URL and
   turns `onChange` into `navigate()`.

## What was built

```
src/shared/
  lib/utils.ts               cn() (clsx + tailwind-merge)
  ui/button.tsx              variants: default / outline / ghost; sizes: default / sm / icon;
                             focus ring via border-accent tokens; asChild via Radix Slot
  ui/avatar.tsx              Radix Avatar; 28px default (mockup top-bar size);
                             fallback = bg-bg-accent / text-text-accent initials
  components/TopBar.tsx      logo + search/bell icon Buttons + avatar button — three separate,
                             individually aria-labelled click targets   (+ stories + tests)
  components/NavTabs.tsx     5 controlled tabs, active = font-medium text-text-primary +
                             aria-current="page", native <button> keyboard semantics   (+ stories + tests)
  components/AppShell.tsx    layout route: TopBar (userInitials "BN" placeholder until AUTH-0) +
                             NavTabs + Outlet in max-w-frame
src/App.tsx                  routes moved under the AppShell layout route
src/index.css                NEW design-system pieces (see below)
components.json              shadcn CLI config (aliases → src/shared/*)
e2e/flows/smoke.spec.ts      now navigates by clicking tabs, not page.goto
```

## New design-system pieces (added to `src/index.css`, reuse in HF-2..HF-6)

| Piece | Value | Usage |
|---|---|---|
| `border-hairline` (`@utility`) | `border-width: 0.5px` | The design's hairline borders everywhere — don't write `border-[0.5px]` inline. The SportSwitcher's 2px active border is the one approved exception. |
| `--container-frame` | `60rem` (960px) | `max-w-frame` — the mockup's centered content frame |
| `--text-2xs` | 11px | Badges/counts (mockup uses an 11px step Tailwind lacks) |
| `--text-2sm` | 13px | Nav labels, buttons, most secondary text |

## Key decisions & gotchas

- **RTL cleanup:** Vitest runs without globals, so React Testing Library can't auto-register its
  cleanup — the DOM accumulated across tests within a file until `cleanup()` was added to
  `src/test/setup.ts`'s `afterEach`. Any future test file gets this for free; don't remove it.
- **`buttonVariants` is not exported** — exporting it alongside the component trips
  `react-refresh/only-export-components`. Export it from a separate file if a future ticket needs it.
- Avatar initials "BN" are hardcoded at the AppShell level only (matches the mockup); AUTH-0's
  store replaces it.

## Verification (all passing)

- `pnpm lint` · `pnpm test` (13/13 — component + integration incl. keyboard operability and
  aria-current) · `pnpm build` · `pnpm e2e` (click-through navigation) · `pnpm build-storybook`
  (TopBar ×1, NavTabs ×2 stories)
- Dev-server walk: screenshotted `/` and `/groups` against the reference mockup — layout, icon set,
  avatar chip, and hairline border match; active-tab styling verified by computed style
  (`#1a1a18`/500 + `aria-current="page"` active; `#5f5e5a`/400 inactive).
