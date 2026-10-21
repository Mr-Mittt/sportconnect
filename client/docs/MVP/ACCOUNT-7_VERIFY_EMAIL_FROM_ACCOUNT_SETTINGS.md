# ACCOUNT-7 · Change and verify the email from account settings

**Status:** `TODO` (backend U26 done 2026-10-21, ready to pick up) · **Type:** Feature · **Depends on:** auth A33 (done: the verification endpoint and the sync of the flag), user U26 (the change-email endpoint) · **Gates:** nothing

**Filed:** 2026-10-20, from the auth A33 pickup: email verification became an optional step (an unverified account works as normal), and the owner wants a manual way to start it from account settings.

## Scope change 2026-10-20 (owner, at pickup): the email can be changed here too

The first version of this ticket only showed a verified badge and a send button. At pickup the owner added **changing the email**, confirmed like a password change or a deactivation (the current password, or a code emailed to the account), with the verification status beside it. The backend has no change-email endpoint (the profile update has no email field), so it was filed as **user U26** and this ticket waits for it ("backend first, one client ticket", owner decision). U26 also settles the duplicate check: Keycloak refuses an exact duplicate (409, checked live) but accepted `+tag` and `googlemail.com` spellings of a Gmail address on an admin-API change, so the backend applies the A35 key itself; after a change the new address is the one proven by a code mailed to it (see the second scope change).

## What

There is no email row in the modal today (Contact holds Phone and Language). Add one **right above the Change password section**:

- **Left:** the current address and a "Change email" button. It opens a dialog (same shape as the change-password dialog, ACCOUNT-6) with two parts, top to bottom:
  1. **Confirm it is you:** the existing two ways (the current password, or a code emailed to the **current** address, via `useConfirmationCode('CHANGE_EMAIL')`).
  2. **The new email:** the address input, with a right-aligned **Verify** button below it. Verify calls `POST /api/users/me/email-change-code` (U26), which checks the address (already registered, same as the current one) and, when it is fine, mails a 6-digit code to the new address. A problem shows as an error under the input and nothing else appears. When it is fine, the button becomes "Re-send in m:ss" (countdown from the response, same pattern as ACCOUNT-6) and **to its right a 6-digit code input appears** (same attempts rule as the other codes: 5 wrong tries burn the code). Editing the address clears the code step.
  3. **Update email** below: enabled only when the new address was verified-by-send, the code input holds 6 digits, and the caller's proof (password or its code) is filled. It calls `PUT /api/users/me/email`; on success the profile is refetched, the row shows the new address as **Verified** (U26 sets the flag, the mailbox having just been proven), and the dialog closes.
  A phone-only account (no current address) can only confirm itself with its password. An account with no email at all shows "Add email" wording only if U26 allows it (settle at pickup).
- **Right:** the status, never colour alone.
  - Verified: a green check and "Verified".
  - Not verified: a warning icon, "Not verified yet." and a link "Get verification now"; after it is clicked, "Re-send in m:ss" (countdown from the response, same pattern as ACCOUNT-6), then the link again. A line says to open the link in the mail (valid 12 hours).
  - No email: no status.

The verification endpoint is built (auth A33): `POST /api/users/me/email-verification`, no body, answers 200 `{ alreadyVerified, resendAfterSeconds }` (`alreadyVerified: true`: nothing was sent and the profile now says verified, so refetch it), errors `VERIFICATION_RESEND_TOO_SOON` (429, `seconds`: restarts the countdown, no error line), `VERIFICATION_EMAIL_UNAVAILABLE` (400), 404 for a deactivated caller, 503. The existing en and vi copy of those two codes talks about a *code*, so this row uses its own strings (`accountSettings:verifyEmail.*`) for its inline errors. The mail opens a Keycloak confirm page first (one click), then links back to the web app. The profile is refetched when the modal opens and when the window regains focus, so a verification done in the mail tab shows up without a reload.

This ticket mirrors the contracts with MSW handlers, en and vi strings (including the U26 error codes `EMAIL_ALREADY_REGISTERED` and `NEW_EMAIL_SAME_AS_CURRENT` in `errors:codes`), the I18N-4 census rows, Storybook states and e2e.

**Out of scope:** the Keycloak pages and emails (A33); phone verification and phone change (auth A37, V1); a badge outside account settings.

## Scope change 2026-10-20 (owner, second step at U26 pickup): the new email is verified inside the dialog

While scoping U26 the owner replaced "set a password first" (for a Google-only account) with **verifying the new email first**: Verify under the new-address input sends a 6-digit code to it, the code input appears beside the (now resend) button, and the Update email button waits for six digits. The status on the right of the row therefore needs no "unverified after a change" case: a successful change leaves the account Verified. New client strings (en and vi): the Verify and Re-send labels, the code input label and its sent line, the Update email button, `verifyEmail.*` for the status, and `errors:codes` for `EMAIL_ALREADY_REGISTERED` and `NEW_EMAIL_SAME_AS_CURRENT`; the existing `VERIFICATION_CODE_*` copy covers the code input. MSW handlers for both U26 endpoints and e2e for the whole dialog (verify, wrong code, duplicate, success, the row showing Verified).

## Backend contract (user U26, done 2026-10-21)

- `POST /api/users/me/email-change-code` `{ newEmail }` (no spaces: trim first, bean validation refuses them with `400 VALIDATION_FAILED`). 200 `{ resendAfterSeconds: 60, expiresInSeconds: 900 }` and a code is mailed to the new address. Errors: `409 EMAIL_ALREADY_REGISTERED`, `400 NEW_EMAIL_SAME_AS_CURRENT`, `429 VERIFICATION_RESEND_TOO_SOON` (`seconds`; the lock is per user, **not per address**, so after fixing a mistyped address the Verify button waits out the countdown: keep the countdown running when the input is edited and restart it from the 429's `seconds`), `429 NEW_EMAIL_CODE_LIMIT_REACHED` (`seconds`, 10 a day), `404`, `503`.
- `POST /api/users/me/confirmation-code` with `{ purpose: "CHANGE_EMAIL" }` mails the caller-proof code to the **current** address (`useConfirmationCode(CHANGE_EMAIL)`; the TS `ConfirmationPurpose` gains `CHANGE_EMAIL`; `NEW_EMAIL` is never sent by the client).
- `PUT /api/users/me/email` `{ newEmail, newEmailCode, currentPassword | verificationCode }` (exactly one caller proof). 200 `null`. Errors: `CONFIRMATION_REQUIRED`, `CURRENT_PASSWORD_INCORRECT`, `PASSWORD_ATTEMPTS_EXCEEDED` (429), `VERIFICATION_CODE_INVALID` / `_EXPIRED` / `_ATTEMPTS_EXCEEDED` (for either code: the field the code belongs to decides where the line shows), `EMAIL_ALREADY_REGISTERED` (409, taken in the meantime), `NEW_EMAIL_SAME_AS_CURRENT`, `404`, `503`. After a 200 the account is on the new address, **verified**, unlinked from Google (its avatar, if it was the Google picture, is gone): refetch the profile and the avatar.
- Copy to add in `errors:codes`, en and vi, worded for the dialog (the existing `EMAIL_ALREADY_REGISTERED` line is written for the old register page): `EMAIL_ALREADY_REGISTERED`, `NEW_EMAIL_SAME_AS_CURRENT`, `NEW_EMAIL_CODE_LIMIT_REACHED`; I18N-4 census rows for the dialog.
- Warn in the dialog that the change signs the account out of Google (the link is removed) and that the new address becomes the sign-in name.
