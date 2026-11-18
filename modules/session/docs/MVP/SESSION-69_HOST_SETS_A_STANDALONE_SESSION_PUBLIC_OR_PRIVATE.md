# SESSION-69 · The host sets a standalone session public or private, at creation and while PREPARING

**Status:** `DONE` (2026-11-18)
**Type:** New Feature · **Depends on:** none (client pair: CLIENT-SESSION-52; the read side is SESSION-37 and SESSION-40)
**Filed:** 2026-11-18, owner request while the group-session requirements are being defined; the owner then asked for it to be built in the same pass.

Today every standalone session is public (`isPublic = true`, set at creation, SESSION-37) and nothing can change it. New: `CreateSessionRequest.isPublic` and `UpdateSessionRequest.isPublic`, default `true`. A **private** standalone session (`false`) is seen only by its creator and its invitees (a `JOINED`, `REQUESTED` or `INVITED` row); nobody else can find it or join it. Editing is allowed only while `PREPARING` (the whole update call is already 409 `SESSION_NOT_PREPARING` otherwise, SESSION-46). `SessionResponse` gains `isPublic` (SESSION-37 kept it internal "until a client needs it"; the forms and the Share button now do).

**What makes it private (the work).** Discover already lists only `isPublic = true`, and `SessionDetailGate` already grants "public, or a participant row" (its Javadoc says that clause is dormant until a private standalone session can exist). Still to do:
- `joinSession` has no visibility rule today, so a private session is joinable by anyone who knows the id: add it. A caller without a participant row on a private session is refused with 403 `SESSION_FORBIDDEN` (the resource-gate rule: unavailable 404, not visible 403; owner, 2026-11-18); an `INVITED` row still accepts as today.
- `shareSession` (SESSION-66): a private session is **not shareable** (owner, 2026-11-18): 403 `SESSION_SHARE_NOT_ALLOWED`, whose meaning widens from "a group session" to "a group or private session". A shared friend could not open it anyway.
- Switching a session to private keeps every existing participant row (`JOINED`, `REQUESTED`, `INVITED`): they keep their access, and the host can still reject a request.
- A group-linked session keeps `isPublic = false`: an `isPublic` sent for one is **ignored silently** (owner, 2026-11-18), on create and on update.
- The change is told in the thread (the SESSION-67 rule for a new editable field): a `SessionFieldChanges.diff` case, a `SESSION_VISIBILITY_CHANGED` `SystemCode` with `old` and `new`, and its client text (CLIENT-SESSION-52). No notification (NOTIF-10 covers edits).

