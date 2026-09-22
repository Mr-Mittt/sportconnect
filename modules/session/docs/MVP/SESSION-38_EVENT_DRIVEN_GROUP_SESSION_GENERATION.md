# SESSION-38 · Group session generation becomes event-driven instead of an hourly job sweep

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** none (touches `SessionGenerationService`/`SessionGenerationJob`, both shipped by
SESSION-2 — no other ticket needs to land first)
**Filed:** 2026-09-19, user request — the current job-based design (`SessionGenerationJob`, every
hour, re-scans **every** group with auto-generate enabled regardless of whether that group's next
occurrence was already generated) does real, if cheap, redundant work on every single run
(discussed and confirmed while exploring `SessionGenerationService` for SESSION-36). This ticket
replaces the periodic sweep with direct, event-triggered generation.

Today, `SessionGenerationJob.generateUpcomingSessions()` runs every hour and calls
`SessionGenerationService.generateUpcomingSessions()`, which fetches **every** group with
auto-generate enabled, recomputes `computeNextOccurrence` for each one, and does an
`existsByGroupIdAndScheduledStart` check to decide whether to create a new session — skipping
groups that already have their next occurrence, but still iterating and querying for every one of
them, every hour, forever. This ticket changes the approach: when a `GROUP_RECURRING` session
completes, generate that group's next occurrence **directly, at that moment** — no periodic
sweep, no re-checking groups that don't need anything.

## Scope

1. **Trigger: on completion.** When a `GROUP_RECURRING` session transitions to `COMPLETED` (in
   `SessionGenerationService.closePastSessions`, currently every 15 minutes), immediately generate
   that group's next occurrence in the same flow — this replaces the hourly job's job of
   eventually noticing the occurrence is missing.
   - **No-N+1 concern to resolve at implementation, not now:** `closePastSessions` processes a
     batch of up to 200 sessions per page; generating each completed `GROUP_RECURRING` session's
     next occurrence must batch-resolve recurrence configs/locations for the whole batch, not call
     out once per session.
