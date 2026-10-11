# E1 · Local mail catcher in the dev compose stack

**Status:** `TODO` · **Type:** Dev environment · **Dependency:** none (infra **INFRA-2** owns the compose file; this edits it)

**Filed:** 2026-10-11, found while explaining the sender configuration during auth **A13**.

`spring.mail.host` defaults to `smtp.gmail.com` with empty credentials, so locally every email fails to log in and is logged and swallowed: forgot-password returns 200 and saves a token, but no mail can be read. Add Mailpit (`axllent/mailpit`, SMTP `1025`, web UI `8025`) to `infra/docker-compose.dev.yml`, and make `application-dev.yml` point at it (`MAIL_HOST=localhost`, port `1025`, no auth or STARTTLS, since `application.yml` forces both on).

## Tests / verification

Run the stack, request forgot-password, read the email in the UI. No automated test: the module's own ITs already mock the mail sender.

## Out of scope

Production delivery (**E2**); `infra/documentation/MVP/INFRA-2_*` gets a one-line usage note.
