# SESSION-3 · Full status lifecycle (ONGOING, CANCELLED)

`SessionStatus` gains `ONGOING` (automatic, via `SessionGenerationJob.startOngoingSessions`,
every 15 min — `SCHEDULED` → `ONGOING` once `scheduledStart` arrives, only for sessions with a
`scheduledEndAt`; no-duration sessions skip straight to `COMPLETED` as before) and `CANCELLED`
(manual only, via the new `POST /api/sessions/{id}/cancel`, same creator/owner-admin gating as
`updateSession`). `Session` gains `cancelReason` (optional free text), `cancelledBy`,
`cancelledAt`. **`deleteSession`/`DELETE /api/sessions/{id}` was removed entirely** — cancel is
now the only way to remove a session from active use, always soft (row kept). `joinSession`
rejects joining a `CANCELLED` session. No notification/cleanup flow on cancel (joined
participants aren't told) — not requested, not built.