2. **Trigger: on recurrence configuration.** When a group's recurrence rule is newly created or
   enabled (`GroupServiceImpl.updateGroupRecurrence`, `group-impl`), generate that group's first
   occurrence directly from there, rather than waiting for any job or event to pick it up.
   - **New cross-domain dependency, not existing today:** this requires `group-impl` to call into
     `session-api` for the first time — currently only `session-impl` depends on `group-api`, never
     the other direction. A new `SessionService` (`session-api`) method needs to be added and
     exposed publicly for this; `SessionGenerationService` is entirely internal today (not part of
     `session-api` at all, per its own Javadoc — "not exposed via session-api").
   - **New `group-api` surface needed too:** `GroupService` only exposes a batch lookup today
     (`getGroupsWithAutoGenerateSessionsEnabled()` — every enabled group at once). A single-group
     recurrence-config lookup doesn't exist yet and needs adding if the event-driven trigger needs
     one (check at pickup whether the completion-trigger path can reuse data already in hand from
     the completing session's own group id, or genuinely needs a fresh per-group lookup).
3. **Remove `SessionGenerationJob.generateUpcomingSessions()` and its `@Scheduled(cron = "0 0 * * * *")`
   entirely** — fully replaced by the two triggers above, no periodic sweep left. The other three
   jobs on that class (`startOngoingSessions`, `closePastSessions`, `cancelUnpreparedSessions`,
   all every 15 minutes) are untouched.
4. **`SESSION-12`'s partial index** (`sessions` scoped to `status = SCHEDULED`, added to speed up
   the generation job's hot queries) may become less relevant once the hourly sweep is gone —
   review at pickup whether it's still earning its keep for the remaining 15-minute jobs, or
   whether it's now dead weight; not assumed either way here.

## Scope change (2026-09-21, at pickup) — third trigger point added

User decision: **`GroupServiceImpl.updateGroupSettings` is also a trigger**, alongside
`updateGroupRecurrence` and on-completion. Reason: `autoGenerateSessions` is toggled in
`updateGroupSettings`, a separate method from `updateGroupRecurrence` — a group that already has a
complete recurrence rule and enables the flag via Settings (not the Recurrence editor) would
otherwise never get its first occurrence generated now that the hourly sweep is gone. Both
`updateGroupRecurrence` and `updateGroupSettings` call the same shared private check-and-trigger
helper after saving (unconditionally attempt whenever the resulting state is
`autoGenerateSessions = true` **and** the recurrence rule is complete — relying on the existing
`existsByGroupIdAndScheduledStart` idempotency backstop rather than trying to detect a precise
state transition, since re-attempting a no-op generation is harmless and simpler).

**Failure isolation (also decided at pickup):** a failure in the eager generation call (e.g. a
`LocationService` lookup error) must **not** fail the enclosing `updateGroupRecurrence`/
`updateGroupSettings` request — the settings/recurrence save already succeeded and should not be
rolled back over a generation-side problem. Caught and logged at the call site in `group-impl`; the
next real trigger (a future completion, or another config edit) will pick it up.

## Open questions — resolved at pickup (2026-09-21)

- **Cancellation case: deferred, not built.** Cancelling a `GROUP_RECURRING` session does **not**
  trigger generation. A cancelled occurrence's slot is still in the future; the next real trigger
  (a future completion for that group, or the next recurrence/settings edit) eventually catches it.
  No new gap beyond what already exists today (the removed hourly sweep would also have needed to
  run again to notice).
- **Exact shape, resolved:** one new `group-api` **batch** method,
  `getGroupRecurrenceConfigsByGroupIds(List<Long> groupIds)` — same filtering as the existing
  `getGroupsWithAutoGenerateSessionsEnabled()` (must be `autoGenerateSessions = true` and
  resolvable), just scoped to an explicit id set instead of "all enabled groups." Used by **both**
  new triggers — the completion trigger calls it with the batch of just-completed groups' ids, the
  recurrence/settings trigger calls it with a single-element list — rather than adding a second,
  single-id lookup method. One new `session-api` method,
  `generateNextOccurrenceForGroup(Long groupId)` on `SessionService`, called by `group-impl`. It
  takes only the id — `session-impl` re-fetches the authoritative config itself via `group-api`
  (ID-only cross-domain reference, matching every other cross-domain call in this codebase) rather
  than `group-impl` pushing its just-saved config data across the boundary.

### New finding at pickup: circular bean dependency (not a scope question, a wiring decision)

`session-impl` already depends on `group-api` (`SessionServiceImpl.groupService`, plain/non-lazy —
no cycle existed before this ticket). Adding `group-impl → session-api` for the new trigger creates
a real Spring bean cycle. `group-impl` already has this exact shape with `post-impl`
(`GroupServiceImpl.postService` is `@Lazy`, explicit constructor — see that class's own doc
comment). Same fix here: the new `SessionService` field on `GroupServiceImpl` is `@Lazy`;
`SessionServiceImpl`'s existing `GroupService groupService` field is untouched (still
non-`@Lazy` — only one side of a cycle needs to break it), just with its stale "no `@Lazy` needed"
comment corrected.

### New finding at pickup: SESSION-12's partial index is unaffected

`idx_sessions_scheduled_status_only` (`status = 'SCHEDULED'`) serves `findSessionsToStart`, one of
the three 15-minute jobs this ticket leaves untouched — it was never used by the removed hourly
sweep (which used `existsByGroupIdAndScheduledStart`, a different query). No index change needed;
scope item 4 above is resolved as "no action" rather than a real review outcome.

## Out of scope

Any change to `startOngoingSessions`/`closePastSessions`/`cancelUnpreparedSessions`'s own logic or
schedule beyond adding the new completion-trigger call inside `closePastSessions` — those three
jobs keep running exactly as they do today. Any change to how a **standalone** (non-group) session
is created — this ticket is `GROUP_RECURRING`-only.

**No retry/backstop for a failed eager generation attempt** — the failure-isolation decision above
means a `LocationService` outage (or any other transient failure) at the moment of a trigger simply
logs and moves on, with no periodic sweep left to eventually retry it (unlike today, where the
hourly job would pick a missed group back up on its next run). Filed as a real follow-up,
**SESSION-41** (`modules/session/docs/MVP/SESSION-41_GENERATION_FAILURE_BACKSTOP.md`, `TODO`), per
user request at pickup — not decided here.

---

## Implementation summary (2026-09-21)

Built the three-trigger design exactly as approved in Phase 3, plus the `updateGroupSettings`
scope addition and the two decisions above (cancellation deferred, failure isolated).

