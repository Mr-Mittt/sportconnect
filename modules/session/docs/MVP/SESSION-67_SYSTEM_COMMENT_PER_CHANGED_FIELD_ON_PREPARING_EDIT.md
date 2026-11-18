# SESSION-67 · A host edit of a PREPARING session writes one system comment per changed field

**Status:** `DONE` (2026-11-18)
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

## Scope change, 2026-11-18 (owner, at pickup): four sentence shapes

Why: the owner wants the thread to read as plain sentences that say what the host did, not one template for every change. The comment's **shape** depends on the old and new value, and the client picks the wording from the two params, so no extra param is needed. The server's English `content` fallback uses the same four shapes.

| Shape | When | Wording (en) |
|---|---|---|
| **added** | old value empty, new value set | `Alex added the start time "19:00"` |
| **updated** | a free-text field (title, location note, fee note) goes from one non-empty text to another | `Alex updated the fee note "Bring cash"` (the new text only) |
| **changed** | every other field, old and new both set | `Alex changed the fee from "Free" to "Split"` |
| **removed** | new value empty | `Alex removed the duration` (no value) |

- The text fields are **title, location note and fee note**; for them "added" and "removed" apply as above and "changed from X to Y" is never used. Every other field (start, duration, location, capacity, fee, auto approve, initial slot, male and female slots, game mood) uses added, changed or removed.
- "Empty" means null, blank text, or the value that clears the field (slots `0`). A field that cannot be empty (fee type, game mood, auto approve, location) is only ever "changed".
- The attributes comment has no values: its wording is the plain "Alex updated the sport details" (assumed, not discussed; say at review if another wording is wanted).
- The values in quotes are baked in at write time as strings (names, not ids; times are ISO instants the client formats in the viewer's zone); a missing param falls back to the stored English `content` (CLIENT-SESSION-51).

Decisions confirmed with the owner at the same gate: the editor's name is baked in as a `name` param; no comment for the description (SESSION-48 removes it); one `SESSION_ATTRIBUTES_CHANGED` comment without values; the fee type and amount travel together in one comment, the fee note has its own code; location written by name; a start-only edit writes only the start comment. Answer to "anything to add or remove": nothing more.

---

## Implementation summary (2026-11-18)

**Design as approved** ("go ahead", 2026-11-18), built as designed; the four sentence shapes of the scope change above are the contract. No divergence from the plan.

**Built.**
- **`SystemCode` (post-api):** 14 new values, one per field: `SESSION_TITLE_CHANGED`, `_LOCATION_`, `_LOCATION_NOTE_`, `_START_`, `_DURATION_`, `_CAPACITY_`, `_FEE_`, `_FEE_NOTE_`, `_AUTO_APPROVE_`, `_INITIAL_SLOT_`, `_MALE_SLOTS_`, `_FEMALE_SLOTS_`, `_GAME_MOOD_` and `_ATTRIBUTES_CHANGED`. The longest is 28 characters, so no migration (`comments.system_code` is `VARCHAR(40)`, a string enum, no check constraint).
- **`SessionFieldChanges` (session-impl, pure logic):** `snapshot(Session)` and `diff(before, after, editorName, locationNames)`. The diff compares **stored values**, so a request that re-sends what is already stored writes nothing. Fixed order (the edit form's): title, location, location note, start, duration, capacity, fee, fee note, auto approval, initial slots, male slots, female slots, game mood, attributes.
- **Params (all strings, `""` = no value):** `name` (the editor, baked in), `old`, `new`; `SESSION_FEE_CHANGED` carries `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd` (amount empty unless `FIXED`); `SESSION_ATTRIBUTES_CHANGED` carries `name` only. Location is a name, start an ISO instant, duration minutes, booleans `true`/`false`; a slot of `0` or `null` is empty (so is `initialSlot` 0). The English `content` fallback uses the four shapes (added / updated for the three text fields / changed / removed); the start there is `yyyy-MM-dd HH:mm UTC` because a fallback has no viewer zone.
- **`SessionServiceImpl.updateSession`:** snapshot before applying, diff after `save`, then one `createSystemSessionComments` batch (one insert, one Redis increment per row), written before the `session.details.updated` outbox row, in the same transaction (a failed write rolls the edit back and sends no notification). The editor's name is looked up once and only when something changed; both location names come from one `getLocationsByIds` call and only when the location changed. The comments are authored by the session's creator (a group admin's edit names the admin in `name` but the author is the creator) and do not emit `session.comment.created`.
- **Attributes** are compared as JSON with a numeric-aware comparator (`1` equals `1.0`, jsonb hands back a different number type than the request) and `null` counts as `{}`, so a re-save of the same attributes writes no comment.

**Decisions at pickup (owner, "go ahead"):** the editor's name is baked in; no comment for the description (SESSION-48 removes it); one attributes comment with no values; the fee type and amount in one comment, the fee note its own; location by name; a start-only edit writes only the start comment (the end moves, the duration does not); initial slot 0 counts as empty (assumed, not discussed).

**Consumer census.**

| Consumer | Result |
|---|---|
| `SystemCode` (enum in `post-api`) and the `comments.system_code` column | additive; **compatible as-is** (no migration, no check constraint) |
| Client `Comment.systemCode` (a plain `string`), `systemEntryText`, `CommentItem` | **compatible as-is**: an unknown code shows the stored English `content`; the localised copy is **CLIENT-SESSION-51** (filed, wording rules and the contract added to it) |
| `SessionServiceImplSpec` (51 `updateSession` references) | passes unchanged; 7 new cases added |
| `SessionPreparingLifecycleIntegrationTest`, `SessionErrorCodesIntegrationTest` | pass; 3 new cases in the first |
| `SessionAttributesIntegrationTest` | **updated**: its teardown deleted posts before comments, and a PUT now leaves system comments, so it failed with a foreign-key error (and the failure cascaded into `SessionErrorCodesIntegrationTest` through the shared test database); it now deletes comments first |
| `session.details.updated` and `SessionUpdatedEvent` | **compatible as-is**, unchanged |
| MSW mocks, client types | no change |

**Account lifecycle:** no new endpoint; `updateSession` already requires the host (or a group owner/admin) and the per-request gate. **N+1:** none (one batch insert, one user lookup, one location lookup per edit).

**Tests.**
- **Spock:** `SessionFieldChangesSpec` (new: each text field in added / updated / removed, each other field in added / changed / removed, the fee in five combinations and a stale amount, the start ISO text, a start-only edit that moves the end, the duration, the location lookup once and never when unchanged, attributes with numerically equal values, several fields in order, nothing changed, the snapshot) and `SessionServiceImplSpec` (7 new: one batch with the editor's name and the creator as author, a re-send writes nothing and still notifies once, an empty request, both location names in one lookup, only the new one when there was none, a group admin edit, a failed comment write sends no notification).
- **Integration** (`SessionPreparingLifecycleIntegrationTest`, real wiring and H2): a PUT of six fields shows six comments in `GET /api/sessions/{id}/comments` with their code and params, authored by the creator, one `session.details.updated` row and no `session.comment.created` row; a PUT of the stored values writes no comment; a PUT whose comment write fails (the companion post deleted) rolls the whole edit back (title and capacity unchanged, no event).
- **Mutation check:** 20 mutants of the diff and the wiring, all killed (shape branches, trimming, numeric comparison, duration unit, fee amount, stale amount, slot 0, editor lookup per change, location lookup always, start format, on/off, fee text, old/new swapped, no name, comments never written, empty list written, author = editor, null location id looked up, wrong post). The first run of the null-location-id mutant matched two places in the file and did not run; it was re-run with a specific pattern and killed.

**Verification.** `session-impl` and `post-impl` module tests pass; `:server:test` was run for `SessionPreparingLifecycleIntegrationTest`, `SessionAttributesIntegrationTest` and `SessionErrorCodesIntegrationTest` (all pass). **Not done:** the full `:server:test` (scoped runs, the standing rule); a run against a real Postgres or a live server (no migration, and the batch insert is the one `createSystemSessionComments` already uses); the order in which the comments of one save appear in the thread is **not asserted** (each row gets its own creation timestamp from one `saveAll` and the thread reads newest first, so the last field of a save is probably shown first; CLIENT-SESSION-51 must not depend on the order).

**Visual-regression expectation.** No client code change (only the CLIENT-SESSION-51 ticket text), so no baselined surface is touched and no baseline change is expected. **E2E:** not applicable (backend ticket, no `client/src` or `client/e2e` change).

**Release notes.** `documentation/release-notes/SERVER.md` Unreleased: the Changes line, nothing applied automatically or by hand, rollback (the comments stay and show their English text on an older server), Depends on CLIENT-SESSION-51 (either order). `PROGRESS.md` updated; NOTIF-10 in `NOTIFICATION_USE_CASES.md` records the answer for edits.
