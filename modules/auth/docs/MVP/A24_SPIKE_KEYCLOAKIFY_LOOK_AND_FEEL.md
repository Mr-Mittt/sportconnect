# A24 · Spike: build our `/login` look as a Keycloakify theme (condition of the A23 go)

**Status:** `TODO` · **Type:** Spike / design decision · **Depends on:** A23 (done) · **Gates:** the Keycloak implementation tickets and the final choice of hosted pages over the password-grant hybrid

**Filed:** 2026-10-14, as the condition attached to A23's conditional go.

## Why

A23 proved hosted pages are viable (build, providers, no-email Zalo, code + PKCE) but rendered only the stock Keycloakify theme. "Hosted pages in our look" was **not** tested, and it is the main reason for choosing hosted pages over the hybrid.

## What

Reusing the A23 setup (Keycloak 26 in Compose, Keycloakify v11 starter, Maven on PATH), build the real thing for the login page and measure:

1. Match `client`'s `/login` (`LoginForm`, `AuthShell`) using our design tokens (Tailwind v4 `@theme` in `client/src/index.css`, shadcn primitives). Compare a shared package against copy-paste and name the drift risk of each.
2. The Google, Facebook and Zalo buttons (Zalo icon by `alias`), the register page, and the en/vi inline translations for the pages we use (A23: Vietnamese is not shipped).
3. The pages A23 did not cover: reset-password, update-password, verify-email, OTP, required-action handling.
4. Storybook for the theme pages, and what AUTH-13's auth-screen baselines become.
5. Effort in days for the full set of pages, to compare with keeping our screens (the hybrid).

## Out of scope

Production deployment (INFRA-12), the production implementation, user migration, a custom unique-phone validator or phone login (decided in the `/feature` design, Phase 3).

## Done when

A go / no-go for "hosted pages in our look" with the measured effort. **No-go → the hybrid** is chosen and recorded in A23.