**`group-api`/`group-impl`:**
- New `GroupService.getGroupRecurrenceConfigsByGroupIds(List<Long> groupIds)` — same filtering as
  `getGroupsWithAutoGenerateSessionsEnabled()`, scoped to an explicit id set. Both now share a new
  private `buildRecurrenceConfigs(List<GroupSettings>)` helper (the batch owner/group resolution
  logic, extracted rather than duplicated).
- New `GroupSettingsRepository.findByGroupIdInAndAutoGenerateSessionsTrue(List<Long>)`.
- `GroupServiceImpl` gains `@Lazy SessionService sessionService` (explicit constructor, mirroring
  the existing `postService` precedent exactly) and a new private
  `triggerSessionGenerationIfEligible(Long groupId)` — unconditionally calls
  `sessionService.generateNextOccurrenceForGroup(groupId)` in a try/catch (log and swallow), called
  from both `updateGroupRecurrence` and `updateGroupSettings` after their save. `group-impl` now
  depends on `session-api` (`build.gradle`).

**`session-api`/`session-impl`:**
- New `SessionService.generateNextOccurrenceForGroup(Long groupId)`, implemented by
  `SessionServiceImpl`: re-fetches the group's config via `getGroupRecurrenceConfigsByGroupIds
  (List.of(groupId))` (ID-only cross-domain reference, no data pushed across the boundary), then
  delegates to `SessionGenerationService.generateForConfigs`.
- `SessionGenerationService.generateUpcomingSessions()` removed entirely; its per-config logic
  (locations batch-resolution, `hasCompleteRecurrenceRule`, idempotency check, the
  `DataIntegrityViolationException` race backstop) extracted into `generateForConfigs(List
  <GroupRecurrenceConfigResponse>)`, now the single shared implementation for both triggers.
- `closePastSessions()`: after each page's `COMPLETED` flip, collects that page's `GROUP_RECURRING`
  sessions' distinct `groupId`s (skips entirely — no `group-api` call — if none), calls
  `getGroupRecurrenceConfigsByGroupIds` once per page, then `generateForConfigs`. Wrapped in its
  own try/catch, same failure-isolation principle as the settings/recurrence trigger.
- `SessionGenerationJob.generateUpcomingSessions()` and its `@Scheduled(cron = "0 0 * * * *")`
  removed. The other three jobs are untouched.

**Two real, pre-existing bugs found and fixed while building this ticket's own IT coverage** — the
first genuine, non-mocked exercise of this code path against a real transactional database:
1. **`SessionGenerationService`'s auto-generated sessions never created a companion `SESSION_POST`.**
   `sessions.post_id` has been `NOT NULL UNIQUE` since V051 (SESSION-10), but this write path was
   never updated to create one — every real insert here has been failing with a NOT NULL violation
   since V051 shipped, silently masked as a "benign race" by the existing (too broad)
   `catch (DataIntegrityViolationException)` block. Fixed: `generateForConfigs` now calls
   `postService.createSessionPost(config.getOwnerId(), "Recurring session")` before building each
   `Session`, mirroring `SessionServiceImpl.createSession`'s existing pattern. New `PostService`
   dependency on `SessionGenerationService` (no new cycle — `post-impl` has no dependency back on
   `session-api`, same as `SessionServiceImpl`'s own existing `postService` field).
2. **A caught exception inside a participating transaction still poisons it.** The original
   failure-isolation design (try/catch alone) doesn't work in Spring: `generateForConfigs`
   (`@Transactional`, joining the caller's transaction) marks the whole physical transaction
   rollback-only the moment `sessionRepository.save()`'s own transactional boundary sees an
   exception — regardless of whether the caller later catches the translated exception. This
   surfaced as `UnexpectedRollbackException` on the caller's own commit (`updateGroupRecurrence`'s
   200 became a 500; `closePastSessions` would have failed its own legitimate `COMPLETED`
   transitions too). Fixed: `generateForConfigs` is `@Transactional(propagation =
   Propagation.REQUIRES_NEW)` — it gets its own physical transaction, suspending the caller's, so a
   failure here (caught or not) can only roll back this method's own attempt.

**Tests:** `SessionGenerationServiceSpec` — the 4 `generateUpcomingSessions` tests rewritten to call
`generateForConfigs` directly; added a no-N+1 multi-config test, and new `closePastSessions`
completion-trigger tests (triggers for a `GROUP_RECURRING` completion, batches multiple groups in
one call, skips `group-api` entirely for a standalone-only batch, and swallows a generation failure
without failing the batch). `SessionGenerationJobSpec` — removed the obsolete
`generateUpcomingSessions` test. `SessionServiceImplSpec` — new tests for
`generateNextOccurrenceForGroup`'s delegation (both eligible and empty-config cases); also fixed an
unrelated pre-existing flake (`discoverSessions ... viewerZoneId's current offset`, SESSION-37's own
test-writing bug: `LocalDate.now().plusDays(1)` in the JVM's zone could equal "today" in a zone
further ahead, tripping SESSION-37's date-clamp). `GroupServiceImplSpec` — new `sessionService`
mock; new tests for both triggers firing and swallowing a failure; new tests for
`getGroupRecurrenceConfigsByGroupIds` (resolvable owner, empty-input short-circuit, nothing
enabled). New **`GroupSessionGenerationIntegrationTest`** (real `@SpringBootTest`, not mocked) —
the only way to prove the real `@Lazy` bean cycle doesn't break `ApplicationContext` startup and
that the full chain actually creates a `Session`: `updateGroupSettings` enabling an incomplete rule
is a real no-op, `updateGroupRecurrence` completing an enabled rule creates the next occurrence, and
`closePastSessions` completing a `GROUP_RECURRING` session generates its group's next occurrence.
This class is also what caught both bugs above — fixed two more pre-existing flakes in
`SessionDiscoverIntegrationTest` along the way (`now().plusHours(2)`/`now().minusHours(2)` crossing
midnight when the suite runs late at night; `LocalTime.MAX` doesn't round-trip reliably through
H2's `TIMESTAMP WITH TIME ZONE` at the nanosecond edge — fixed with a clamped, precision-safe
`laterToday()` helper).

