# INFRA-11 · Email configuration in deployed environments

**Status:** `TODO` · **Type:** Infrastructure · **Dependency:** INFRA-3, INFRA-6; spec in email **E2**

**Filed:** 2026-10-11, from auth **A13**'s look at how the email sender is configured.

The server reads `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_VERIFICATION_URL` and `RESET_PASSWORD_URL`. None is set by anything in `infra/` or `.github/`, and the URL defaults point at localhost. Provide them per GitHub Environment (`dev`/`staging`/`production`): the SMTP credentials as environment secrets, the rest as variables, passed into the server container by the INFRA-6 pipeline. No credentials in the repo.

Done when a deployed environment can send a reset email and its link opens the deployed client, verified on that environment (a GitHub-side conditional until INFRA-3/6 exist).
