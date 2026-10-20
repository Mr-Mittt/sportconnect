# ACCOUNT-7 · Verify the email from account settings

**Status:** `TODO` · **Type:** Feature · **Depends on:** auth A33 (the backend endpoint and the sync of the flag) · **Gates:** nothing

**Filed:** 2026-10-20, from the auth A33 pickup: email verification became an optional step (an unverified account works as normal), and the owner wants a manual way to start it from account settings.

## What

In the account settings modal, the email row shows whether the address is verified (the profile already carries `isEmailVerified`; nothing displays it today). When it is not verified: a "Send verification email" button, a resend countdown taken from the response (same pattern as the ACCOUNT-6 emailed code), and a line saying to open the link in the mail. When it is verified: a "Verified" badge and no button. An account with no email shows neither.

The endpoint is built (auth A33, done 2026-10-20): `POST /api/users/me/email-verification`, no body, answers 200 `{ alreadyVerified, resendAfterSeconds }` (`alreadyVerified: true`: nothing was sent and the profile now says verified, so refetch it), errors `VERIFICATION_RESEND_TOO_SOON` (429, `seconds`), `VERIFICATION_EMAIL_UNAVAILABLE` (400), 404 for a deactivated caller, 503; both codes already have their en and vi strings. The mail opens a Keycloak confirm page first (one click), then links back to the web app. This ticket mirrors them, with MSW handlers, en and vi strings, the I18N-4 census rows, Storybook states and e2e. The profile is refetched when the modal is reopened and when the window regains focus, so a verification done in the mail tab shows up without a reload.

**Out of scope:** the Keycloak pages and emails (A33); phone verification (auth A37, V1); a badge outside account settings.
