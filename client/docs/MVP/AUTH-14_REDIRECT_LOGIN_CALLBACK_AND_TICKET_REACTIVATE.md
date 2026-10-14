# AUTH-14 · Redirect login, `/auth/callback`, ticket-based reactivate and nullable email

**Status:** `TODO` · **Type:** Feature · **Depends on:** backend A26 (and U23); the hosted-pages choice (**A24**). If A24 is a no-go, this ticket is rewritten for the hybrid.

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md` §5).

## What

- `/login` and `/register` redirect to Keycloak with a PKCE pair (the verifier kept only for the redirect, never a token in storage). New `/auth/callback` posts `{code, codeVerifier}` to `/api/auth/callback` and populates `authStore`.
- `ReactivateAccountDialog` and `useReactivate` use the `reactivationTicket` (no password field); cancelling tells the backend.
  - **Contract as built by backend A26 (2026-10-14):** the sign-in `POST /api/auth/callback {code, codeVerifier}` (verifier 43 to 128 characters) answers `401 ACCOUNT_DEACTIVATED` with the ticket in **`errorParams.reactivationTicket`** (not `data`, no cookie); `POST /api/auth/reactivate {ticket}` confirms (200 with the usual session response and cookie) and `POST /api/auth/reactivate/cancel {ticket}` declines (always 200). A ticket works once and lives 5 minutes; a failed confirm is `401 REACTIVATION_TICKET_INVALID` (restart the sign-in). A deactivated user who signed in through Google, Facebook or Zalo never sees the dialog: the backend re-activates them and returns the session.
  - `/api/auth/logout` is now **public and driven by the refresh cookie** (no Bearer needed, so it works with an expired access token); no cookie is still 200. It answers `503 SERVICE_UNAVAILABLE` and **keeps the cookie** when Keycloak cannot be reached: decide what the UI shows (drop the in-memory token and retry in the background, or tell the user the sign-out did not complete).
  - `apiClient`'s `NO_RETRY_URLS` should gain `/auth/callback`, `/auth/reactivate/cancel` (a 401 there is not an expired token) and keep `/auth/refresh`; a `503` on `/auth/refresh` must not log the user out.
- Delete the disabled Facebook, Google and Apple buttons from `LoginForm` / `RegisterForm` (Apple is out of scope), the forgot and reset pages, their hooks and tests. The theme (AUTH-15) shows the provider buttons.
- `email: string | null` in `auth/types.ts` and `profile/types.ts`, `TopBar`, `AppShell` and any form that shows it (the client follow-up of **A22**).
- **i18n:** every new or changed string gets `en` and `vi` keys here; add the new error codes (`errors:codes`) and update the I18N-4 census. Codes the callback flow can return (backend A26): `AUTH_CODE_INVALID`, `REACTIVATION_TICKET_INVALID`, `ACCOUNT_DEACTIVATED` (exists; its copy must now fit the dialog's ticket flow), `PHONE_ALREADY_USED`, `INVALID_PHONE_NUMBER`, `IDENTIFIER_REQUIRED`, `EMAIL_ALREADY_REGISTERED`, `SERVICE_UNAVAILABLE`. `REFRESH_TOKEN_INVALID` is no longer returned (its copy can go).
- **Tests:** unit and component tests, Storybook stories for the dialog and callback states; the existing auth e2e specs and MSW fixtures are reworked (MSW cannot cover a redirect; see AUTH-15); `E2E_OVERVIEW.md` updated.
- State the **Visual-regression expectation** (the AUTH-13 login/register baselines are removed or re-baselined by the `update-baselines` dispatch).

## Out of scope

The theme (AUTH-15), profile completion (AUTH-16), phone-only account UX (A22).

## Done when

Typecheck, Vitest and the scoped e2e are green; the redirect flow is walked against a real Keycloak; the visual-regression expectation line is in the summary.
## Delta (2026-10-14, from auth A24 — go)

- **Locale at the redirect:** a bare `kc_locale=vi` on the first `/auth` request rendered English in A24. Send the standard `ui_locales=<i18n language>` and verify the themed page opens in Vietnamese (not verified in A24).
- **Remove AUTH-13's 21 auth baselines** (`auth-login-*`, `auth-register-*`, `auth-forgot-password-*`, `auth-reset-password-*`, each at 375/768/1280) together with the screens they cover; AUTH-15 baselines the theme pages instead.
