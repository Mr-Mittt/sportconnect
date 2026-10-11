# E2 · Production email delivery

**Status:** `TODO` · **Type:** Production readiness · **Dependency:** infra **INFRA-3** (AWS foundation), **INFRA-11** (deployed secrets)

**Filed:** 2026-10-11, found while explaining the sender configuration during auth **A13**.

Nothing in the repo configures real delivery: no `MAIL_*` / `EMAIL_FROM` in `infra/` or `.github/`. Reset (A10) and, once A17 wires them, verification and welcome emails would all fail silently in production.

**To decide in Phase 1.** Recommendation: **Amazon SES over its SMTP endpoint** (the target is AWS, `SmtpEmailSender` and `application.yml` already speak SMTP, so provider choice is configuration only, port 587 with STARTTLS, never 25 on EC2). Alternative: the SES API through a new `EmailSender` implementation, if SMTP limits get in the way (the `-api` already allows it).

**Work**
- Verify the sending domain with SES (DKIM, SPF, a DMARC record) and set `EMAIL_FROM` to an address on it. Leave the SES sandbox (production access request), otherwise only verified recipients get mail.
- Fail loudly: in a non-dev profile, refuse to start (or log a startup ERROR) when `MAIL_HOST`/credentials are the Gmail-and-empty defaults, instead of failing on the first user's reset.
- Bounce/complaint handling and retry on transient failure are out of scope here but must be noted: today a failed send is only logged (fire-and-forget), so a user can wait for an email that never comes. File a ticket if A17 makes verification mandatory.
- Document the variables in `modules/email/CLAUDE.md`.

## Tests

IT: the startup check rejects the defaults under the prod profile and accepts configured values. A real send to the SES mailbox simulator is a manual conditional, recorded as such.

## Out of scope

HTML templates, marketing mail, the secrets plumbing (**INFRA-11**).
