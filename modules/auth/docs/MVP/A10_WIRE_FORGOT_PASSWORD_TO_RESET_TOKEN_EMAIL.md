# A10 · Wire `POST /api/auth/forgot-password` to issue and email a reset token

**Status:** `TODO`
**Type:** Feature (completes an existing placeholder)
**Filed:** 2026-10-05, found during **CLIENT-ERR-2** pickup while checking whether a password-reset API exists. `reset-password` works, but `forgot-password` is a placeholder, so no real reset token can be issued through the API and a user cannot reset a password end to end.

## What

`AuthController.forgotPassword` (`AuthController.java:175`) always returns "If the email exists, a password reset link has been sent" and does nothing: its own comment says it "needs user module integration to find user by email". `PasswordResetService.createAndSendResetToken(userId, email)` already creates the token and calls `EmailService.sendPasswordResetEmail`, but nothing calls it.

Wire it:
1. Look up the user by email through `UserService` (`-api` only; `existsByEmail` / `getUserByEmail` exist). Prefer a lookup that does not throw for an unknown email.
2. If the user exists **and is active**, call `createAndSendResetToken(userId, email)`. A deactivated user gets no email (CLAUDE.md § Account lifecycle).
3. Always return the same 200 and message whether or not the email exists (anti-enumeration), and keep the response time close for both paths where practical (send the email without making the caller wait on it, or accept and document the residual timing signal).
4. Invalidate any earlier unused reset token for that user when issuing a new one, so only the latest link works (decide at pickup; check what `createAndSendResetToken` does today).
5. `resetPassword` should revoke the user's refresh tokens once the password changes, so a stolen session does not outlive the reset (verify what `PasswordResetService.resetPassword` does today before adding).

## Open points to settle at pickup

- **Reset link target.** `app.email.reset-password-url` defaults to `http://localhost:3000/reset-password`, the old CRA port; the client runs on `:5173`. The new client route is defined by client ticket **AUTH-9** (`/reset-password?token=…`); the config default and the email template must match it.
- **A7 overlap.** A7 (public API surface audit) lists `forgot-password` and `reset-password` as having no client caller, a candidate for removal. This ticket and AUTH-9 are the decision to keep them; A7 must not delete them. Update A7's table when this is picked up.
- **A5 overlap.** An unauthenticated endpoint that sends email needs rate limiting (per IP and per email) before it ships. A5 covers login/register; either extend A5 to this endpoint or add the limit here.
- **Email delivery.** Confirm `EmailService` has a working sender in dev/prod (not a log-only stub), and add the en/vi email copy decision (the email text is backend-authored, see I18N-4).

## Tests

- Spock: existing active user → token created and email sent; unknown email → no token, same response; deactivated user → no token, same response.
- IT (`server/.../integration/`): register a user, call `forgot-password`, read the saved token row, call `reset-password` with it and log in with the new password; unknown and deactivated email return the identical 200 body. This is the path that has never run end to end.

## Out of scope

- The client forgot/reset screens: **AUTH-9** (client backlog).
- Email verification (`verify-email`) wiring.
