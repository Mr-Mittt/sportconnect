# U24 · Self-deactivation and password change for users with no local password

**Status:** `TODO` · **Type:** Bug / decision needed · **Depends on:** auth A26 · **Gates:** client ACCOUNT-3, ACCOUNT-4 keep working for Keycloak users

**Filed:** 2026-10-14, found during auth A26: `UserService.provisionExternalUser` creates `users` rows with `password_hash = NULL` (Keycloak holds the credential), and two existing endpoints verify a *local* password.

## The problem

- `POST /api/users/me/deactivate` (U22, `UserServiceImpl.deactivateOwnAccount`) and `PUT /api/users/me/password` (`changePassword`) compare the typed `currentPassword` with `users.password_hash` using `passwordEncoder.matches`. For every user provisioned from Keycloak the hash is null, and BCrypt returns false for an empty hash, so both answer `400 CURRENT_PASSWORD_INCORRECT` **always**. After A26 and the client's move to the redirect login (AUTH-14), no real user can deactivate their own account or change their password from Account Settings (client ACCOUNT-3 and ACCOUNT-4 would just show the wrong-password error).
- The same holds for social and phone-only users by definition: they have no password to type.

## Decision needed

Pick one (or a mix per endpoint) when this is picked up:

1. **Step-up through Keycloak** for deactivation: the client sends the user to Keycloak with `prompt=login` / `max_age=0`, and the endpoint accepts a request only when the access token's `auth_time` is recent (a few minutes). Strongest, no password in our API, works for social users; needs a client round trip.
2. **No re-confirmation beyond the session plus an explicit typed confirmation** ("DEACTIVATE"). Simple; weaker against a stolen unlocked session, but the account can be re-activated (A26), nothing is deleted.
3. Keep the password check **only** for users that still have a local hash (legacy dev data), and use (1) or (2) for the rest.

For **change password**: the credential lives in Keycloak, so the right answer is to send the user to Keycloak's account console or an "update password" required-action link (auth A28 owns the Keycloak side); `PUT /api/users/me/password` then goes away with the old auth endpoints. Decide here whether it is removed now or in A28.

## Consumer census (to redo at pickup)

`UserController` (`/me/deactivate`, `/me/password`), `UserServiceImpl.deactivateOwnAccount` / `changePassword`, `SelfDeactivationIntegrationTest`, client `AccountSettingsModal` deactivate dialog (ACCOUNT-4) and the change-password UI (ACCOUNT-3), the `CURRENT_PASSWORD_INCORRECT` en/vi copy. A client follow-up ticket is filed with the decision (as A22 did), not before: the UX depends on which option is chosen.

## Out of scope

What deactivation does to the user's groups, sessions and posts (unchanged); the Keycloak-side password flows (auth A28).

## Done when

A user who signed in through Keycloak (password, social or phone-only) can deactivate their own account by the chosen mechanism, covered by an IT; the change-password path is either replaced or removed; the client follow-up is filed.