**Consumer census (before any edit):** every path that returns or lists a session or its title without the detail gate (`getSessionTitlesByIds` for notifications, upcoming and history, the post feed's `SESSION_POST`, comments and likes through `SessionGate`, the records endpoints, the thread-people search); the client mirrors `Session` and the create and update payloads in several places. **Account lifecycle:** no new endpoint; a deactivated caller is refused by the JWT filter as before.

**Out of scope:** inviting people to a private session after creation (invitees come from `inviteeIds` only), a public group session, a "Private" badge on cards, changing visibility after `PREPARING`.

**Tests:** Spock for each rule; an IT through the real pipeline: a stranger gets 403 on detail, join, comments and share of a private session; an invitee can open and accept; Discover omits it; switching public to private keeps a `JOINED` row's access; `isPublic` on a group session changes nothing.

---

## Implementation summary (2026-11-18)

**Design as approved** ("go ahead", 2026-11-18) after the owner's three decisions: a private session is **not shareable**, a stranger gets **403 `SESSION_FORBIDDEN`**, and `isPublic` on a group session is **ignored silently**. Built as designed, with the points below.

**Built.**
- **DTOs:** `isPublic` on `CreateSessionRequest` (null means public), `UpdateSessionRequest` and `SessionResponse` (SESSION-37 had kept it internal).
- **`createSession`:** `isPublic = groupId == null && request.isPublic != false`; a group-linked session is never public, whatever is sent.
- **`updateSession`:** applies `isPublic` for a standalone session only (a group one ignores it), inside the existing `PREPARING` rule; `SessionFieldChanges` carries it (`Snapshot.isPublic`), and the new `SystemCode.SESSION_VISIBILITY_CHANGED` (`post-api`, fits the 40-character column) is written with `old`/`new` = `public`/`private` (a null counts as public).
- **`joinSession`:** a private standalone session is refused with 403 `SESSION_FORBIDDEN` unless the caller holds a `JOINED`, `REQUESTED` or `INVITED` row; the check comes before the cancelled rule, so a stranger learns nothing else about the session.
- **`getSessionParticipants`:** now behind `SessionDetailGate` (404, then 403), because the player list had **no access check at all** (found in the census): a stranger with an id could read the names and avatars of a private session's players. **Behaviour change:** the same now holds for a **group** session (a non-member gets 403; before, anyone could read its players).
- **`SessionShareGate`:** also requires `isPublic`, so a private session is 403 `SESSION_SHARE_NOT_ALLOWED` (the code now means "a group or a private session").
- **`SessionDetailGate.grantsAccess`:** the one definition of "this row keeps access to a private session" (`JOINED`, `REQUESTED`, `INVITED`; `LEFT`, so also a rejected request, does not), shared by the gate and `joinSession`.

**Divergence from the plan.** `joinSession` does the private check **inline** (it reads the participant row only for a session explicitly `isPublic = false`) instead of calling the mocked detail gate: that keeps a public join at one participant read and left the 20 existing join specs untouched. The rule is still defined once, in `grantsAccess`.

**Consumer census (done before editing).** Paths that return or list a session or its players: `GET /{id}` (detail gate, already correct), `GET /{id}/participants` (**was ungated, fixed**), `POST /{id}/join` (**no visibility rule, fixed**), `POST /{id}/shares` (**any caller, fixed**), Discover and its counts (`isPublic = true` in the queries, unchanged), `/upcoming`, `/history`, `/requested` (participant-scoped, so an invitee sees and can accept it, unchanged), comments, likes and thread-people (`SessionGate`, participant-only), records (`SessionRecordGate`, `JOINED` only), notifications' `getSessionTitlesByIds` (server-side, unchanged). Client: `Session` gains `isPublic` (CLIENT-SESSION-52).

**Tests.**
- **Spock:** `:modules:session:session-impl:test` 437 (was 400): create (default, `false`, group ignores), update (switch, leave alone, group ignores, not `PREPARING`), join (stranger, cancelled, `LEFT`, invitee, public costs no extra read), the participants gate (403 and 404), `SessionShareGateSpec`, `SessionDetailGateSpec.grantsAccess`, `SessionFieldChangesSpec` (public/private, null counts as public); `:modules:notification:notification-impl:test` 72.
- **Integration:** new `SessionPrivateSessionIntegrationTest` (21): create over HTTP (default, private, invitee accepts, stranger refused), detail for every participant status, the player list (private, group, the REQUESTED queue still creator-only), join (stranger, cancelled, `LEFT`, public still open), the thread, sharing, switching while `PREPARING` (thread entry, rows kept, back to public, not once scheduled, group ignores, a stranger cannot switch), anonymous 401. Plus a Discover case in `SessionDiscoverIntegrationTest`. With the other session ITs that touch these paths (`SessionShareIntegrationTest` 13, `SessionAccessGateIntegrationTest` 13, `SessionErrorCodesIntegrationTest` 27, `SessionDiscoverIntegrationTest` 40, `SessionListingIntegrationTest` 48, `SessionPostAccessGateIntegrationTest` 22, `SessionPreparingLifecycleIntegrationTest` 16, `SessionRecordsIntegrationTest` 31, `SessionAttributesIntegrationTest` 6, `SessionSystemCommentIntegrationTest` 5, `SessionThreadPeopleIntegrationTest` 14): all pass.
- **Mutation check: 12 of 12 mutants killed** against a passing baseline (create always public, a group session made public, update never applying it, update applying it to a group session, the response dropping it, no private rule on join, a `LEFT` row keeping access, the private check after the cancelled rule, no gate on the player list, a private session shareable, the thread entry dropped, a null read as private).
- **Not run:** the full `:server:test`, a live server, a real Postgres (the ITs run on H2; no migration and no query changed). Your IntelliJ server needs a restart after my Gradle runs.

**Release notes.** `SERVER.md` Unreleased (the change and the participants behaviour change). `ERROR_CODES.md` (`SESSION_FORBIDDEN` and `SESSION_SHARE_NOT_ALLOWED` rows), `session-impl/CLAUDE.md` (rule 14), the SESSION-66 ticket, `PROGRESS.md`.
