# AUTH-14 · Redirect login, `/auth/callback`, ticket-based reactivate and nullable email

**Status:** `TODO` · **Type:** Feature · **Depends on:** backend A26 (and U23); the hosted-pages choice (**A24**). If A24 is a no-go, this ticket is rewritten for the hybrid.

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md` §5).

## What

- `/login` and `/register` redirect to Keycloak with a PKCE pair (the verifier kept only for the redirect, never a token in storage). New `/auth/callback` posts `{code, codeVerifier}` to `/api/auth/callback` and populates `authStore`.
- `ReactivateAccountDialog` and `useReactivate` use the `reactivationTicket` (no password field); cancelling tells the backend.
- Delete the disabled Facebook, Google and Apple buttons from `LoginForm` / `RegisterForm` (Apple is out of scope), the forgot and reset pages, their hooks and tests. The theme (AUTH-15) shows the provider buttons.
- `email: string | null` in `auth/types.ts` and `profile/types.ts`, `TopBar`, `AppShell` and any form that shows it (the client follow-up of **A22**).
- **i18n:** every new or changed string gets `en` and `vi` keys here; add the new error codes (`errors:codes`) and update the I18N-4 census.
- **Tests:** unit and component tests, Storybook stories for the dialog and callback states; the existing auth e2e specs and MSW fixtures are reworked (MSW cannot cover a redirect; see AUTH-15); `E2E_OVERVIEW.md` updated.
- State the **Visual-regression expectation** (the AUTH-13 login/register baselines are removed or re-baselined by the `update-baselines` dispatch).

## Out of scope

The theme (AUTH-15), profile completion (AUTH-16), phone-only account UX (A22).

## Done when

Typecheck, Vitest and the scoped e2e are green; the redirect flow is walked against a real Keycloak; the visual-regression expectation line is in the summary.
