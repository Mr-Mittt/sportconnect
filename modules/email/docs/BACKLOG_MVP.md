# Email Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/email` (`email-api`, `email-impl`)
**Last updated:** 2026-10-11

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session, `DONE` when implementation + tests are complete
- Use `/workon email MVP` to resume

The module only delivers a message it is handed; wording and language belong to the consumer (see `modules/email/CLAUDE.md`). Created by auth **A13**.

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [E1](MVP/E1_LOCAL_MAIL_CATCHER_IN_DEV_COMPOSE.md) | Mailpit in the dev compose stack so reset/verification emails can be read locally; the default today is Gmail with empty credentials, so nothing arrives | `TODO` |
| 2 | [E2](MVP/E2_PRODUCTION_EMAIL_DELIVERY.md) | Production delivery: choose the provider (SES recommended on AWS), authenticate the sending domain, fail loudly on missing config; deployed secrets are **INFRA-11** | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
