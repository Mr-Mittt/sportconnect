# INFRA-11 · Email configuration in deployed environments

**Status:** `DONE` (2026-11-02; the health setting reaches the box with the next server release) · **Type:** Infrastructure · **Dependency:** INFRA-3, INFRA-6; spec in email **E2**

**Filed:** 2026-10-11, from auth **A13**'s look at how the email sender is configured.

**Rewritten 2026-11-02 at pickup.** The ticket as filed (2026-10-11) described GitHub Environment secrets and variables for `dev`/`staging`/`production`, passed into the server container by the INFRA-6 pipeline, with `EMAIL_VERIFICATION_URL` and `RESET_PASSWORD_URL`. None of that matches what was built: the two URL variables went with A28; only `production` is hosted (dev runs on Mailpit); the pipeline never handles secrets (the box pulls images and `start-stack.sh` reads `~/web/server.env`). The mail work itself was done on the box during INFRA-12 and the rebuild (Brevo, INFRA-3 log rows 19 and 23). What was left, and is this ticket:

1. **Delivery proof.** Welcome email (the server's `MAIL_*`) and reset-password email (Keycloak's realm SMTP, `set-smtp.sh`), and the reset link opens the deployed client. Owner's word, 2026-11-02: both emails arrived and the reset link works. Sender-domain authentication (SPF, DKIM, DMARC for `yoursport.vn`) is set up (owner's word, not checked by Claude).
2. **Mail must not drive the server's health.** With the `prod` profile the mail health check was part of `/actuator/health`. The Docker `HEALTHCHECK` and `sportconnect-deploy` (which waits for `healthy` and restores everything on failure) both read it, so a Brevo outage or a wrong SMTP login would have rolled back an unrelated deploy. This was the Delta of 2026-10-26 (found during INFRA-12), worked around with `MANAGEMENT_HEALTH_MAIL_ENABLED=false` until real SMTP existed.

## Decisions (owner, 2026-11-02)

- **Mail is out of the health, in the profile.** `application-prod.yml` sets `management.health.mail.enabled: false` (the `dev` profile already did). The database, Redis and RabbitMQ checks still drive the status. A broken mail setup is found by the delivery check, not by health.
- **The environment story is the box.** `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` and `EMAIL_FROM` live in `~/web/server.env` (`chmod 600`, never in the repo; `infra/oracle/server.env.example` is the template); Keycloak's mail is set by `set-smtp.sh` through the admin API. The GitHub Environments design is dropped, not postponed.
- **Out of scope:** rotating the Brevo SMTP key (deliberately deferred, INFRA-12), mirroring the realm SMTP in the realm file (INFRA-14), a staging environment, changing the mail provider.

## Implementation summary

- `server/src/main/resources/application-prod.yml`: `management.health.mail.enabled: false`, with the reason in a comment.
- `ProdProfileMailHealthSettingTest` (new, unit): loads the real `application-prod.yml` and pins the flag as `false`.
- `MailHealthDisabledIntegrationTest` and `MailHealthEnabledIntegrationTest` (new, extend `BaseIT`): with `management.health.mail.enabled=false` the health contributor registry has no `mail` entry; with the defaults it has one. The second proves the first cannot pass for another reason (for instance a missing mail sender in the test setup).
- Docs: `PRODUCTION_DEPLOYMENT_GUIDE.md` (line on `server.env`, section 7 step 3, history row), `server.env.example` (workaround lines removed), INFRA-6 ticket line, the sandbox runbook line, box log row 34.
- Consumer census: `/actuator/health` is read by the Docker `HEALTHCHECK`, `sportconnect-deploy` and Caddy's outside checks. The change only turns cases that were DOWN because of mail into UP; it never turns UP into DOWN. Compatible as-is. A `server.env` that still sets `MANAGEMENT_HEALTH_MAIL_ENABLED=false` is harmless (same value).

## Verification

- Scoped tests, run 2026-11-02: `ProdProfileMailHealthSettingTest` 1, `MailHealthDisabledIntegrationTest` 1, `MailHealthEnabledIntegrationTest` 1, `ProdProfileSwaggerSettingTest` 1; all passed. Mutation check: with the line removed from `application-prod.yml`, `ProdProfileMailHealthSettingTest` failed (`expected: "false"`); file restored. The full `:server:test` suite was not run (scoped tests only, by the owner's standing rule).
- Delivery: owner's word (see 1 above); no mail headers were pasted.
- **Not run:** on the box, the new setting. It reaches the box with the next server release (`/release server patch`, promote, deploy); after that, `/actuator/health` from the Compose network should still be UP. Breaking the live credentials to watch it stay UP was deliberately not asked of the owner.
