# SESSION-72 · Ranking games: propose a record and verify it (server)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 (done) · **First of the statistic and ranking chain** (server first: LOC-5, SESSION-72, SESSION-53, SESSION-73, SESSION-54; then the client: CLIENT-SESSION-54, 41, 42).
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`).

A record becomes a **ranking game** when someone who may log proposes it and every player named in it confirms it. Design: `modules/session/docs/STATISTIC_RANKING_DESIGN.md` section 5.

- **Data:** `session_records.ranking_requested_by`, `ranking_requested_at` (a flag); new table `session_record_verifications (record_id, user_id, verified_at, country_id, region_id)`, primary key (record_id, user_id); the country and region are the player's values at the moment of confirming (the snapshot, owner 2026-11-23). Liquibase and the H2 `schema.sql` mirror.
- **`POST /api/sessions/{id}/records/{recordId}/ranking-request`:** anyone the records access rule lets log; session ongoing or completed and not past `scheduledEndAt + 24h`; the record must be **rankable** by the reader of its type (for `COMPETITIVE`: a complete score with a strictly higher first team; the reader is shared with SESSION-53, so this ticket builds the `RecordTypeReader` interface and the `COMPETITIVE` reader first) and the sport must allow ranking games (409 `SESSION_RECORD_RANKING_NOT_RANKABLE` with the reason as a parameter, `SESSION_RECORD_RANKING_NOT_AVAILABLE`). Sets the flag and sends `session.record.verification.requested` to every other player of the record who is active (`UserService.getActiveUserIds`, a new interaction), one per player per proposal. The proposer is not a confirmer unless they are a player.
- **`POST /api/sessions/{id}/records/{recordId}/verify`:** only a player named in the record (403 `SESSION_RECORD_VERIFY_NOT_A_PLAYER`), only while proposed, same window; the player must have a region (409 `SESSION_RECORD_VERIFY_REGION_REQUIRED`). `INSERT ... ON CONFLICT DO NOTHING`, so a second tap does nothing.
- **State, derived:** NORMAL, PROPOSED, VERIFIED (flag and a confirmation from every player). The record DTO gains `ranking: { status, requestedBy, confirmedBy[] }` (additive).
- **Edit resets:** an update that changes a record's `data` or players clears the flag and deletes its confirmations inside the row lock the update already takes; verify takes the same lock and re-reads the record. A delete removes the confirmations. A change set that does not change the content (UNCHANGED) clears nothing.
- **Notification:** new outbox event and routing key `session.record.verification.requested`; `notification-impl` fans it out; client case in CLIENT-SESSION-54 (CLIENT-NOTIF-4 rule). Log it as NOTIF-16 in `documentation/md/NOTIFICATION_USE_CASES.md`.
- **Account lifecycle:** both endpoints are behind the per-request active gate; a deactivated player cannot propose or confirm and is not notified.
- **Census at pickup:** `SessionRecordResponse` and the client's mirrored type, the change-set update path, `SessionImportWriter` (must leave the flag empty), MSW handlers, ERROR_CODES, `NotificationType`.

**Out of scope:** counting the game (SESSION-53); a refusal state (not designed); guests (SESSION-52 will block proposing a record with a guest).

**Tests:** Spock for the state rules, the edit reset and the notification fan-out; `server/src/test/.../integration` for propose and verify through the real endpoints (non-player 403, no region 409, outside the window, edit after confirm resets, deactivated not notified, concurrent confirms, verify racing an edit); mutation check per rule.
