# U26 · Change the caller's email (prove the caller, prove the new mailbox)

**Status:** `DONE` (2026-10-21)
**Type:** New Feature
**Depends on:** U24 (confirmation proofs), auth A33 (verified flag), auth A35 (normalized email), auth A36 (Google avatar)
**Gates:** client ACCOUNT-7
**Filed:** 2026-10-20, from the ACCOUNT-7 pickup: the owner wants a "Change email" button in account settings; the backend has no way to change an email (`UpdateProfileRequest` has no email field). Scope settled with the owner at pickup, 2026-10-20 (see **Scope changes** at the end).

## What

Two steps, both under `ROLE_USER`:

1. **`POST /api/users/me/email-change-code`**, body `{ newEmail }`. Checks the address, then emails a 6-digit code to the **new** address. Answers 200 `{ resendAfterSeconds: 60, expiresInSeconds: 900 }` (same numbers and store as the U24 code).
   - `400 NEW_EMAIL_SAME_AS_CURRENT` (the caller's own address, any case), `400 VALIDATION_FAILED` (not an email), `409 EMAIL_ALREADY_REGISTERED` (another account holds the A35 key, see below), `429 VERIFICATION_RESEND_TOO_SOON` (with `seconds`), `503` (Keycloak, Redis or the mail sender down; the resend lock is released when nothing was sent).
   - Nothing is changed and nothing is stored about the new address except the hashed code.
2. **`PUT /api/users/me/email`**, body `{ newEmail, newEmailCode, currentPassword | verificationCode }`. The caller proves themselves with exactly one proof, as in change password (the current password, or a code with purpose `CHANGE_EMAIL` from `POST /me/confirmation-code`, mailed to the **current** address), **and** proves the new mailbox with `newEmailCode`. Then the email is changed (below). Answers 200.
   - Errors: all of the step-1 ones except 429, plus the existing `CURRENT_PASSWORD_INCORRECT`, `PASSWORD_ATTEMPTS_EXCEEDED` (shared lock with password changes), `CONFIRMATION_REQUIRED`, `VERIFICATION_CODE_INVALID` / `_EXPIRED` / `_ATTEMPTS_EXCEEDED` (for either code; 5 wrong tries burn a code, as U24), `VERIFICATION_EMAIL_UNAVAILABLE` (a phone-only account has no current address for the `CHANGE_EMAIL` proof code and must use its password).
   - **Binding:** the new-address code is hashed with the caller, the purpose `NEW_EMAIL` **and the exact lowercased new address**, so a code mailed to one address cannot change the email to another. The two codes (proof to the current address, proof of the new mailbox) have different purposes and never stand in for each other.
   - The duplicate check runs again here (the address may have been taken since step 1).

**Effect of a successful change** (one Keycloak update, then the database copy, then the caches and the event):
- Keycloak: the new `email`, **`emailVerified: true`** (the mailbox was just proven by the code; see scope change 3), the recomputed `email_normalized`, and the `username` moved to the new email when it equals the old one.
- `users.email` and `users.is_email_verified = true`; the A25 access-state cache entry is evicted.
- Everything tied to the old address is removed (scope change 2).
- No mail is sent by the change itself.

**Duplicate rule.** The A35 key (`EmailRules.normalized`) decides. Verified live on 2026-10-20 (Phase 2), correcting the first probe: an admin-API update of a user to an address another account holds is refused when the update carries the new `email_normalized` attribute (`400 emailAlreadyUsed` from the A35 validator for a `+tag` or `googlemail.com` spelling, `409 User exists with same email` for the exact address); the first probe's "accepted" came from test users that had no `email_normalized`. So the backend must **send the new key with the update** (Keycloak's validator then is the arbiter at write time) and, for step 1, search Keycloak by that attribute (`GET /users?q=email_normalized:<key>&exact=true` found the other account) plus the `users` table. Both Keycloak answers map to `EMAIL_ALREADY_REGISTERED`. The backend therefore needs the A35 rule in Java: a copy of `EmailRules` in `auth-impl`, pinned to the extensions JAR's by a shared table of examples in both specs (the JAR is a separate Gradle project and cannot import the app's modules). Changing the email through the admin API leaves `emailVerified` as it was, so the update always sends it explicitly, and an update replaces the user's attributes, so it sends back the whole set it read (country, region, location, phone, picture...) with only `email_normalized` changed and `picture` dropped.

