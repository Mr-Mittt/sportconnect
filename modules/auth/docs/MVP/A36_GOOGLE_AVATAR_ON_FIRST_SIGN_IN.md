# A36 · Use the Google picture as the avatar on the first Google sign-in

**Status:** `DONE` (2026-10-19)
**Type:** Enhancement
**Depends on:** A26 (callback provisioning), A29 (Google provider)
**Filed:** 2026-10-19, owner request while closing A29: "after login/linked with google, if user have no avatar, link google avatar to account avatar". Scoped with the owner the same day (hotlink, first Google sign-in only, separate ticket).

A Google sign-in whose account has no avatar gets the Google profile picture as its avatar. It applies to both cases: a brand-new account created from Google, and a Google sign-in that links to an existing password account that has no avatar yet. The picture is stored as the Google URL (hotlinked, no copy). A user who already has an avatar never has it replaced, and only the first Google sign-in fills it: a later sign-in does not bring back an avatar the user removed on purpose.

Shape, to confirm when picked up:

- Keycloak (realm script in `infra/scripts`, mirrored in the realm file, like A29): a user attribute mapper on provider `google` copying the `picture` claim to a user attribute, and a token mapper that puts it in the token. Provider sync mode stays `IMPORT`.
- Backend (auth callback, `AuthServiceImpl`, A26): if the token carries `picture` and `users.avatar_url` is empty, set it through a new `UserService` method (cross-domain, `-api` only), so the change reaches the chat service through the existing `avatar_url` sync. Accept only an https URL on a Google image host (`googleusercontent.com`) and within the column's 500 characters; anything else is ignored, never an error for the sign-in.
- **Decision (2026-10-19, pickup, owner):** the "first Google sign-in" is a flag on the `users` row: nullable `users.google_avatar_checked_at`, set by the first Google sign-in whatever the outcome (filled, avatar already there, no or invalid `picture`), so a later sign-in never fills and an avatar removed on purpose stays removed. Check and write share one transaction under the row lock (two first sign-ins cannot both fill). Users who signed in with Google before this ticket keep the column null: their next Google sign-in counts as the first.

**Edge cases:** no `picture` claim (nothing happens); a deactivated user who signs in with Google is re-activated first (A26), then filled like any other; a password sign-in never fills it; an existing avatar is kept; a Google picture URL that later stops working is not our concern now (see out of scope).

**Client:** the avatar is already rendered from `avatar_url`; check at pickup that the client and Keycloak pages do not block images from `lh3.googleusercontent.com`. No new user-visible text, so no en/vi keys.

**Out of scope:** copying the picture into our own image storage (a follow-up if hotlinking proves fragile); Facebook and Zalo pictures (A34); refreshing the avatar on later sign-ins.

**Tests:** Spock for the callback rule (empty and set avatar, missing and invalid claim, first versus later sign-in) and an IT through the real wiring for the write and the chat sync event; the realm change gets a live check like `verify-google-provider.mjs`.

## Built (2026-10-19)

Approved plan, as built (no divergence from it):

- **Keycloak** (`infra/scripts/realm-google-picture.mjs`, `apply-realm-google-picture.sh`; the `file` mode mirrors it in the realm file): user-profile attribute `picture` (admin edit only, 500 characters), a provider mapper on `google` copying the provider's `picture` claim into it (**FORCE sync**: the first Google sign-in of an existing account is a link, which a plain import mapper would not cover; verified live), and a token mapper on `sportconnect-web` that puts it in the access token as `picture`.
- **Database:** `V082` adds nullable `users.google_avatar_checked_at` (mirrored in the test `schema.sql`); existing rows stay null.
- **`UserService.applyGoogleAvatarOnce(userId, pictureUrl)`** (`UserServiceImpl`): under the row lock (`findByIdForUpdate`), returns the user unchanged when the flag is set; otherwise sets the flag in every case, and fills `avatar_url` only when it is empty and the URL is https on `googleusercontent.com` or a subdomain (no credentials or port, 500 characters at most). A fill publishes `user.profile_updated` (the existing path to the chat service).
- **`AuthServiceImpl.callback`:** after the A26 re-activation and only for an active user whose `identity_provider` is `google`, calls the rule with the `picture` claim and answers with the user it returns, so the avatar is in the sign-in response. An error is logged and swallowed: a sign-in never fails over a picture. A password or another provider's sign-in never touches it.
- **Census:** the new column, the new `UserService` method and the `picture` claim are additive; the `AuthResponse` shape is unchanged (`avatarUrl` was already there) and the client renders `avatarUrl` as a plain image with no CSP or `img-src` rule in the repo, so nothing in the client changes. i18n: no new text.

**Verification:** Spock `UserProvisioningSpec` (the rule: fill, kept avatar, later sign-in, 12 unusable URLs, host rule, unknown user) and `AuthServiceImplSpec` (+5); `KeycloakCallbackIntegrationTest` +6 through the real wiring (new Google account filled and the `user.profile_updated` event in the Redis stream, link of an existing account, existing avatar kept and a removed one not brought back, password sign-in not using up the first Google sign-in, unusable picture, deactivated user re-activated then filled); `user-impl` 290, `auth-impl` 115, `:server:test` 617, all green. `node infra/scripts/verify-google-picture.mjs` **15/15** against the dev Keycloak (attribute, both mappers, new account, existing account linked by password, no picture, later sign-in). `keycloak-e2e` 11/11 on a fresh realm import. Client untouched: no Vitest/e2e/visual-regression run, no baseline change.

**To apply on another Keycloak:** `apply-realm-google-provider.sh`, then `apply-realm-google-picture.sh` (needs the `google` provider to exist for its mapper).
