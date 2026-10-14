# AUTH-16 · Post-first-login "complete your profile" (country, region, location)

**Status:** `TODO` · **Type:** Feature · **Depends on:** AUTH-14, backend A26

**Filed:** 2026-10-14, from the social-login `/feature`. The Keycloak register page collects the identifier(s), password, name and language only; country, region and location (which `RegisterRequest` collects today) move into the app.

## What

- After the first sign-in, a profile-completion step collects country, region and location using the existing `LocationPicker` and profile endpoints, and can be skipped if the product allows.
- **First verify** that the app copes with a user with no location, including Discover (`/discover` is the most important MVP feature): record the check here, and if it does not cope, the missing handling is part of this ticket or a backend ticket filed at once.
- en and vi strings, I18N-4 census row, Storybook states, tests, `E2E_OVERVIEW.md`, and a Visual-regression expectation line.

## Out of scope

Changing how location is stored; the Keycloak pages.

## Done when

A first-time social user lands in the app, is offered the step, and Discover works with and without a location.
