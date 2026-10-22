# AUTH-16 · Post-first-login "complete your profile" (country, region, location)

**Status:** `TODO` · **Type:** Feature · **Depends on:** AUTH-14, backend A26

**Filed:** 2026-10-14, from the social-login `/feature`. The Keycloak register page collects the identifier(s), password, name and language only; country, region and location (which `RegisterRequest` collects today) move into the app.

## What

> **Delta 2026-10-15 (email as username):** the realm now has `registrationEmailAsUsername: true` (`sportconnect-realm.json`; `dev-keycloak-theme.sh` sets it on an existing dev realm). The register page has no username field and Keycloak stores the email as the username, so `preferred_username` is the email. The backend no longer copies an email-like `preferred_username` into `users.username` (it is shown to other users), so a new user has **no public username** after the first sign-in. Decide here whether this step also lets the user pick one, and what the app shows for a user without one (the same fallback as the existing social-provisioned rows).

- After the first sign-in, a profile-completion step collects country, region and location using the existing `LocationPicker` and profile endpoints, and can be skipped if the product allows.
- **First verify** that the app copes with a user with no location, including Discover (`/discover` is the most important MVP feature): record the check here, and if it does not cope, the missing handling is part of this ticket or a backend ticket filed at once.
- en and vi strings, I18N-4 census row, Storybook states, tests, `E2E_OVERVIEW.md`, and a Visual-regression expectation line.

## Out of scope

Changing how location is stored; the Keycloak pages.

## Done when

A first-time social user lands in the app, is offered the step, and Discover works with and without a location.
