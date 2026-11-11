# SESSION-46 · Per-gender slots, game mood, fee note, optional title, and a real PREPARING lifecycle (edit everything, then Schedule)

**Status:** `DONE` (2026-11-11)
**Type:** Enhancement · **Depends on:** none (amends SESSION-24's rules) ·
**Filed:** 2026-11-11, from a `/feature` planning session with the owner (six session points, decided together; the client half is filed as CLIENT-SESSION-<next>, which depends on this API).

A host can say how many open slots there are but not for whom, cannot say how serious the game is or add a note about the fee, and a `PREPARING` session can only gain a location and a fee and then flips to `SCHEDULED` on its own. This ticket adds the fields and makes `PREPARING` a real draft state: fully editable, left only by an explicit **Schedule** action; once `SCHEDULED`, details are locked. Server only; the client form, popups and banners are the client ticket.

## 1. New fields (all on `Session`, `CreateSessionRequest`, `UpdateSessionRequest`, `SessionResponse`)
- **`maleSlots`, `femaleSlots`** — nullable `INTEGER`, `>= 0`, informational only like `capacity`: never enforced on join, never decremented. Rule: `maleSlots + femaleSlots <= capacity - initialSlot` (the open seats; the rest mean "any gender"), checked on the resulting values at create and update. Coded 400 `SESSION_GENDER_SLOTS_EXCEED_OPEN`. Update: non-null replaces, null leaves, `0` clears. Generated recurring sessions: null.
- **`gameMood`** — `INTEGER NOT NULL DEFAULT 5`, `CHECK (game_mood BETWEEN 1 AND 10)` (1 = for fun, 10 = competitive). Required on create (`@NotNull @Min(1) @Max(10)`), optional on update. Existing rows backfill to 5; generated recurring sessions get 5. Coded 400 for out of range.
- **`feeNote`** — nullable `VARCHAR(300)`, trimmed, blank stored as null, allowed for every fee type, not cleared when the fee type changes (unlike `feeAmountVnd`). Update: non-null replaces, empty string clears.
- Migrations `V085`, `V086`, `V087` (one per field group, after V084), registered in `db.changelog-master.xml`, mirrored in `server/src/test/resources/schema.sql`.

## 2. Optional title
`title` is already optional on the server, but `createSession` builds the companion post text as `"Session: " + request.getTitle()`, which becomes `"Session: null"`. A blank title is trimmed to null and the post text falls back to a fixed string. The client shows its own fallback title (client ticket).

## 3. PREPARING lifecycle (amends SESSION-24)
- **Status at create:** `SCHEDULED` only when location, `feeType` **and** `scheduledEndAt` (duration) are all present, otherwise `PREPARING` (today only location and fee count).
- **`updateSession` while `PREPARING`:** every field may change (title, description, location, location note, start, duration, capacity, fee, fee amount, auto approve, initial slot, attributes, plus the three new fields). Sport and group stay fixed. **In any other status the whole call is rejected** with 409 `SESSION_NOT_PREPARING` (today only location and fee are locked).
- **The automatic `PREPARING` → `SCHEDULED` flip in `updateSession` is removed.**
- **New `POST /api/sessions/{sessionId}/schedule`** (`SessionService.scheduleSession`, `hasRole('USER')`, `requireCanModify`): 409 `SESSION_NOT_PREPARING` unless `PREPARING`; 400 `SESSION_NOT_READY` listing the missing names (`location`, `fee`, `duration`; fee also counts as missing for `FIXED` without an amount) when any is absent; otherwise status = `SCHEDULED`, returns the `SessionResponse`. The same set drives the create-time status rule, so the two cannot drift.
- **Start-time edits keep the duration:** when `scheduledStart` changes and `durationMinutes` is not sent, `scheduledEndAt` moves by the same amount; a sent `durationMinutes` wins; a session without an end stays without one.

## Account lifecycle
The new endpoint is authenticated and creator/owner-admin only. A deactivated caller is refused by the JWT filter's per-request `isActive` gate before the method runs, and `requireCanModify` is the second check; the deactivated-creator case gets a test.

## Notifications
The existing `session.details.updated` fan-out stays on every successful `PREPARING` edit (may be chatty while a host edits several times). Scheduling does not notify yet: logged in `documentation/md/NOTIFICATION_USE_CASES.md` as NOTIF-10.

## Client-visible changes (client ticket files alongside)
New fields on `SessionResponse` and the create/update requests; new endpoint; new error codes `SESSION_GENDER_SLOTS_EXCEED_OPEN`, `SESSION_NOT_READY`, and out-of-range mood; `SESSION_NOT_PREPARING` now means "this session can no longer be edited". Register in `documentation/md/ERROR_CODES.md` § session.

## Consumer census (to run at pickup)
`SessionResponse` readers (client types, `client/e2e/mocks`, `*.test.tsx`); `updateSession` callers (client `useUpdateSession`, `SessionPreparingCompletion`); specs and ITs asserting auto-flip or edit-after-SCHEDULED; specs and ITs creating a duration-less session expecting `SCHEDULED`; `SessionGenerationService` (builds its own sessions: confirm it sets its own status and stays unaffected); notification consumer status sets (unchanged); `SessionGenerationJob.cancelUnpreparedSessions` (unchanged). Release: server and client must ship together; an old client can no longer flip a session by filling location and fee (say so in `SERVER.md` Rollback and Depends on).

## Out of scope
Discover filters for slots and mood (SESSION-47), group recurrence carrying `gameMood` (B22, group backlog), editing a `SCHEDULED` session, un-scheduling, changing sport or group, notifying on schedule (NOTIF-10), enforcing slots on join, other genders.

## Tests
Spock `SessionServiceImplSpec` (each field's store, bounds and coded errors; each field rejected in `SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`; no auto flip; schedule happy path, not-`PREPARING`, not-ready with the list, non-creator 403, deactivated creator; start-only edit moves the end; blank title), mutation-checked; IT in `server/src/test/java/com/sportconnect/integration/` through MockMvc with the real schema (PUT, POST schedule, the new columns), plus `SessionErrorCodesIntegrationTest` for the new codes.

---

## Implementation summary (2026-11-11)

Built as specified above; nothing diverged from the approved plan. Restated design and what was built:

- **Migrations** `V085` (`male_slots`, `female_slots`, `CHECK >= 0`), `V086` (`game_mood NOT NULL DEFAULT 5`, `CHECK 1-10`), `V087` (`fee_note VARCHAR(300)`), registered in `db.changelog-master.xml` and mirrored in the test `schema.sql`.
- **Entity/DTOs:** `Session`, `CreateSessionRequest` (`gameMood` `@NotNull @Min(1) @Max(10)`), `UpdateSessionRequest` (all optional), `SessionResponse` (+ `mapToResponses`, columns on the loaded entity, no extra query).
- **Service** (`SessionServiceImpl`): `missingForScheduling` (location / fee / duration; `FIXED` without an amount counts as `fee`) drives both the create-time status and `scheduleSession`; `validateGenderSlots` (`male + female <= capacity - initialSlot`, on the resulting values, skipped when no slot is set); `blankToNull` for title and fee note; `updateSession` refuses any non-`PREPARING` session first (409, nothing applied), edits every field while `PREPARING`, no auto flip, a start-only edit shifts the end by the same delta, `0` clears a slot, empty string clears the fee note; new `scheduleSession` (`requireCanModify`, 409 / 400 `SESSION_NOT_READY` with `errorParams.missing`, no outbox event: NOTIF-10).
- **Controller:** `POST /api/sessions/{id}/schedule`; Swagger text for `PUT` updated.
- **`SessionGenerationService`:** sets `gameMood(5)` explicitly (the column default also covers it); it never calls `updateSession`, so the lifecycle change does not touch it.
- **Decisions at pickup (agreed):** null means "unchanged" on update (no clearing of location, fee or duration); the blank-title post text is `"New session"`; a mood outside 1-10 or missing on create is the existing generic `VALIDATION_FAILED` (`errorParams.fields.gameMood`), so no new code for it.
- **Account lifecycle:** the new endpoint is authenticated and creator/owner-admin only. A deactivated creator is refused by the JWT filter's per-request gate before the method runs (proven by a real-token IT, 401); `requireCanModify` is the second check.

### Consumer census (as run at pickup)
`SessionGenerationService`: updated here (`gameMood`). `cancelUnpreparedSessions`, notification status sets, discover/listing queries and ITs: compatible as-is. `SessionResponse` and the request DTOs: only new fields, compatible; the client mirror, MSW mocks and `*.test.tsx` belong to CLIENT-SESSION-34 (filed). `PUT` on a non-`PREPARING` session now 409: client `useUpdateSession` / `SessionPreparingCompletion` are reworked by CLIENT-SESSION-34 (filed). Specs and ITs that edited a `SCHEDULED` session or expected the auto flip or a duration-less `SCHEDULED` create: updated here (`SessionServiceImplSpec`, `SessionAttributesIntegrationTest`, `SessionErrorCodesIntegrationTest`).

### Client-visible changes
New fields on `SessionResponse` and the requests; new endpoint; codes `SESSION_GENDER_SLOTS_EXCEED_OPEN`, `SESSION_NOT_READY`; `SESSION_NOT_PREPARING` now means "can no longer be edited". Registered in `documentation/md/ERROR_CODES.md` § session. en/vi `errors:codes` copy and the I18N-4 census row are CLIENT-SESSION-34's (its spec lists them). No notification trigger added (NOTIF-10 already logged).

### Tests
- `SessionServiceImplSpec`: 252 module tests green (33 new cases). Existing update cases moved to `PREPARING`; the old "flips to SCHEDULED" and "SCHEDULED when location and fee" cases rewritten for the new rules. Mutation-checked (each broken rule fails at least one test): status gate, end shift, duration in readiness, slots ignoring `initialSlot`, `0` not clearing, title not trimmed to null, schedule skipping the readiness check.
- **IT changes:** added `SessionPreparingLifecycleIntegrationTest` (real MockMvc, real sport/location/post wiring: new columns and checks round-trip, status rule needs a duration, blank title and the real fallback post text, over-slots 400, mood missing/out of range 400, full draft-edit-schedule-lock lifecycle, `0`/empty-string clearing and end shift persisted, `SESSION_NOT_READY` list, non-creator 403, deactivated creator refused by the real JWT filter with 401). Updated `SessionErrorCodesIntegrationTest` (`createBody` gains the now-required `gameMood`; new cases: edit on `SCHEDULED` 409, schedule 409 / 403 / 400 with the missing list). Updated `SessionAttributesIntegrationTest` (fixture session is `PREPARING`, since a `SCHEDULED` one can no longer be edited).

