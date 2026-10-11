# A17 · Send the verification email at registration and the welcome email after verification

**Status:** `TODO`
**Type:** Feature (needs a product decision)
**Depends on:** **A13** (localised subject/body for both emails, sending through the new `email-api`)

**Filed:** 2026-10-11, found during **A13** pickup.

Neither email is sent today. `EmailVerificationService.createAndSendVerification` has no production caller (`AuthServiceImpl.register` never calls it) and the welcome email has no caller at all (`verifyEmail` does not send it). A13 localises both and leaves them unwired.

To decide: call `createAndSendVerification` after the `register` transaction commits (the A10 pattern, so a mail failure cannot roll back the registration); send the welcome email from `verifyEmail` (never to a deactivated user); and whether login or any feature should be gated on `isEmailVerified` (nothing checks it today).

## Tests

IT: register with `languageCode` `vi`, assert the verification email handed to the email module is Vietnamese with a working link; verify-email sends the welcome email in the user's language; a deactivated user gets none.

## Out of scope

Gating features on verification unless the decision above says so; resend-verification endpoint.
