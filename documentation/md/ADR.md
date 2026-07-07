# Architecture Decision Records (ADR)

Deferred design decisions that need a dedicated discussion before implementation.
Each topic lists the use cases that triggered it and open questions to resolve.

---

## In-app notification

**Status:** Deferred — no notification system exists yet  
**Triggered by:** B1 (Member invitation flow)

### Use cases pending this decision

| # | Feature | Trigger event | Who gets notified |
|---|---|---|---|
| 1 | B1 · Member invitation flow | Owner approves invitation → status moves to `PENDING_USER` | Invited user |

### Open questions

- Push (WebSocket / SSE) vs. polling vs. email-only for MVP?
- Persist notifications in DB (unread count, mark-as-read) or fire-and-forget?
- Single `Notification` entity in a dedicated `notification` module, or per-domain events?
- Which module owns the notification service interface?

### Notes

All current callers stub the notification with `// TODO: notify — pending ADR.md#in-app-notification`.
