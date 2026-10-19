# A29 · Social provider: Google (Facebook and Zalo moved to A34)

**Status:** `DONE` (2026-10-19; started 2026-10-18; A35 done) · **Type:** Feature · **Depends on:** A35, A26, INFRA-13 (real provider credentials from the owner) · **Gates:** client AUTH-15 shows the buttons

**Filed:** 2026-10-14, from the social-login `/feature`.

**Scope change 2026-10-18 (owner decision):** this ticket now enables **Google only**. Facebook and Zalo moved to **A34** and are postponed, because getting their app permissions is hard (Facebook app review for email, Zalo app approval). The original wording below is kept for A34; read every Facebook / Zalo bullet as moved.

**Scope change 2026-10-19 (owner decision):** when a Google sign-in matches an existing, not yet linked account, the user is told plainly that they already signed up with this email and chooses how to prove it: **verify by email** (a link is emailed to the existing account, clicking it links Google) or **sign in with the password** (which also links Google). This is Keycloak's existing-account step (A35 routes the match there); the new work is the en/vi wording and the themed pages (link confirmation, email-sent, password), not new logic. Never a silent link: with verification off (A33) an unverified pre-registered account could otherwise be taken over. After A33, auto-linking on a verified existing email can be reconsidered.

## What (Google only)

- Google as a built-in identity provider in the `sportconnect` realm, set through the admin API script and mirrored in `sportconnect-realm.json` without any secret.
- Linking policy: auto-link only on a provider-verified email (Google gives `email_verified`), never by phone. The existing-account lookup uses `email_normalized` (**A35**: `bao.nguyen.dangit@gmail.com` and `bao.nguyendangit@gmail.com` are the same Gmail, a match goes to the existing-account confirmation, never a silent link); this ticket only turns Google on and checks it end to end. **Create the provider without a `firstBrokerLoginFlowAlias`** so it uses the realm binding `sportconnect first broker login` (A35 verified this on a stub provider).
- A social login of a deactivated account reactivates it (the A26 rule), checked for Google.
- Re-check first-broker-login with the A27 validators (`sc-email-or-phone`, `sc-unique-phone`, username filler), which A27 did not exercise with a real provider.
- Document how the owner creates the Google OAuth client and which redirect URI to register.
- The existing-account page (scope change 2026-10-19): en/vi wording that says the user already signed up with this email, with the two ways to continue (verify by email, sign in with the password); check the theme styles the link-confirmation, email-sent and password pages, and the emailed link text.
- The Google OAuth client must have the dev redirect URI `http://localhost:8081/realms/sportconnect/broker/google/endpoint` (the client file only lists :8080).
- `.gitignore` covers `infra/keycloak/providers/client_secret_*.json`; the script reads the client id and secret from env vars or that file, and skips the provider when neither exists.

## Original wording (Google + Facebook + Zalo; Facebook and Zalo now A34)

- Google and Facebook as built-in identity providers; **Zalo as a generic OIDC/OAuth provider**. First check Zalo's real claims and whether it returns a phone or an email (A23 only used a stand-in).
- Linking policy: auto-link only on a provider-verified email, **never by phone**; the Zalo no-email path ends on the profile page when neither identifier exists (A27's validator, or A26's fallback).
- Social login of a deactivated account reactivates it (the A26 rule), covered for each provider.
- Apple and GitHub are not configured.
- Realm settings land in the INFRA-13 import (no secrets in the repo); document how the owner creates each provider app and which redirect URIs to register.

## Out of scope

Unlinking a provider, contact import, the mobile app, the buttons themselves (the theme, AUTH-15).

## Done when

A real Google login works locally and is recorded here (or marked **not verified** rather than assumed). Facebook and Zalo are done in A34.

## Built (2026-10-19)

Approved plan, as built, with one revision after the first review (see **Second scope change** below):

