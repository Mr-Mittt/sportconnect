# CLAUDE.md — email

A delivery-only domain. `email-api` is `EmailSender.send(EmailMessage{to, subject, body})`; `email-impl` is the async SMTP sender (`app.email.from`, `spring.mail.*`).

- **No language, template or link knowledge here.** The consumer module renders its own text (auth: `EmailMessages` bundles) and passes it in; a new email type never needs a change in this module.
- **Fire-and-forget.** A delivery failure is logged and swallowed, so a caller must not depend on it. Call it after your own transaction commits.
- Depends on its own `-api` only. Other domains depend on `email-api`, never `email-impl`.
- `@Async` relies on `server`'s `AsyncConfig` (`@EnableAsync`).
- Tests: `SmtpEmailSenderSpec`; real wiring in `server/.../integration/EmailModuleIntegrationTest` (replaces `JavaMailSender` with a mock and turns off the actuator mail health check, which needs a real `JavaMailSenderImpl`).