**Deactivated caller:** 404 on both endpoints (the A25 gate, and again in the service before any proof is read).

**Abuse limits:** step 1 mails an arbitrary address, so besides the 60 s resend lock per user it is capped per user per day (a number to set in Phase 3); the duplicate answer tells an authenticated user whether an address is registered, the same fact the register page already tells anyone.

**Out of scope:** phone changes (auth A37); the client dialog (ACCOUNT-7); the notice to the old address (NOTIF-9, a candidate in `NOTIFICATION_USE_CASES.md`); ending the caller's other sessions.

**Tests:** Spock for both service methods; a real IT for the duplicate by an A35 variant, each wrong proof, the binding of the new-address code, a deactivated caller, the Google unlink and avatar rule, the username move, and the verified flag.

## Scope changes

**1. 2026-10-20, owner at pickup: nothing of the old email survives the change.** A Google-linked account that changes its email is **unlinked from Google** (keeping the link would let two emails sign in to one account), the Google avatar goes with it, and everything else tied to the old address is removed in the same change. What the change removes or resets, found by tracing the old email through the code (each one gets a test):

- **Federated identities (Google):** every `federated-identity` link on the Keycloak user is removed (there is no `users.identity_provider` column: `identity_provider` is only a token claim, so nothing in our database records the link).
- **Google avatar (A36):** `users.avatar_url` is cleared **only when it is a Google picture** (https on `googleusercontent.com`, the same host rule A36 uses); an avatar the user set themselves stays. `users.google_avatar_checked_at` is cleared, so a later Google sign-in on the new email may fill it again. The Keycloak `picture` attribute is removed, and a `user.profile_updated` event goes out so the chat service's copy of the avatar follows (A36's existing sync).
- **`email_normalized` (A35):** recomputed by the backend for the new address. Only the registration flow and the account-console events maintain it, so an admin-API change would leave the old key in place: the old address would stay blocked for everyone else and the new one unprotected.
- **The Keycloak username:** a password account registered with an email has that email as its Keycloak **username** (A27), so the old address would keep signing in as a username, and nobody else could register it (username clash). Verified live on 2026-10-20 (Phase 2): with the realm's `editUsernameAllowed: false` an admin-API update that changes the username is refused (`400 error-user-attribute-read-only`); with it `true` the update succeeds and the old email stops signing in (401) while the new one works (200). So this ticket adds a realm change, `editUsernameAllowed: true` (script + `apply-` wrapper + the realm file, per the realm-changes rule; the account console that would let users edit it is not used). When the username equals the old email (A35 key) it is changed to the new email in the same update; any other username (a phone, a name) is left alone.
- **Pending state:** the A33 resend lock `user:confirm:email-verify-resend:{userId}` is released and the user's unused confirmation codes (every purpose) are dropped, because a code mailed to the old address would otherwise stay valid for 15 minutes after the change. A verification link already mailed to the old address is not chased: the change leaves the new address verified, so a stale link has nothing left to verify (not tested further).
- **Sessions:** unchanged, other devices stay signed in.

**2. 2026-10-20, owner at pickup: the new mailbox is verified before the change, instead of "set a password first".** The worry was a Google-only account (no password) unlinked from Google and left with a mistyped, unproven address. Instead of refusing such an account, the new address is proven first with a code mailed to it (the two endpoints above), and the account keeps a way in because the address it ends up with is one the user can read. A Google-only account confirms itself with the `CHANGE_EMAIL` code to its current address.

