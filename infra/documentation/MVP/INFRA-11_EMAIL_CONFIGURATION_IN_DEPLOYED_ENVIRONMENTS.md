# INFRA-11 · Email configuration in deployed environments

**Status:** `TODO` · **Type:** Infrastructure · **Dependency:** INFRA-3, INFRA-6; spec in email **E2**

**Filed:** 2026-10-11, from auth **A13**'s look at how the email sender is configured.

**Delta 2026-10-26 (found during INFRA-12):** with the `prod` profile and no SMTP credentials, the server's aggregate `/actuator/health` reports `DOWN` (`Mail health check failed: failed to connect, no password specified?`), because `application-dev.yml` disables the mail health check (`management.health.mail.enabled: false`) and `application-prod.yml` does not. Any health check in front of a `prod` server (Docker, a load balancer, the INFRA-6 pipeline) would see it as unhealthy. This ticket must either give every deployed environment real SMTP settings or decide that mail must not drive overall health; INFRA-12's sandbox sets `MANAGEMENT_HEALTH_MAIL_ENABLED=false`. Also note the variable names above are out of date: `EMAIL_VERIFICATION_URL` and `RESET_PASSWORD_URL` went with A28, and the server now reads `MAIL_*` and `EMAIL_FROM` only (the welcome email); Keycloak sends its own mail with its own SMTP settings.

The server reads `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_VERIFICATION_URL` and `RESET_PASSWORD_URL`. None is set by anything in `infra/` or `.github/`, and the URL defaults point at localhost. Provide them per GitHub Environment (`dev`/`staging`/`production`): the SMTP credentials as environment secrets, the rest as variables, passed into the server container by the INFRA-6 pipeline. No credentials in the repo.

Done when a deployed environment can send a reset email and its link opens the deployed client, verified on that environment (a GitHub-side conditional until INFRA-3/6 exist).
