# A33 · Email verification as an optional step (a flag, not a gate)

**Status:** `DONE` (2026-10-20) · **Type:** Enhancement (security) · **Depends on:** A28, A29, A35 · **Gates:** nothing

**Filed:** 2026-10-16, from A28's pickup. The user chose to keep the realm's `verifyEmail` off in A28 and to enable it together with phone verification in one later ticket.

## What

After A28, Keycloak sends the verification email but nothing requires it: the realm has `verifyEmail: false`, so a password user gets in without clicking the link. This ticket turns verification on for both identifiers at once:

- **Email.** Set `verifyEmail: true` in the realm (admin-API script under `infra/scripts/`, mirrored in `infra/keycloak/realm/sportconnect-realm.json`). A password user then lands on Keycloak's "verify your email" page after registering and gets no session until the link is clicked; the link continues the sign-in when opened in the same browser. The verification link already lives 12 hours in this Keycloak (checked in A28 from a sent mail), so there is nothing to raise; confirm the value in the realm when this is picked up. Check the verify-email page's look and en/vi copy in the Keycloakify theme (`login-verify-email.ftl` has a Storybook story only).
- **Phone.** Verify a phone number (OTP, or Zalo) and set `phone_status` to `VERIFIED`; nothing sets it today (A27 and the Keycloak extension decide where the check lives). Decide what an unverified phone may do (login identifier only after verification, per A27's rules).
- **Existing users.** Dev users created before this have no verified email and would be asked to verify at their next password sign-in; decide whether to mark the dev set verified in the realm or let them verify.

Why it matters: A29 links a social login to an existing account on a verified email. An unverified password account holding someone else's address would let that person's real Google login merge into it.

## Not affected

Social sign-ins (the provider vouches for the email), and accounts with no email (A22).

## Out of scope

Providers (A29); recovery for accounts with no email (A22).

## Delta 2026-10-16 (from A27)

A27 is done. Two facts this ticket builds on: a phone is stored in E.164 when it parses and as typed when it does not (the backend marks the latter `INVALID`, never an identifier), and a phone-only account can now exist (its Keycloak username is the E.164 number). With `verifyEmail: true`, a phone-only account has no email to verify, so the realm rule must not block it: check how Keycloak treats a user with no email under that setting (live, with `infra/scripts/verify-phone-rules.mjs`'s phone-only registration) before switching it on. The Keycloak extension lives in `infra/keycloak-extensions`; a phone verification step would be a new provider there.

## Scope change 2026-10-20 (owner decision at pickup)

Why: blocking sign-in until the link is clicked is not wanted. Verification becomes an optional extra step, and an unverified account keeps working as normal.

- **Not blocking.** The realm keeps `verifyEmail: false` (no required action at sign-in). The first bullet under What (`verifyEmail: true`) is dropped.
- **A flag, not a gate.** An account has an email-verified flag, false by default. It becomes true when the owner proves the mailbox; it stays false for a new password account, and for an account that a Google sign-in linked to an existing password account (the provider's word is not taken for that case).
- **Manual verification.** An unverified user can ask for the verification email from account settings; clicking the link sets the flag to true.
- **Email only.** Phone verification (OTP or Zalo, `phone_status` `VERIFIED`) leaves this ticket and is filed separately in V1 (it waits for the phone-OTP delivery decision). The ticket is narrowed to email.
- **Settled 2026-10-20 (Phase 1):**
  - The flag is Keycloak's built-in `emailVerified` (the `email_verified` claim, `users.is_email_verified` in the app DB); no new attribute. Nothing in the app is added to the user model.
  - Register with a password: false. First Google sign-in that creates a new account: true (the provider vouches for it). A Google sign-in that links to an existing password account: true when the user proves it with the password and Google says the mailbox is verified (changed 2026-10-20, owner: the user proved the account, Google vouches for the mailbox, so both ends agree), true when the user proves it with the emailed link.
  - Existing dev users stay unverified (useful to test the flow).
  - Manual verification: a backend endpoint asks Keycloak to send the verification email; the account-settings button and the profile refresh are a client ticket (ACCOUNT-7), filed with the contract.
  - Phone verification is filed as A37 (V1).
  - Closing the squat gap (2026-10-20): a link-by-email proof on an existing password account removes that account's password credential, marks the email verified and ends its other sessions; the user then sets a new password through "forgot password". The password proof leaves everything as is. Reason: registration does not prove the mailbox, so someone can register a victim's address with their own password; a victim's later Google sign-in would otherwise merge into that account with the squatter's password still valid.
  - The user must be told before it happens, so it is not missed: the linking email (the `identity-provider-link` template in `infra/keycloak/themes/sportconnect/email`) and the "email sent" and choice pages in the Keycloakify theme state that confirming removes the account's current password and that a new one is set afterwards. en and vi, with Storybook stories and the theme visual baselines updated.

## Design (approved 2026-10-20)

- **Realm.** No realm change at all. `verifyEmail` stays `false` (checked live), the flag is Keycloak's built-in `emailVerified`, and the link lifespan is sent with each request (`lifespan=43200`, 12 hours) instead of a realm attribute, so there is no realm script to mirror. (The first plan listed a lifespan script; dropped because the admin endpoint takes the value per call.)
- **Keycloak extension** (`LinkExistingAccountAuthenticator`): when the emailed link proves a social sign-in to an existing account that was **not** verified at the moment the mail was sent, the password credential is removed, the account's sessions end and the email is marked verified. A verified account is left alone (refinement approved in the plan: its owner already proved the mailbox, so nobody can be squatting on it). Whether it was verified is recorded in an auth note when the mail is sent, because Keycloak's own link handler sets `emailVerified` before this step runs; a missing note counts as unverified (the safe side).
- **New Google account (added after the first build, owner report 2026-10-20).** The design said "true for a new Google account" but nothing did it: the provider keeps `trustEmail: false` (A29), and then Keycloak ignores Google's `email_verified`. Fix: an identity-provider mapper from the extensions JAR, `sc-email-verified-importer` (`VerifiedEmailImporter`), on `google` (`realm-google-email-verified.mjs`, `apply-realm-google-email-verified.sh`, mirrored in the realm file). It acts only when Keycloak creates the user (a link to an existing account never reaches it), only when the claim is true and the new user's email is the one the provider vouched for. It writes the flag at the end of the transaction (`enlistPrepare`), because Keycloak resets `emailVerified` for an untrusted provider after the mappers have run (seen live: set in `importNewUser`, false again at the REGISTER event within the same request). Dev accounts created before this stay as they were (owner decision).
- **Backend.** `KeycloakCredentialService` gains `isEmailVerified` and `sendVerificationEmail` (the credentials client's service account, `manage-users`). `POST /api/users/me/email-verification` (`UserController` -> `UserServiceImpl.sendEmailVerification`): asks Keycloak first whether the email is already verified (then syncs the copy and sends nothing, `alreadyVerified: true`), otherwise one mail per 60 seconds (Redis `user:confirm:email-verify-resend:{userId}`, released when the Keycloak call fails). `users.is_email_verified` follows the token: `AuthServiceImpl` turns it on at callback and refresh when the new token says `email_verified` (never off, a failed write is logged and never fails the sign-in).
- **Pages and mail.** The link email, the link choice page and the "email sent" page tell the user that confirming removes the account's current password when the account was never verified (en and vi). The page flag `scLink.unverified` comes from the extension.

## Built (2026-10-20)

As designed, plus what the live checks showed:

- Keycloak sends an admin-triggered verification link to a **confirm page** first ("Confirm validity of e-mail address", one click), because the link has no browser session behind it; proceeding verifies and the page links back to the web app. Nothing to change, but ACCOUNT-7 and users should expect the two steps.
- The sign-in response body carries a small user map without the flag; the profile (`GET /api/users/me`) carries `isEmailVerified`.
- No new error code: `VERIFICATION_EMAIL_UNAVAILABLE` and `VERIFICATION_RESEND_TOO_SOON` already have their en and vi strings (U24, ACCOUNT-6).
- Files: `infra/keycloak-extensions` (authenticator and `LinkExistingAccountTakeOverSpec`), `client/keycloak-theme` (messages en/vi, `LinkConfirm`, `LinkEmailSent`, two stories `LinkAccountUnverified` and `LinkAccountEmailSentUnverified`), the email theme messages en/vi, auth-api/auth-impl/user-api/user-impl as above, `TestKeycloak` (verify state and the send endpoint), `documentation/md/REDIS_KEYS.md`.

## Scope change 2026-10-20 (owner, after the first build): a password proof verifies too

The first build left an account unverified when a Google sign-in was proven with the account's **password** (only the emailed link verified it). Owner decision: that proof verifies as well, because the user proved the account is theirs and Google vouches for the same mailbox. Built as `LinkExistingAccountAuthenticator.markVerifiedWhenProviderVouches` (called when the password is right): it sets `emailVerified` only if the provider's token says `email_verified` is true and its email is the same mailbox as the account's (the A35 key, so `j.doe+x@gmail.com` and `jdoe@googlemail.com` match), and the account is not verified yet. A provider that does not vouch leaves the account unverified. The password is never removed on this path. The same-mailbox comparison now uses the A35 key in `VerifiedEmailImporter` too (it compared plain addresses before; for a new user the two are identical, so nothing changes there). Tests: `LinkExistingAccountPasswordProofSpec` and two cases added to `verify-google-provider.mjs` (vouching: verified and password kept; not vouching: unverified).

## Package refactor of the extensions JAR (folded in, owner request 2026-10-20)

`infra/keycloak-extensions` had grown to 20 classes in one package. They now live by feature, in their own commit (a pure move, no behaviour change):

- `com.sportconnect.keycloak.email` (A35): `EmailRules`, `EmailNormalizingEventListener`, `NormalizedCreateUserIfUniqueAuthenticator`, `UniqueNormalizedEmailValidator` and their factories.
- `com.sportconnect.keycloak.phone` (A27): `PhoneRules`, `PhoneLoginForm`, `PhoneNormalizingEventListener`, `RegistrationUsernameFormAction`, `UniquePhoneValidator`, `EmailOrPhoneValidator` and their factories.
- `com.sportconnect.keycloak.link` (A29, A33): `LinkExistingAccountAuthenticator`, `VerifiedEmailImporter` and the factory.
- `com.sportconnect.keycloak` (shared): `ValidatorInput` only (the validator-input reader that both validators used; it was a package-private helper on the phone validator).

Provider ids are strings returned by the factories, so the realm, the realm file and the apply scripts are untouched; the four `META-INF/services` files carry the new class names. Specs moved with their classes; `ValidatorInputSpec` is new. Checked with the module's Spock suite and, after a JAR rebuild and Keycloak restart, `verify-phone-rules.mjs`, `verify-email-normalized.mjs`, `verify-google-provider.mjs` and `verify-email-verification.mjs` (all pass).

## Verification

- New Google account (added later): Spock `VerifiedEmailImporterSpec` (claim values, same-address rule, nothing written during the import, written at commit) and the live check below, which now also asserts a new account from a vouching provider is verified, one from a provider that does not vouch is not, and a password-proved link to an existing unverified account leaves it unverified.

- Spock: `:infra:keycloak-extensions:test` (the take-over rule and the note), `:modules:auth:auth-impl:test` and `:modules:user:user-impl:test` green (credential client calls, the cooldown store, the service, the sync at sign-in and refresh).
- Integration tests through the real pipeline (`EmailVerificationIntegrationTest`, six cases; two new cases in `KeycloakCallbackIntegrationTest`): one mail per wait, 429 with the seconds, nothing sent for an email Keycloak already holds as verified (the copy follows), a deactivated caller refused, a Keycloak outage that does not cost the user their wait, the flag recorded at sign-in and refresh and never turned off.
- Live, against the dev Keycloak with the new JAR and theme: `infra/scripts/verify-google-provider.mjs` (extended: the unverified account loses its password and sessions and keeps a way back, the verified one keeps its password, the warning shows on the page and in the mail) and the new `infra/scripts/verify-email-verification.mjs` (optional, themed en/vi mail, 12 hour link, confirm page, back to the web app). A walk through the real backend (register, callback, request, 429, open the link, ask again) passed too.
- Not run: the email-less user check (Keycloak refuses to create such a user in this realm, so the 400 is covered by the Spock spec only); the auth-theme visual baselines are not generated yet (none exist for the theme; the `update-baselines` dispatch creates them, including the two new stories).

## Deltas for later tickets

- **ACCOUNT-7 (client)** builds the account-settings row on `POST /api/users/me/email-verification`: 200 `{ alreadyVerified, resendAfterSeconds }`; errors `VERIFICATION_RESEND_TOO_SOON` (429, `seconds`), `VERIFICATION_EMAIL_UNAVAILABLE` (400), 404 for a deactivated caller, 503.
- **A29 accepted risk:** a victim who opens a verification mail for an account they did not create verifies it with the squatter's password still in place; the mail already says to ignore it if the user did not create an account.
- **Apply on another Keycloak:** rebuild and load the extensions JAR (`infra/scripts/build-keycloak-extensions.sh`), rebuild the login theme, recreate Keycloak so the email theme reloads, then run `infra/scripts/apply-realm-google-email-verified.sh` once (after `apply-realm-google-provider.sh` and the JAR restart).