- **Provider script.** `infra/scripts/realm-google-provider.mjs` (`api` and `file` modes) + `apply-realm-google-provider.sh`. The
  Google OAuth client comes from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` or the git-ignored
  `infra/keycloak/providers/client_secret_*.json` (`.gitignore` rule added); with neither the provider is not touched.
  Provider `google`: scopes `openid email profile`, `trustEmail: false`, **no `firstBrokerLoginFlowAlias`** (the realm
  binding, the A35 flow, applies; an old value naming another flow is reset). The same run sets the realm attribute
  `actionTokenGeneratedByUserLifespan.idp-verify-account-via-email` to 1800 s (Keycloak's 5 minutes is too short to open a
  mailbox and come back). The realm file gets a **disabled** `google` with placeholder credentials plus that attribute.
- **Second scope change (2026-10-19, user review of the first build).** Keycloak's stock existing-account page showed
  "Review profile" and "Add to existing account", which users could not tell apart, and its email-first order sent a
  mail before the user chose. Replaced by a custom step, `sc-link-existing-account` (`LinkExistingAccountAuthenticator` in the
  extensions JAR, built on Keycloak's own email-verification step and its password check), which takes the place of "Confirm
  link existing account" and the "Account verification options" subflow in the `sportconnect first broker login` flow
  (`infra/scripts/realm-link-existing-account.mjs`, `apply-realm-link-existing-account.sh`; mirrored in the realm file):
  - **One page** (`login-idp-link-confirm`): radio **Use my password** (default; enables the password field) and radio
    **Verify by email**, then **Continue**. Only the options the account has are shown (no password credential: email only;
    no SMTP or email: password only). A wrong password re-renders the page with the error (brute-force protection and login
    events as for any sign-in) and links nothing.
  - **Email sent page** (`login-idp-link-email`): "check your mailbox", **Resend** (disabled with a 60 s countdown; the server
    refuses an earlier resend too) and **Back to log in**, which restarts the flow with the account's email pre-filled
    (`login_hint`). The link in the email is Keycloak's stock action token (30 min), so a link opened in another browser works.
  - Either proof ends the step with the existing user set; Keycloak links the identity after it, never before.
  - The stock "Conditional 2FA" of the re-authentication is gone with the subflow: the realm has no second factor today; if
    one is enabled later, this step must ask for it (it checks the password only).
- **Theme.** `LinkConfirm.tsx` and `LinkEmailSent.tsx` (own pages, `KcContext` extended with the `scLink` attributes the step
  sets), en + vi keys `link*` (theme-defined) and the vi strings of the pages that still render (override, action, success).
  The stock keys of the replaced pages were dropped from `messages_vi.ts` and `stockKeys.ts`. Stories: `LinkAccountConfirm`,
  `LinkAccountEmailOnly`, `LinkAccountWrongPassword`, `LinkAccountEmailSent`, `LinkAccountEmailSentCanResend`.
- **Third change (2026-10-19, found by the owner's first manual run): the emailed link finishes the login in a new tab.**
  Root cause: the client kept the PKCE verifier and `state` in `sessionStorage`, which is per tab. The link in the email opens a
  new tab, Keycloak links Google and redirects that tab to `/auth/callback?code=…`, the tab has no verifier, and the callback showed
  `AUTH_CODE_INVALID` ("Your sign-in link expired or was already used") although the link had worked (Google was linked; "Try again"
  signed in through the existing Keycloak session). Fix (client, `features/auth/pkce.ts`): one `localStorage` entry per login attempt
  keyed by its `state` (`sportconnect.pkce.<state>`), read once by the callback in any tab of the browser. **Expiry 35 minutes**, longer
  than the 30 minute link and Keycloak's 30 minute login timeout, so a link opened in minute 29 still works; expired entries are swept
  on the next save. Closing the original tab changes nothing (the entry is in the browser, not the tab). Not covered: the link opened
  in a different browser or device (Keycloak then shows its own "return to your original browser" page and the original tab has to be
  used). The verifier is script-readable for those minutes; it is not a token and is useless without the one-time code.
  Tests: `pkce.test.ts` (another tab finds it, one entry per attempt, minute 29 works, expiry, sweep), callback and App tests updated.
- **Email theme.** `identityProviderLinkSubject/Body/BodyHtml` in en and vi (before this the link email was Keycloak's stock
  English).
- **e2e helper.** `client/e2e/keycloak/keycloakAdmin.ts` `ensureIdentityProvider` now enables an existing but disabled provider
  (the realm file ships `google` disabled, so the throwaway Keycloak had no Google button).
- **Docs.** `modules/auth/docs/GOOGLE_OAUTH_CLIENT_SETUP.md` (how to create the client, redirect URIs, linking table).

### Verification

- `node infra/scripts/verify-google-provider.mjs`: **35/35** against the dev Keycloak: link-email lifetime, provider settings
  (built-in Google, `trustEmail` false, no flow alias, secret not readable back, button on the login page), then through a stub
  OpenID provider with the same settings: a password account, a sign-in with another spelling of the same Gmail lands on the
  choice page (password and email offered, for the existing address) with nothing linked; "Verify by email": email-sent page with
  a 60 s wait, mail to the existing address (SportConnect wording, 30 minutes), a resend inside the minute shows the page and sends
  nothing, the emailed link links it with no second account; a second visit: its own email, a resend after 61 s sends a new one
  (`SKIP_RESEND_WAIT=1` skips that wait), Back to log in lands on the login page with the email pre-filled; the password way: a
  wrong password stays on the page with an error and links nothing, the right one links; the token carries `identity_provider`
  and the existing `sub`; a linked sign-in goes straight in; an unknown email creates an account with `email_normalized`.
- Extensions JAR: `LinkExistingAccountResendSpec` (the resend wait) 6/6; the step itself is covered by the live check above
  (a mocked Keycloak flow context proves nothing about the real flow).
- `keycloak-e2e` (throwaway Keycloak, fresh import of the updated realm file): **11 passed** (after fixing the helper above).
- Theme: Vitest 5/5, `tsc` clean, ESLint clean on `src/login`; the theme a11y/overflow gate on the link stories (en at 375/768/1280 px, vi at 375 px) 21/21. Main client `e2e`/Vitest not run (client app untouched).
- **Visual-regression expectation:** the five new Storybook stories (`LinkAccountConfirm`, `LinkAccountEmailOnly`, `LinkAccountWrongPassword`,
  `LinkAccountEmailSent`, `LinkAccountEmailSentCanResend`) add baselines that do not exist until the `update-baselines` GitHub
  dispatch runs; every existing baseline must come back byte-identical.
- **Real Google sign-in: run by the owner on 2026-10-19** against the dev Keycloak with the real OAuth client: an existing password account, "Verify by email", the emailed link linked Google (the new-tab callback error found there is the third change above, fixed). The password way and a brand-new Google account were not re-run by hand (covered by the stub live check).
