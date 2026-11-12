# SESSION-49 · A session with a null title makes `getSessionTitlesByIds` throw and the whole notification list 500

**Status:** `DONE`
**Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-11-11, found live: after login `GET /api/notifications` returned 500 INTERNAL_ERROR
while every other request worked (unread-count included). Cause from code reading, not yet
reproduced against the failing data.

## What's wrong

`SessionServiceImpl.getSessionTitlesByIds` builds its map with
`Collectors.toMap(Session::getId, Session::getTitle)`. `toMap` throws a NullPointerException on a
null value, and `Session.title` is nullable (`@Column(length = 200)`, no `nullable = false`).
`NotificationServiceImpl.getNotifications` calls it for every session-type notification in the
page, so one notification pointing at a session with no title fails the whole list.

## Fix direction

Make the method null-safe: skip null titles (the caller already reads `sessionTitlesById.get(id)`
and tolerates a missing entry; `entityTitle` becomes null). Confirm at pickup how a null title
arises (SESSION-46/48 or the new session form) and whether the entity should enforce one instead.
Cross-domain: `notification-impl` is the only caller found so far, to be censused at pickup.

**Out of scope:** the notification client's display of a title-less session (a fallback label is a
client ticket if wanted).

**Tests:** Spock for the null-title case; IT test for `GET /api/notifications` with a notification
whose session has no title (a mock cannot prove the real 200).

## Scope change (2026-11-11, at /workon pickup): the title becomes required again

**Decision (user):** instead of only tolerating a null title, make it required again, and fix the
cause. The null-safe read stays as a defensive guard (decision to confirm below).

- **Backend:** `title` required (non-blank) on create and on update; `sessions.title` `NOT NULL`
  after a backfill of existing null rows; group auto-generated sessions
  (`SessionGenerationService`, which today builds a session with no title) get a title.
- **Client:** the create-session form pre-fills the title with a localized default built from the
  signed-in user's first name: en `{{firstName}}'s session`, vi `Trận đấu của {{firstName}}`.
- **Known gap (accepted):** `firstName` is itself optional today, so the default can render with an
  empty name. A follow-up ticket makes first name required at register and in account settings.

**Open at pickup:** default title when `firstName` is empty; the title for generated sessions; the
backfill value for existing null rows; whether the null-safe read stays.

**Decisions on the open points (user, 2026-11-11):**
1. **Empty first name:** treated as the known gap. The client assumes `firstName` is always present
   and neither handles nor tests the empty case; no fallback.
2. **Group-generated sessions** are titled after the group, same pattern as the client default:
   en `{{groupName}}'s session`, vi `Trận đấu của nhóm {{groupName}}`.
3. **Backfill of existing null titles:** fixed `Session` plus the sport name if cheap, otherwise
   `Session #<id>`.
4. **Keep the null-safe read** in `getSessionTitlesByIds` as a defensive guard.
5. **Follow-ups:** required first name filed as two tickets, one in `auth` (register) and one in
   `client` (account settings).
6. **Generated-title language (stored text, so one language is chosen when the job runs):** the group
   owner's stored language via `UserService.findPreferredLanguageCode`, falling back to en. To
   confirm at pickup that the session module can reach it through `user-api`.

Scope locked 2026-11-11 (user: nothing more to add).

## Implementation summary (2026-11-11)

**Status:** `DONE`. **Design as approved:**
- **Backend:** `V088` backfills null or blank titles with `Session #<id>` and makes `sessions.title` `NOT NULL` (the entity
  says `nullable = false`); `SESSION_TITLE_REQUIRED` (400) when a create has no title or an update blanks it, and the
  title is trimmed; `getSessionTitlesByIds` leaves a null title out of the map; group-generated sessions are titled after the
  group in the owner's language (en `<group>'s session`, vi `Trận đấu của nhóm <group>`, English when none).
- **New cross-module API (additive):** `GroupRecurrenceConfigResponse.groupName`, and the batch
  `UserService.findPreferredLanguageCodes(Collection<UUID>)` (one preferences query, one for users without one, one country
  lookup; each language checked once), so the generation loop makes no per-config call.
- **Client:** the create form pre-fills `create.titleField.default` from the signed-in user's `firstName`, the title is
  required (red mark, inline error, focus on a refused Create, trimmed on send), the pre-filled title is not "unsaved
  entries", and the detail editor cannot save a blank title. `errors:codes.SESSION_TITLE_REQUIRED` and
  `session:create.validation.title` in en and vi; the MSW handlers mirror the 400.

**Divergences and decisions:**
- The backfill is `Session #<id>`, not "Session plus the sport name": the sport name lives in another domain's table and a
  migration join across it would break the domain boundary (agreed at plan approval).
- The original IT shape ("a notification whose session has no title") cannot exist once the column is `NOT NULL`: the
  null-safe read is covered by a Spock spec; the IT proves the list returns 200 with the real title.
- The first-name gap is accepted: the client assumes `firstName` is present and does not test the empty case. Follow-ups
  filed: auth `A38` (register), client `ACCOUNT-8` (account settings).

**Consumer census:** `CreateSessionRequest` / `UpdateSessionRequest` title: client create form and detail editor (updated),
MSW handlers (updated), every IT and Spock fixture that built a session without a title (updated, a default title);
`sessions.title` readers: `SessionServiceImpl` mapper, `getSessionTitlesByIds` (compatible: null-safe), the notification list
(compatible); `GroupRecurrenceConfigResponse` consumers: `SessionGenerationService` only (updated); `UserService`: one new
method, no existing signature changed.

**Tests:** Spock (session 4 new + fixtures, generation 3 new, user 2 new, group assertion); ITs (create without title, update
to a blank, notification list 200 with the title, generated title through the real job, all session IT fixtures now titled);
Vitest (create modal, detail modal, error codes). `:server:test` 715 tests, 0 failures (the first run had one flaky class,
`SessionEventsConsumerIntegrationTest`, AmqpIOException, green on re-run, and my notification test left a session behind that
broke another class; it now cleans up).

**E2E:** `e2e` project, the two specs that drive the create and edit forms (`matches-journey`, `session-form-layout`, 8
tests): all 8 failed on a first run at full parallelism (`page.unroute: browser has been closed`, test timeouts under load)
and all 8 pass with `--workers=2`; not the whole e2e suite. **Visual-regression expectation:** baselines `app-create-session-modal-*`
legitimately change (the title field is pre-filled and carries the required mark); they are expected to fail until the
`update-baselines` GitHub dispatch regenerates exactly those files, every other baseline must come back byte-identical.
Not run here (Windows noise floor).
