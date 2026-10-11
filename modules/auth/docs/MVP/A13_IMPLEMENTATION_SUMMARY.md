# A13 — Localised verification and welcome emails, via a new `email` module

**Status:** DONE 2026-10-11

## Approved design (restated)
Sending moves out of auth into `modules/email` (`email-api`, `email-impl`); auth stays the consumer and owns wording and language. The module only delivers `EmailMessage{to, subject, body}` (plain text, async, fire-and-forget). The A10 reset email moves to it in this ticket (one sender). The verification and welcome emails are localised but not wired to a trigger.

## What was built
- `email-api`: `EmailSender`, `EmailMessage`. `email-impl`: `SmtpEmailSender` (`@Async`, `app.email.from`, failures logged and swallowed). Registered in `settings.gradle`, `server/build.gradle`; auth depends on `email-api` only and no longer depends on `spring-boot-starter-mail`.
- auth: `EmailService` deleted. `EmailMessages` has one `ResourceBundleMessageSource` per bundle (`reset-password`, `verify-email`, `welcome`, en and vi) and `resolveLanguage` now requires **all three** bundles for a language, else English. `EmailVerificationService` renders and sends the verification email (link, `VERIFICATION_VALIDITY_HOURS` shared by the expiry and the text) and has `sendWelcomeEmail` (neutral greeting for a missing name). `PasswordResetService` renders and sends through `EmailSender`. The unused `EmailService` field in `AuthServiceImpl` was removed.
- `app.email.from` / `verification-url` / `reset-password-url` keep their names; `from` is read by email-impl, the URLs by auth.

## Divergences and findings
- **Neither email was ever sent**: `createAndSendVerification` and `sendWelcomeEmail` had no production caller. The ticket's "register with `vi`" IT therefore could not exist; wiring is filed as **A17**, and the IT here proves the module wiring and the rendering instead. The ticket's old out-of-scope line about the reset email was reversed (it moved).
- The shared constant for 24 hours is new; the text used to hard-code it.

## Tests
- Spock: `SmtpEmailSenderSpec` (2), `EmailMessagesSpec`, `EmailVerificationServiceSpec`, `PasswordResetServiceSpec` (language matrix, link and validity).
- **IT changes:** new `EmailModuleIntegrationTest` (4): real forgot-password request sends the Vietnamese reset email with the saved token; verification email in `vi` with the saved token and "24 giờ"; English fallback without a language; welcome email in `vi` greeting by name. Uses a mock `JavaMailSender` and disables the actuator mail health check (it needs a real sender). `PasswordResetIntegrationTest` only had its Javadoc updated.
- `:modules:email:email-impl:test`, `:modules:auth:auth-impl:test` and `:server:test` (565) green.

## Known limits
Mail delivery still cannot be verified without an SMTP server; nothing triggers the verification or welcome email (A17).
