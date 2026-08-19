# CLIENT-NOTIF-3 · Notification text for `session.status.started` and `session.participant.left`

**Status:** `DONE` (2026-08-19) — code complete and verified, baselines regenerated and committed.
**Type:** Bug Fix (display gap)
**Depends on:** none — both backend events already ship (`SESSION-18` `DONE`, `SESSION-19` `DONE`)
**Filed:** 2026-08-19, found while implementing `SESSION-19` — checking whether the client could
render its new notification type surfaced that an *already-shipped* type has the same gap.

`client/src/features/notifications/notificationText.ts`'s `getNotificationText` switch has a case
for six notification types. Two emitted types are missing from it, so both fall through to:

```ts
default:
  return [plain('You have a new notification')];
```

| Type | Shipped by | Status today |
|---|---|---|
| `session.status.started` | `SESSION-18` (`DONE`) | **Renders the generic fallback since it launched** |
| `session.participant.left` | `SESSION-19` (`DONE` 2026-08-19) | Renders the generic fallback |

**This is a degraded-display bug, not a crash.** The fallback is deliberate and documented in that
file's own comment — it exists "so the dropdown degrades gracefully the moment a new producer
ships," which is exactly what happened, twice. Nothing is broken; the notifications simply carry no
useful information, so a user sees "You have a new notification" with no idea what occurred.

**Worth noting as a pattern, not just two one-off misses:** both gaps were created by a backend
ticket shipping an event while scoping client work out. `SESSION-18` and `SESSION-19` each did this
independently, and neither noticed. Whoever picks this up should consider whether adding a new
routing key should carry a checklist item pointing at this switch — otherwise the same gap recurs
on the next event (`post-impl` B7, `group-impl` B21 and `user-impl` U13 are all `TODO` notification
outbox-wiring tickets that will each introduce new types).

## What ships

Two new cases in `getNotificationText`, following the existing segment convention exactly — bold on
actor name(s) and entity title only, never on a fallback phrase:

- `session.status.started` — **no actor** (`SESSION-18`: a scheduled job made the transition, and
  the consumer deliberately passes `actorId = null`). So this case must **not** use `actorSegment`,
  which would render the bold-suppressed `'Someone'` fallback and read as if a person started it.
  Something closer to `['', entity, ' has started']` — exact wording is a product call at pickup.
- `session.participant.left` — has a real actor; mirrors the existing
  `session.participant.joined` case (`[actor, ' joined ', entity]`), e.g. `[actor, ' left ', entity]`.

**Tests:** `notificationText.test.ts` already covers the existing cases plus the fallback — add one
per new type, and keep a fallback case covering a genuinely unknown type so the default branch stays
tested.

## Explicitly out of scope