**Follow-up IT pass (2026-09-22), per user request** ("since we missed quite much things during
implementation until IT found it... all features should be covered by IT" — now also captured in
CLAUDE.md's Testing section). Audited the ticket's own IT coverage against that standard and closed
4 real gaps, all in `GroupSessionGenerationIntegrationTest` unless noted: `updateGroupSettings`'s own
happy path (only its no-op-on-incomplete-rule case had been covered — a session actually being
created via *this* trigger, not just `updateGroupRecurrence`'s, was untested); calling
`updateGroupRecurrence` twice for the same eligible group creates exactly one session, not two (the
idempotency backstop is the exact catch block that masked the missing-`postId` bug, so proving it
still works for real mattered); `closePastSessions` completing sessions for **two different groups**
in the same page generates both groups' next occurrences correctly (the ticket's own explicit
no-N+1 requirement, previously only proven by a mocked Spock assertion on the call shape); and a new
**`GroupSessionGenerationFailureIsolationIntegrationTest`** (one collaborator, `LocationService`,
replaced with a narrow `@MockBean` to make an otherwise-rare failure deterministic — everything else,
including real transaction management, stays real) forcing a real failure inside generation and
proving the caller's own request still succeeds and its own change is still persisted.

**That last test failed on first run** — a real, deeper instance of the exact bug class this
ticket already fixed once: `SessionServiceImpl.generateNextOccurrenceForGroup` was itself
`@Transactional` (default `REQUIRED`), so it *participated* in the caller's transaction
(`updateGroupRecurrence`'s/`updateGroupSettings`'s) — Spring's transactional AOP marks a
participating transaction rollback-only the moment an exception propagates through *any*
`@Transactional`-annotated method it passes through, regardless of what `generateForConfigs`'s own
`REQUIRES_NEW` already did further down. The forced failure re-poisoned the caller's transaction one
level above where isolation was supposed to stop it — `UnexpectedRollbackException` again. Fixed by
dropping `@Transactional` from `generateNextOccurrenceForGroup` entirely: it doesn't need its own
transaction boundary, since both of its calls (`getGroupRecurrenceConfigsByGroupIds`, `readOnly =
true`; `generateForConfigs`, `REQUIRES_NEW`) already manage their own correctly. This is exactly the
kind of thing a mocked test cannot see, and exactly why the new IT test was written in the first
place.

Green: `session-impl` (full Spock suite) + `group-impl` (full Spock suite) + `:server:test` (full
suite, 262 tests, 0 failures).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
