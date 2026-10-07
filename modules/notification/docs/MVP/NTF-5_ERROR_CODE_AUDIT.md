# NTF-5 · Error code audit: notification module

**Status:** `DONE` (2026-10-07)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **notification**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-8** lists the final codes.

**Scope:** notification list, mark read / mark all read, live delivery auth.

**Known messages to start from (not exhaustive — the audit finds the rest):** about 3 throw sites; enumerate at pickup.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `PUT /notifications/{id}/read` | Notification not found (404, `NotificationGate.require`) | NOT_FOUND | `NOTIFICATION_NOT_FOUND` | none (message has no id, id logged) | Nothing shown; refetch list and unread count (CLIENT-ERR-8). |
| `PUT /notifications/{id}/read` | You do not have access to this notification (403, another user's row) | FORBIDDEN | `NOTIFICATION_FORBIDDEN` | none | Generic copy. Only reachable with a crafted id; the list returns the caller's own rows. |
| `GET /notifications`, `GET /notifications/unread-count` | none, scoped to the caller, empty is a 200 | n/a | none | | No error surface. |
| STOMP `CONNECT` | `StompAuthenticationException` (missing/invalid token) | UNAUTHENTICATED | none | | A WebSocket frame error outside `ApiResponse`; the client reconnects after a token refresh. |
| RabbitMQ consumers | internal only | n/a | none | | No user surface. |
| **Deactivated caller** | no REST or STOMP check of `isActive` | n/a | none | | Same answers as any caller: the known U12 gap, out of scope. |

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-8**, filed alongside this ticket.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Scope decisions (2026-10-07, pickup)

- **2 new codes**, registered in `ERROR_CODES.md` § notification: `NOTIFICATION_NOT_FOUND` (404), `NOTIFICATION_FORBIDDEN` (403). No status moved.
- **Stay uncoded:** list and unread-count (no error path), STOMP `CONNECT`, consumers.
- **Logging (approved):** the 404 logs `Notification {} not found` and the 403 a `warn` with caller and id, since `GlobalExceptionHandler` logs neither and the id is not in the response.
- No client-visible enum is added; the client case is CLIENT-ERR-8 (note added there).

## Implementation summary (2026-10-07)

**Approved design, as built.** No migration, entity, DTO or schema change.

- `NotificationServiceImpl.markAsRead` calls the coded `ResourceGate.require` with `NOTIFICATION_NOT_FOUND` / `NOTIFICATION_FORBIDDEN` and the unchanged English messages; the class gained `@Slf4j` for the two log lines (a `notificationGate.isVisibleTo` check decides the 403 log).
- Javadoc: `NotificationService.markAsRead` (`-api`) names the codes; `NotificationController` `@ApiResponses` for 403/404 too.
- `ERROR_CODES.md` § notification added and the "Still to come" line removed: every Phase B audit is now done.

**Consumer census.** Client `useMarkNotificationRead`, `useMarkAllNotificationsRead`, `useUnreadNotificationCount`: compatible as-is (all `errorDisplay: 'silent'`, no status or code branch; `errorCode` is additive and status and message are unchanged). MSW `notifications.ts`: updated (404 gains `NOTIFICATION_NOT_FOUND`). No other backend module calls `NotificationService.markAsRead`. Follow-up: client behavior and copy are CLIENT-ERR-8 (note added, may close as a no-op for notifications).

**IT changes.**
- `server/src/test/java/com/sportconnect/integration/NotificationAccessGateIntegrationTest.java`: the non-owner 403 and the unknown-id 404 now also assert `errorCode`, absent `errorParams` and `message`; **new** `list_onlyReturnsTheCallersOwnNotifications_andNeverErrors` (another user's row is absent from the caller's page, 200, no `errorCode`). 5 tests, previously 4.

**Tests.** Spock `NotificationServiceImplSpec`: stubs moved to the 6-argument `require`; the not-found and forbidden cases verify the codes and messages passed to the gate and assert `errorCode`, `errorParams` and `message` on the thrown exception. `:modules:notification:notification-impl:test` passes. Full `:server:test`: 526 tests, 0 failures, 0 errors (525 before plus the 1 new). Client: `tsc -b` clean; scoped e2e `notification-bell.spec.ts`, 5 passed (the only spec touching the changed MSW handler). The full e2e project, Vitest and visual-regression were not run (no client source changed, only a mock).
