# SESSION-46 · Per-gender slots, game mood, fee note, optional title, and a real PREPARING lifecycle (edit everything, then Schedule)

**Status:** `TODO`
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
