# SESSION-67 · A host edit of a PREPARING session writes one system comment per changed field

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** none (client side: CLIENT-SESSION-51)
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass. Related: SESSION-24 (the generic `session.details.updated` notification), SESSION-46 (a `PREPARING` session is fully editable), NOTIF-10 (edits while `PREPARING` may be chatty), SESSION-GL-63 / CLIENT-GL-51 (system comments carry a `systemCode` and `systemParams`, the client localises them).

`SessionServiceImpl.updateSession` changes any field of a `PREPARING` session and fires only the field-agnostic `session.details.updated` event, so a participant sees "the session was updated" and cannot tell what changed. New: in the same transaction, compare the old and the new value of every editable field and write **one system comment per changed field** (owner, 2026-11-17: one comment per field, not one per save), so participants can follow the edit in the discussion thread.

**Shape.** One new `SystemCode` value per field (the enum is `com.sportconnect.social.post.api.dto.SystemCode`; its Javadoc is where the params are listed), for example `SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, `SESSION_LOCATION_NOTE_CHANGED`, `SESSION_START_CHANGED`, `SESSION_DURATION_CHANGED`, `SESSION_CAPACITY_CHANGED`, `SESSION_FEE_CHANGED`, `SESSION_AUTO_APPROVE_CHANGED`, `SESSION_GAME_MOOD_CHANGED` and the gender-slot and initial-slot fields. Params are strings, `old` and `new`, with names baked in at write time (a later rename does not rewrite history), and the English `content` stays as the fallback for an old client, exactly like `SESSION_JOINED`. An unchanged value writes nothing; a request that changes nothing writes no comment. Times are written as the instants the client formats in the viewer's zone, never pre-formatted text.

**Notification.** The generic `session.details.updated` notification is unchanged; whether it should be throttled or batched stays the open question of NOTIF-10.

**Open at pickup:** how the attribute map and the description are summarised (one `SESSION_ATTRIBUTES_CHANGED` comment without values, listing the changed attribute titles, is the suggestion); whether the actor's name is baked in or the comment is attributed to the host (follow what `SESSION_RECORDS_UPDATED` does). Client-visible values (a new `systemCode` the client branches on): CLIENT-SESSION-51 is the client case, to ship with or right after this.

**Account lifecycle:** no new endpoint; `updateSession` already requires the host and the per-request gate.

**Out of scope:** Editing in any status other than `PREPARING` (rejected since SESSION-46), the notification content, group sessions beyond what `updateSession` already covers.

**Tests:** Spock for the diff per field (changed, unchanged, several at once, a request that changes nothing); an IT that the comments and the event are written in the same transaction and appear in the thread read with their code and params.
