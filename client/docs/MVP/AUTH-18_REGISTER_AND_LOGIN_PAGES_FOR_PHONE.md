# AUTH-18 · Register and login pages for a phone number (Keycloak theme)

**Status:** `TODO` · **Type:** Enhancement (theme) · **Depends on:** auth A27 (done: the Keycloak extension and realm rules); auth A22 for what a phone-only user can do about recovery (decide before this ships) · **Gates:** phone-only sign-up and phone sign-in being usable by a person

**Filed:** 2026-10-16, from auth A27. The realm now enforces a unique phone, normalises it, accepts it as a sign-in identifier and accepts a phone-only registration; the pages still only know the email.

## What

The Keycloakify theme (`client/keycloak-theme`) shows what the realm now allows. Everything below is en and vi, with a Storybook story per state and the theme's a11y and visual checks.

- **Register.** Add an "Email or phone number" way in: the existing email field stays, a phone field is added (optional when an email is given), and the page does not require an email in the browser any more (the submit button is disabled until every required field is filled, which today includes the email). At least one of the two must be filled. The page still sends **no `username`**: the server fills it (the email, else the canonical phone), and `Register.tsx` hides the `username` attribute the realm now lists (A27 did that hide so the page did not regress). The hint under the phone field says a number without a country code is read as Vietnamese.
- **Errors.** The realm returns two new message keys, `phoneNumberAlreadyUsed` and `emailOrPhoneRequired`; the extension JAR ships en and vi text for them, but the theme should own the wording and place them under the right field (`messagesPerField` for `phoneNumber` and `email`).
- **Login.** The username field's label is "Email" (auth A35, 2026-10-18; it was "Username or email" after A27). Change it to "Email or phone number" (and its placeholder and `autocomplete`), because the browser flow now accepts a phone number.
- **Unparseable phone.** The realm never refuses a phone for its format: a number that does not parse is saved as typed and the backend marks it `INVALID` (U25). Account Settings already shows a hint for that; the register page should not promise otherwise.

## Out of scope

Phone verification (auth A33), recovery for accounts with no email (auth A22), the account page, providers (A29).

## Tests

Storybook stories for the register page with phone-only, email-only and both, and the two error states; the `keycloak-e2e` job (`client/e2e/keycloak/redirect.spec.ts`) gains a phone-only registration and a sign-in by phone. Visual baselines for the changed register and login stories come from the `update-baselines` dispatch.
