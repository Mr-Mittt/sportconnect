# A10 · Wire `POST /api/auth/forgot-password` to issue and email a reset token

**Status:** `DONE` (2026-10-09; reopened the same day for the email-language scope change, finished), see [A10_IMPLEMENTATION_SUMMARY.md](A10_IMPLEMENTATION_SUMMARY.md)
**Type:** Feature (completes an existing placeholder)
**Filed:** 2026-10-05, found during **CLIENT-ERR-2** pickup while checking whether a password-reset API exists. `reset-password` works, but `forgot-password` is a placeholder, so no real reset token can be issued through the API and a user cannot reset a password end to end.

## What

`AuthController.forgotPassword` (`AuthController.java:175`) always returns "If the email exists, a password reset link has been sent" and does nothing: its own comment says it "needs user module integration to find user by email". `PasswordResetService.createAndSendResetToken(userId, email)` already creates the token and calls `EmailService.sendPasswordResetEmail`, but nothing calls it.

Wire it:
1. Look up the user by email through `UserService` (`-api` only; `existsByEmail` / `getUserByEmail` exist). Prefer a lookup that does not throw for an unknown email.
2. If the user exists, call `createAndSendResetToken(userId, email)` **whether or not the account is active** (changed 2026-10-09 by the **A9** scope change: a deactivated user may reset their password, and the account stays deactivated until they log in and confirm re-activation). Resetting the password must not re-activate the account and must not issue tokens. This needs a by-email lookup that includes inactive users (`getUserByEmail` is active-only today).
3. Always return the same 200 and message whether or not the email exists (anti-enumeration), and keep the response time close for both paths where practical (send the email without making the caller wait on it, or accept and document the residual timing signal).
4. Invalidate any earlier unused reset token for that user when issuing a new one, so only the latest link works (decide at pickup; check what `createAndSendResetToken` does today).
5. `resetPassword` should revoke the user's refresh tokens once the password changes, so a stolen session does not outlive the reset (verify what `PasswordResetService.resetPassword` does today before adding).

6. **Scope change (2026-10-09, user decision at pickup): make "one reset token per user" a DB guarantee.** Today it only holds because `createAndSendResetToken` deletes before it inserts; `password_reset_tokens.user_id` (V002) has only a plain index, so two concurrent requests could leave two live rows. Add a Liquibase migration that removes any duplicate rows (keep the newest per user) and adds a unique constraint on `user_id`; `createAndSendResetToken` tolerates the losing side of that race (log, keep the other request's token, still return the uniform 200). The token stays in the auth-owned table, not a `users` column (domain-scoped tables).

7. **Scope change (2026-10-09, user decision after first pass): the reset email is sent in the user's language.** Resolution order: the user's `UserPreference.language` (when it is an active language), else the default language of their country (`countries.default_language_code`, when active), else `en`. A final gate: the language must also have an email bundle (en and vi today); a language that is active in `languages` but has no bundle falls back to `en`. Includes deactivated users. Subject and body both localised; the bundles live in `auth-impl`, the language lookup is a new `UserService` method (cross-domain through `-api` only; the country default comes from `ReferenceService`). The verification and welcome emails stay English here and are filed as **A13**.

## Open points to settle at pickup

- **Reset link target.** `app.email.reset-password-url` defaults to `http://localhost:3000/reset-password`, the old CRA port; the client runs on `:5173`. The new client route is defined by client ticket **AUTH-9** (`/reset-password?token=…`); the config default and the email template must match it.
- **A7 overlap.** A7 (public API surface audit) lists `forgot-password` and `reset-password` as having no client caller, a candidate for removal. This ticket and AUTH-9 are the decision to keep them; A7 must not delete them. Update A7's table when this is picked up.
- **A5 overlap.** An unauthenticated endpoint that sends email needs rate limiting (per IP and per email) before it ships. A5 covers login/register; either extend A5 to this endpoint or add the limit here.
- **Email delivery.** Confirm `EmailService` has a working sender in dev/prod (not a log-only stub), and add the en/vi email copy decision (the email text is backend-authored, see I18N-4).

## Tests

- Spock: existing active user → token created and email sent; unknown email → no token, same response; deactivated user → token created and email sent, same response; after `reset-password` the account is still deactivated.
- IT (`server/.../integration/`): register a user, call `forgot-password`, read the saved token row, call `reset-password` with it and log in with the new password; unknown and deactivated email return the identical 200 body. This is the path that has never run end to end.

## Out of scope

- The client forgot/reset screens: **AUTH-9** (client backlog).
- Email verification (`verify-email`) wiring.
