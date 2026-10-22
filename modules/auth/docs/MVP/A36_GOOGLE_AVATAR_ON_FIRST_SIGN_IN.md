# A36 · Use the Google picture as the avatar on the first Google sign-in

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** A26 (callback provisioning), A29 (Google provider)
**Filed:** 2026-10-19, owner request while closing A29: "after login/linked with google, if user have no avatar, link google avatar to account avatar". Scoped with the owner the same day (hotlink, first Google sign-in only, separate ticket).

A Google sign-in whose account has no avatar gets the Google profile picture as its avatar. It applies to both cases: a brand-new account created from Google, and a Google sign-in that links to an existing password account that has no avatar yet. The picture is stored as the Google URL (hotlinked, no copy). A user who already has an avatar never has it replaced, and only the first Google sign-in fills it: a later sign-in does not bring back an avatar the user removed on purpose.

Shape, to confirm when picked up:

- Keycloak (realm script in `infra/scripts`, mirrored in the realm file, like A29): a user attribute mapper on provider `google` copying the `picture` claim to a user attribute, and a token mapper that puts it in the token. Provider sync mode stays `IMPORT`.
- Backend (auth callback, `AuthServiceImpl`, A26): if the token carries `picture` and `users.avatar_url` is empty, set it through a new `UserService` method (cross-domain, `-api` only), so the change reaches the chat service through the existing `avatar_url` sync. Accept only an https URL on a Google image host (`googleusercontent.com`) and within the column's 500 characters; anything else is ignored, never an error for the sign-in.
- Open design point: how the backend tells "first Google sign-in" from a later one (a flag on the `users` row, or only when the callback sees a link that is new). Decide at pickup.

**Edge cases:** no `picture` claim (nothing happens); a deactivated user who signs in with Google is re-activated first (A26), then filled like any other; a password sign-in never fills it; an existing avatar is kept; a Google picture URL that later stops working is not our concern now (see out of scope).

**Client:** the avatar is already rendered from `avatar_url`; check at pickup that the client and Keycloak pages do not block images from `lh3.googleusercontent.com`. No new user-visible text, so no en/vi keys.

**Out of scope:** copying the picture into our own image storage (a follow-up if hotlinking proves fragile); Facebook and Zalo pictures (A34); refreshing the avatar on later sign-ins.

**Tests:** Spock for the callback rule (empty and set avatar, missing and invalid claim, first versus later sign-in) and an IT through the real wiring for the write and the chat sync event; the realm change gets a live check like `verify-google-provider.mjs`.
