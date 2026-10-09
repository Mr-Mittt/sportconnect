# A13 · Send the verification and welcome emails in the user's language

**Status:** `TODO`
**Type:** Enhancement (i18n)
**Depends on:** **A10** (adds the language resolution and the email bundles this reuses)

**Filed:** 2026-10-09, split out of **A10** when its email-language scope change covered only the password-reset email.

`EmailService.sendVerificationEmail` and `sendWelcomeEmail` are hardcoded English. A10 adds the resolution (the user's `UserPreference.language` when active, else their country's default language, else `en`, limited to languages that have an email bundle) and the en/vi bundles for the reset email. Reuse both for these two emails: add their subject and body to the bundles in en and vi, and pass the resolved language in.

Open point for pickup: at registration the user row exists but `verify-email` may be sent before the user has set a preference, so the language comes from the registration details (`UserRegistrationDetails.languageCode`, stored as the preference at register) or the country default. Confirm the order of operations in `AuthServiceImpl.register` so the preference is saved before the email is sent.

## Tests

Spock: language chosen per email type and fallback order. IT: register with `vi` and check the verification email language.

## Out of scope

HTML email templates; languages beyond en/vi; the reset email (A10).