**3. Assumption to confirm (follows from 2):** the earlier decision was "after the change `emailVerified` resets to false and the user verifies later". Since the code now proves the new mailbox, the change sets it **true** and no later step is needed. If the owner wants it false anyway, only the one flag in the update changes.

## Built (2026-10-21)

Approved plan, as built; the two differences from the plan are listed under **Deltas**.

- **Realm** (`infra/scripts/realm-edit-username.mjs` + `apply-realm-edit-username.sh`, mirrored in `sportconnect-realm.json` as `editUsernameAllowed: true`): without it Keycloak refuses to move a username, even for the admin API. Applied to the dev realm. INFRA-14 must apply it (or import the realm file) in production.
- **auth-api / auth-impl:** `KeycloakCredentialService` gains `isEmailRegistered(email, exceptUserId)` (search by the `email_normalized` key and by the exact address, the caller's own account never counts) and `replaceEmail(userId, newEmail)` (read the record, write it whole with the new email, `emailVerified=true`, the new key, no `picture`, the username moved when it was the old email by the A35 key, then delete every federated identity; the update goes first because it is the step that can be refused; `409` and the A35 validator's `400 emailAlreadyUsed` become `409 EMAIL_ALREADY_REGISTERED`, anything else `503`). `EmailRules` in auth-impl is a copy of the extensions JAR's rule, pinned by `infra/keycloak-extensions/src/test/resources/email-rules-examples.csv`, which both specs read.
- **user-api:** `NewEmailCodeRequest`, `ChangeEmailRequest`, `ConfirmationPurpose` gains `CHANGE_EMAIL` and `NEW_EMAIL`, `UserService.sendNewEmailCode` and `changeEmail`.
- **user-impl:** `ConfirmationCodeStore` (code bound to an optional address, the per-day cap `app.user.new-email-daily-limit`, `purgeAfterEmailChange`), `AccountConfirmationService`, `UserServiceImpl` (both steps; `sendConfirmationCode` refuses `NEW_EMAIL`), `UserController` (`POST /me/email-change-code`, `PUT /me/email`), the mail wording `body.change_email` and `body.new_email` (en, vi).
- **Docs:** `ERROR_CODES.md` (`NEW_EMAIL_SAME_AS_CURRENT`, `NEW_EMAIL_CODE_LIMIT_REACHED`, `EMAIL_ALREADY_REGISTERED` and `VERIFICATION_RESEND_TOO_SOON` extended), `REDIS_KEYS.md`, the module `CLAUDE.md` files.

## Deltas from the plan

- **The new-address code is bound to the exact lowercased address, not to the A35 key** (stricter: a code mailed to `a.b@gmail.com` does not work for `ab@gmail.com`). The same-as-current refusal is likewise the exact address; a `+tag` spelling of one's own Gmail address is allowed (the account is never a duplicate of itself).
- **No revert if the database write fails after Keycloak changed.** The plan sketched a best-effort restore of the old email; it was dropped: the restore would itself have to guess the old verified state, and the failure heals by itself, because the same change repeated (a new code to the new address) completes it (the account is never a duplicate of itself). The failure is logged at ERROR.
- The Keycloak search is two calls (by key, by exact address) so an account that has no `email_normalized` yet still counts as a holder.
- Bean validation rejects an address with surrounding spaces (`400 VALIDATION_FAILED`); the client trims.

## Verification (2026-10-21)

Every requirement above has a test that fails without it:

