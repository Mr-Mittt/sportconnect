# SESSION-RANKING-RECORD-1 · Confirm a ranking game at the revision the player saw

**Status:** `TODO`
**Type:** Enhancement (small additive change to SESSION-72) · **Depends on:** SESSION-72
**Filed:** 2026-11-23, gap found while building SESSION-72: a confirmation is stored against the record's revision **when the request runs**. If another player edits the game a moment before the confirming player taps, the tap confirms content the player never saw (they are notified of the change, but their open screen is stale).

`POST /api/sessions/{id}/records/{recordId}/verify` accepts an optional `revision` (query parameter) and the record's `ranking` block gains `revision` (additive). When the parameter is present and is not the record's current revision, the call is a 409 `SESSION_RECORD_REVISION_CHANGED` (with `errorParams.revision`, the current one), nothing is stored, and the client refreshes the record and asks again. Absent, today's behaviour holds (backward compatible). The check is done under the record's row lock the verify already takes, so it cannot interleave with an edit.

- Client: CLIENT-SESSION-54 sends the revision of the state it shows and handles the new code (en and vi copy, I18N-4 row); file or extend at its pickup (a mirrored-type and error-code change, CLIENT-NOTIF-4 rule).
- `ERROR_CODES.md`, the design (`STATISTIC_RANKING_DESIGN.md` section 5, "Known gap") and the ticket summary are updated when this is built.

**Out of scope:** propose (a proposal carries no content to agree on beyond the game itself), counting, any change to how stale confirmations work.

**Tests:** Spock for the matching and the mismatch; an integration test through the real endpoint (confirm at the current revision works, at an older one is the 409 and stores nothing, no parameter confirms the current one); a real-thread test of a confirm racing an edit; mutation check.
