# A22 · Users with no email (phone-only, e.g. Zalo) have no recovery or notification path

**Status:** `TODO` · **Type:** Feature / gap · **Depends on:** the social-login feature (Google/Facebook/Zalo via Keycloak), which is what first allows an account without an email

**Filed:** 2026-10-14, from the social-login `/feature` scoping. Zalo often returns no email. The user decided accounts may be identified by a unique phone number as well as by email, and that what a phone-only user can do about email-dependent features is **out of scope of that feature**. This ticket keeps the problem on the backlog.

## What

Today every account has an email (`users.email` is `NOT NULL UNIQUE`) and several flows assume it: forgot-password, email verification (`is_email_verified`), the welcome email, and any future email notification (see `documentation/md/NOTIFICATION_USE_CASES.md`). Once a phone-only account can exist, decide and build what such a user gets:

- a way to **add and verify an email** later (Account Settings), and the effect on login identity if they do;
- what **password reset** means for them (no email to send to; with Keycloak, whether a phone/SMS step exists or the answer is "sign in with your provider");
- what the **verification, welcome and notification** code does when `email` is `null` (must skip, not fail);
- whether anything in the **client** (profile, Account Settings, AUTH screens) shows or requires an email and breaks on `null` (client ticket to be filed with the decision).

## Out of scope

The social-login feature itself, SMS delivery, and phone verification as a login method.

## Done when

The behaviour for a user with no email is decided in this ticket, built, and covered by an integration test through the real request pipeline; the client follow-up exists as a real entry in `client/docs/BACKLOG_MVP.md`.