| Requirement | Where it is proven |
|---|---|
| Duplicate: exact address, the Gmail spellings (dots, +tag, googlemail), held in the table or only in Keycloak; own address refused | `ChangeEmailIntegrationTest` step1_*, `UserEmailChangeSpec`, `KeycloakEmailChangeSpec`; live: real registered accounts |
| Code to the **new** address, 60 s lock, daily cap, generic endpoint refuses `NEW_EMAIL` | IT step1_*; `AccountConfirmationServiceSpec`; live |
| Two proofs: password or `CHANGE_EMAIL` code, plus the new-address code bound to its address; neither/both, wrong, burnt after 5 tries, replaced by a newer code | IT refusal_*, change_withTheCodeMailedToTheCurrentAddress_*; `UserEmailChangeSpec`; live (password round and code round) |
| New email, `emailVerified=true`, new key, other attributes kept | IT change_withThePassword_*; `KeycloakEmailChangeSpec`; live |
| Username follows the email (only when it was the old email); old address stops signing in, can be registered by someone else | IT change_theUsernameFollows_*, change_anyOtherUsername_*; `KeycloakEmailChangeSpec`; live (password grant 401 / 200, re-registration) |
| Google unlinked; Google picture cleared (own avatar kept), once-only flag reset, chat event | IT change_withTheCode..._unlinksGoogle..., change_anAvatarTheUserSetThemselves_*; `UserEmailChangeSpec`; live |
| Pending codes and the verification cooldown dropped | IT change_dropsTheCodesThatWerePending_*; `ConfirmationCodeStore` through the IT |
| Every refusal leaves the account as it was (Keycloak and database) | IT refusal_* (`assertUntouched`); `UserEmailChangeSpec`; live (`untouched` after each refusal) |
| Deactivated caller: 401 at the gate, 404 in the service; no token: 401 | IT bothSteps_*, step1_/step2_forADeactivatedCaller_* |
| Phone-only account adds its first email with the password | IT change_forAPhoneOnlyAccount_* |
| Realm without `editUsernameAllowed` is a 503, not a silent half-change | IT refusal_aRealmThatDoesNotAllowUsernameChanges_*; `KeycloakEmailChangeSpec` |
| The backend's copy of the A35 rule equals the JAR's | `EmailRulesSpec` in both projects, one shared table |

Suites: extensions JAR 113, auth-impl 193, user-impl 365 (2 skipped: the old scratch `leetcodeSpec`), `ChangeEmailIntegrationTest` 29, full `:server:test` 676 passed (0 failed, 0 skipped), all green. Live check `infra/scripts/verify-email-change.mjs` (real backend, real dev Keycloak, Postgres, Redis and Mailpit): all checks passed, run twice (the first run found only mistakes in the script itself: a welcome mail counted as a code mail, and the 60 s lock not waited out). The test data it left (2 rows in the dev database) was removed; the dev Keycloak is back to its 10 users.

**Mutation check:** 34 deliberate breakages of the behaviour in the table (skip either proof, skip the unlink, keep the picture, leave the flag false, never move the username, move it when it should stay, drop the other attributes, ignore either duplicate search, skip the write-time re-check, Keycloak after the database, keep the Google avatar or clear any avatar, keep the once-only flag, no chat event, no purge, no cache eviction, accept `NEW_EMAIL` on the generic endpoint, mail the wrong address, no daily count or cap, a code not bound to its address, a wrong row in the shared table, a drifted copy of the rule) were each applied alone and run; all 34 turned a test red. One survived the first pass (dropping the search by the A35 key: the test server answered both searches alike); the spec now answers them differently and kills it. Two slips found while doing this and fixed: the JAR's `EmailRulesSpec` had never received its shared-table test (an append had gone to a stray file), and the first mutation harness could not launch Gradle and reported everything as surviving, which was a harness error and was discarded.

**Not tested:** a real Google sign-in after the unlink (needs the owner's browser and OAuth client); a real change under load or two simultaneous changes to the same address (the row lock serialises one user, the Keycloak validator is the arbiter between two users).

**Client:** `ACCOUNT-7` is unblocked; the contract it builds on is the two endpoints above (the codes `EMAIL_ALREADY_REGISTERED`, `NEW_EMAIL_SAME_AS_CURRENT`, `NEW_EMAIL_CODE_LIMIT_REACHED` need en and vi copy; ACCOUNT-7 carries them).
