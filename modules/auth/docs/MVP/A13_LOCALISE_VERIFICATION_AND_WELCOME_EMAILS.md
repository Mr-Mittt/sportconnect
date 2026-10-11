# A13 · Send the verification and welcome emails in the user's language

**Status:** `DONE`
**Type:** Enhancement (i18n)
**Depends on:** **A10** (adds the language resolution and the email bundles this reuses)

**Filed:** 2026-10-09, split out of **A10** when its email-language scope change covered only the password-reset email.

`EmailService.sendVerificationEmail` and `sendWelcomeEmail` are hardcoded English. A10 adds the resolution (the user's `UserPreference.language` when active, else their country's default language, else `en`, limited to languages that have an email bundle) and the en/vi bundles for the reset email. Reuse both for these two emails: add their subject and body to the bundles in en and vi, and pass the resolved language in.

Open point for pickup: at registration the user row exists but `verify-email` may be sent before the user has set a preference, so the language comes from the registration details (`UserRegistrationDetails.languageCode`, stored as the preference at register) or the country default. Confirm the order of operations in `AuthServiceImpl.register` so the preference is saved before the email is sent.

## Tests

Spock: language chosen per email type and fallback order. IT: register with `vi` and check the verification email language.

## Out of scope

HTML email templates; languages beyond en/vi; the reset email (A10).

## Scope change (2026-10-10): extract a standalone email module

Asked by the user at pickup. Sending moves out of auth into a new domain module, `modules/email/email-api` + `email-impl`. The module only delivers a message it is handed (recipient, subject, body); it knows nothing about languages, bundles or links. Auth stays the consumer: it resolves the language, renders subject and body from its own `EmailMessages` bundles, and calls the email `-api`. This keeps the domain boundary clean and lets email be extracted to its own service later.

Open points to settle in Phase 1/2: whether the A10 password-reset send migrates to the new module in this ticket (otherwise two senders coexist), and whether the A13 localisation work is wired to a real registration/verification trigger (see "Finding" below).

**Finding (2026-10-10):** `createAndSendVerification` and `sendWelcomeEmail` have no production callers, so neither email is sent today. The ticket's IT ("register with `vi`") needs the verification email wired into `register` first.

**Decisions (2026-10-11):** the A10 reset email moves to the new module in this ticket (one sender, behaviour unchanged). The verification and welcome emails are localised but stay unwired; wiring is filed as **A17**, so the "register with `vi`" IT moves there. The IT here instead covers the real wiring of the new module (context startup, send reaching the mail sender) and the language rendering.
