# Notification Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/notification` (new — `notification-api` + `notification-impl`)
**Last updated:** 2026-08-16

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

Design record: `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`. Ticket IDs use the `NTF-`
prefix, distinct from the `NOTIF-<n>` numbering used in `documentation/md/NOTIFICATION_USE_CASES.md`
(that file tracks candidate "should this notify" questions across the whole app; `NTF-` tracks this
module's own implementation work).

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [NTF-4](MVP/NTF-4_NOTIFICATION_RESPONSE_ENRICHMENT.md) | `NotificationResponse` enrichment — actor names + entity title | `DONE` |
| 2 | [NTF-1](MVP/NTF-1_MODULE_SCAFFOLDING.md) | Module scaffolding — entity, aggregation logic, read REST endpoints | `DONE` |
| 3 | [NTF-2](MVP/NTF-2_RABBITMQ_CONSUMER.md) | RabbitMQ consumer — `sportconnect.events` exchange, recipient resolution | `DONE` |
| 4 | [NTF-3](MVP/NTF-3_STOMP_LIVE_DELIVERY.md) | STOMP-over-RabbitMQ live delivery to the client | `DONE` |
