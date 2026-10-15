# AUTH-16 · Post-first-login "complete your profile" (country, region, location)

**Status:** `TODO` · **Type:** Feature · **Depends on:** AUTH-14, backend A26, **backend A32** (register claims)

**Filed:** 2026-10-14, from the social-login `/feature`. The Keycloak register page collects the identifier(s), password, name and language only; country, region and location (which `RegisterRequest` collects today) move into the app.

## What

> **Scope change 2026-10-15 (owner, at pickup):** the register page gets the profile fields too, as the old register form had them, instead of everything moving to a post-login step.
> - **Keycloak register page (custom `register.ftl` in `client/keycloak-theme/`):** country, region (dependent select fed by the public `/api/reference/**` endpoints), language, and the old form's **location-detection button** (browser geolocation into hidden latitude/longitude fields). The values travel as user-profile attributes and token claims; the backend half is **A32** (new ticket, `modules/auth/docs/BACKLOG_MVP.md`), so this ticket now depends on A32 as well.
> - **App dialog for first-time social sign-ins** (Google, Facebook, Zalo skip the register page): the same fields (country, region, language, detect-location button) in an app dialog, shown while the profile has no country, via the existing profile endpoint. Password users who filled the register page never see it.
> - **Social data check (part of this ticket):** record what Google, Facebook and Zalo actually return that we can use (name, email, picture, locale; whether any gives country or location) and use what is free.
> - The page layout of the old form (field order and grouping) comes with the custom register page, which also covers the "register layout like the old form" request.
> - **Locked 2026-10-15:** the social dialog is **skippable**, and it carries a notice: setting the zone (country and region) lets the user discover the sport community of their zone, and they can change it any time in Account Settings. The username question (Delta below) stays a later ticket: the step does not ask for one. The ticket is built **after A32** (owner chose to build the backend first).
> - **Handoff from A32 (built 2026-10-15) — what the register page must use:** the Keycloak user-profile attributes are `countryId`, `regionId`, `latitude`, `longitude` (all optional, user-editable at registration; Keycloak rejects a non-integer id and out-of-range coordinates itself). Post them as form fields named `user.attributes.<name>` / the stock `Register` profile-attribute names, as Keycloakify exposes them in `profile.attributesByName`. Values are plain numeric strings (ids; decimal degrees, X = longitude). Language is **not** one of them: the page language links set `locale`, which already reaches the preference. The tokens carry `country_id`, `region_id`, `latitude`, `longitude`; the backend stores them on the first sign-in only and silently drops invalid ones (an unknown country drops the region too; a region not in its country is dropped alone; coordinates need an in-range pair). The realm file already declares the attributes and mappers (`infra/scripts/registration-geo-attributes.mjs`, applied to a running realm by `infra/scripts/apply-registration-geo-attributes.sh`).
> - **When the dialog opens (2026-10-15):** the profile has no country, **or** the country has active regions and no region is set. That is how a value the backend dropped at first sign-in (A32 ignores invalid country/region/location rather than failing the sign-in) reaches the user: no extra signal from the backend. Read it from the profile (`GET /api/users/me`, `useMyProfile`, which returns `countryId`/`regionId`); the `/api/auth/callback` response's `user` is a small map without them (checked in A32). A dropped location or language raises no notice.
> - Still to do in this ticket: en/vi strings (dialog notice included, I18N-4 census row), Storybook states, tests, `E2E_OVERVIEW.md`, Visual-regression expectation line.


> **Delta 2026-10-15 (email as username):** the realm now has `registrationEmailAsUsername: true` (`sportconnect-realm.json`; `dev-keycloak-theme.sh` sets it on an existing dev realm). The register page has no username field and Keycloak stores the email as the username, so `preferred_username` is the email. The backend no longer copies an email-like `preferred_username` into `users.username` (it is shown to other users), so a new user has **no public username** after the first sign-in. Decide here whether this step also lets the user pick one, and what the app shows for a user without one (the same fallback as the existing social-provisioned rows).

- After the first sign-in, a profile-completion step collects country, region and location using the existing `LocationPicker` and profile endpoints, and can be skipped if the product allows.
- **First verify** that the app copes with a user with no location, including Discover (`/discover` is the most important MVP feature): record the check here, and if it does not cope, the missing handling is part of this ticket or a backend ticket filed at once.
- en and vi strings, I18N-4 census row, Storybook states, tests, `E2E_OVERVIEW.md`, and a Visual-regression expectation line.

## Out of scope

Changing how location is stored; the Keycloak pages.

## Done when

A first-time social user lands in the app, is offered the step, and Discover works with and without a location.