No backend change — both events already emit correctly and are consumed into real notifications.
No new notification types. No change to the fallback itself (it's correct behavior for a type the
client genuinely doesn't know). No aggregation/display changes beyond these two switch cases.

---

## Scope change at pickup (2026-08-19, user decision)

The "out of scope" list above was **deliberately widened by the user at pickup** — MSW handlers,
visual baselines, and the fallback's own behavior were all pulled in. Recording this explicitly
because the section above still reads as the original, narrower scope; the widened list is what
actually shipped.

## Gap analysis done at pickup

Before implementing, every routing key the backend emits was enumerated against every case the
client handles, rather than trusting the ticket's own summary. Two findings:

**Gap 1 (what this ticket fixes) — exactly 2, confirmed.** The pipeline handles 8 session routing
keys end to end (`SessionEventsConsumer`), the client rendered 6. `session.status.started` and
`session.participant.left` were the only two missing. The other routing keys that turn up in a
repo-wide grep (`group.deleted`, `group.member_added`, `group.member_removed`,
`user.profile_updated`) are **not** gaps — they are chat-service sync events on a separate Redis
Stream pipeline (`services/chat/internal/sync`) and never become user-facing notifications.

**Gap 2 (deferred to CLIENT-NOTIF-4) — 11 more types queued.** `post-impl` B7 (`post.like.created`,
`post.comment.created`, `post.comment.replied`), `group-impl` B21 (6 `group.invitation.*` /
`group.join_request.*` keys) and `user-impl` U13 (2 `user.friend_request.*` keys) are all `TODO` and
will each introduce types this switch won't know. Filed as its own ticket rather than folded in
here.

## What was built

1. **Two switch cases** in `client/src/features/notifications/notificationText.ts`:
   - `session.participant.left` → `[actor, ' left ', entity]`, placed directly after
     `session.participant.joined` to keep the pair adjacent and mirror its shape exactly.
   - `session.status.started` → `[entity, ' has started']`. Deliberately does **not** use
     `actorSegment`, with an inline comment saying why — SESSION-18 passes `actorId = null`, so
     `actorSegment` would render the bold-suppressed `'Someone'` and read as if a person started
     the session. Wording confirmed with the user at pickup (the ticket left it open).
2. **Dev-only warning on the fallback branch.** The rendered text is unchanged; the default branch
   now `console.warn`s in dev (`import.meta.env.DEV`) naming the unmapped type. Silent graceful
   degradation is precisely how this bug hid twice — the guard makes the third occurrence loud at
   the moment a developer runs the app. Never fires in production, where an unmapped type is a
   degraded row the user can do nothing about.
3. **MSW fixture** (`e2e/mocks/handlers/notifications.ts`) gained ids 4 and 5 so the default fixture
   covers every type the backend actually emits. Both seeded `isRead: true` **deliberately**: this
   keeps the unread count at 2, so `notification-bell.spec.ts`'s badge and mark-all-read assertions
   kept testing what they were written to test instead of being rewritten to accommodate new rows.
   Id 5 mirrors the real contract with `actorIds: []` / `actors: []`, not an invented actor.
4. **Two Storybook stories** on `NotificationRow`: `SessionStarted` (the only type naming no person
   at all — a genuinely new text shape, same reasoning that earned `ApprovalOutcome` its story) and
   `UnknownType` (gives the degraded fallback state a reviewable visual, not just an assertion).

## Key decisions

- **The fallback test's type literal was swapped** from `'post.comment.created'` to
  `'not.a.real.routing.key'`. B7 is queued to make the old literal a *real* routing key, at which
  point that test would have kept passing while silently asserting "known-but-unimplemented" rather
  than "genuinely unknown." A comment in the test records why the literal must stay unreal.
- **`session.status.started` got a defensive test** asserting it names no actor even when `actors`
  is non-empty. The backend guarantees a null actor today; the test stops the case from silently
  starting to name someone if that ever changes.
- **MSW rows seeded as read, not unread** — see above. The alternative (unread) would have forced
  edits to `notification-bell.spec.ts`'s counts, weakening a spec that had nothing to do with this
  change.

## Verification

- `pnpm test` — **884/884 passed**, 129 files. `notificationText.test.ts` went 12 → 18 tests.
- `pnpm lint` — 0 errors. (2 warnings in `SessionStartTimePicker.tsx` are pre-existing, untouched.)
- `pnpm build` (`tsc -b` + vite) — passed.
- `playwright --project=e2e` — **51/51 passed**, including `notification-bell.spec.ts` **unmodified**,
  which is the direct evidence the already-read fixture choice preserved its assertions.
- `playwright --project=visual-regression` — **not a pass; see below.**

## Remaining step — baseline regeneration (same as every prior visual-regression ticket)

The bell dropdown list grows from 3 rows to 5, so `notification-bell-populated-{375,768,1280}.png`
genuinely need regenerating. That **cannot be done on this machine**: all 75 visual tests fail here,
including specs that render no notifications at all. Verified by stashing every change and re-running
`app-create-session-modal` on a pristine tree — **byte-identical failures** (3912 and 5668 pixel
diffs), i.e. the documented Windows-vs-Linux font-rendering noise floor (HF-12 onward), not anything
this ticket caused.

`playwright.config.ts` uses `snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}'` — no
`{platform}` segment, so there is one shared, Linux-generated baseline set. Running
`--update-snapshots` locally would overwrite all 75 with Windows-rendered PNGs and break CI for
everyone; scoping the update to just these 3 would leave them Windows-rendered among 72
Linux-rendered ones, passing locally and failing in CI. Neither was done.

**To execute:** the HF-20 process — trigger the `client-ci` workflow's `update-baselines` manual
dispatch, download the `visual-baselines` artifact, replace `client/e2e/visual/__screenshots__/`,
commit. Expected: **exactly 3 files change** (`notification-bell-populated-*`), everything else
byte-identical — worth the same SHA-256 check HF-20 used, plus a human look that the two new rows
read "Priya Shah left …" and "\"Sunday pickup run\" has started".

### Executed (2026-08-19)

`update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted. SHA-256 compared
against the committed set before overwriting: **exactly the 3 predicted files changed**
(`notification-bell-populated-{375,768,1280}.png`); the other **72 came back byte-identical**.

That byte-identity is itself a useful result — it confirms the committed baseline set already
matched what CI generates today, so the "baselines still Windows-rendered, pending a dispatch"
caveats carried by CLIENT-NOTIF-2, GRP-10 and CLIENT-SESSION-12 were already stale rather than
outstanding work. It also confirms the dispatch ran on **this branch, not `master`**: had it run on
`master` (which lacks this ticket's MSW fixture rows), `notification-bell-populated-*` would have
regenerated to the old 3-row list and come back byte-identical too, leaving *zero* files changed.

Human visual check of the 1280px and 375px crops: the dropdown now lists 5 rows (2 unread, 3 read),
and the two new ones read **"Priya Shah left \"Sunday pickup run\""** and **"\"Sunday pickup run\"
has started"** — the latter correctly naming no actor. No truncation or overflow at 375px (the
dropdown is fixed-width, so the narrow crop renders identically). Nothing else drifted.

Note the local `pnpm test:visual` still cannot pass on a Windows host — that is the pre-existing
font-rendering mismatch documented above, unrelated to these baselines, so this step was verified by
SHA-256 + visual inspection rather than a local suite run.

## Delta for later tickets

`getNotificationText`'s switch is the single place a new backend routing key becomes user-visible
text, and nothing structurally forces a backend ticket to update it — the fallback quietly absorbs
the omission. B7 / B21 / U13 each add types and each need a case here in the same change.
**CLIENT-NOTIF-4** tracks making that non-optional.
