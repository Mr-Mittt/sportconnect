# CLIENT-SESSION-34 · Create/edit session form restructured into sections, with slots, game mood, end time, fee note, edit mode, readiness popups and PREPARING banners

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-46 (session backlog: the fields, the lifecycle and `POST /api/sessions/{id}/schedule`) ·
**Filed:** 2026-11-11, from a `/feature` planning session with the owner (six session points, decided together). The server half is SESSION-46; the API names below are the agreed contract, so the two can be built in either order against MSW.

One ticket because every point lands in the same form and the same two modals (`CreateSessionModal`, `SessionDetailModal`). Build it in the order of the sections below, starting with the layout, because the layout decides where every other field goes.

## 1. Layout (decided with the owner 2026-11-11: grouped sections, no wizard)
The form body becomes **five sections**, all open by default, one scroll, one submit button (the owner wants no extra steps to create a session): **What** (sport, title, description, sport attributes; the old "Session detail" collapsible is absorbed here), **When** (start, duration, end), **Where** (location with favorites, location note), **Who** (taken and open slot, men/women split, game mood, auto approve, invite friends), **Cost** (fee type and amount, fee note). Each section reuses `Collapsible` (`@/shared/ui/collapsible`) like today's "Basic information". A section header shows a small amber **"Missing: ..."** chip for what is still needed to Schedule (Location, Fee, Duration): amber warning tokens, never red; the text carries the meaning, not the colour. Required-to-create fields keep the red asterisk. Existing grid rows (`sm:grid-cols-10`); nothing may overflow at 320 and 375px (the existing e2e asserts widths). Sketch:

```
┌ Create session ─────────────────────┐
│ ▾ What     Sport* Title  Description │
│            (sport attributes)        │
│ ▾ When     Starts at*  Duration  Ends│  ⚠ Missing: duration
│ ▾ Where    Location [name ▾]  Note   │  ⚠ Missing: location
│ ▾ Who      Taken  Open*  Men  Women  │
│            Game mood 1 ●━━━━━○ 10    │
│            [ ] Auto approve  Invite   │
│ ▾ Cost     Fee [Free|Split|Fixed]    │  ⚠ Missing: fee
│            Fee note                  │
├──────────────────────────────────────┤
│        [Create session]              │
└──────────────────────────────────────┘
```

## 2. Required, optional, labels
Required to create: sport, start time, open slot (server rule unchanged). **Title and duration become optional** on the client; a title-less session shows a fallback title (en/vi, for example "<Sport> session") on cards, detail and notification text (grep the `title` readers: `SessionCard`, `SessionDetailModal`, `notificationText.ts`). Required to **Schedule**: Location, Fee (and the amount for FIXED), Duration. **Remove "(optional)" from every field label** (`locales/en|vi/session.json`: Location, Location note, Fee, Description, Invite your friend, and the new fields); optional fields are simply unmarked. The cancel-reason placeholder "Reason (optional)" is another flow and stays.

## 3. New fields
- **Per-gender slots** under Open slot: optional "for men" and "for women" number inputs, client check `men + women <= open slots` (mirrors `SESSION_GENDER_SLOTS_EXCEED_OPEN`); shown on the detail modal (and the card if there is room) as "2 men · 1 woman · rest any" when either is above 0.
- **Game mood**: range slider 1 to 10, step 1, **default 5**, an untouched slider counts as the answer; a label at each end ("For fun" at 1, "Competitive" at 10, en/vi); track colour from green (1) to red (10) via design tokens (add the tokens first; no hardcoded hex); the number is always shown beside the slider and the control has `aria-label` and `aria-valuetext` (colour is never the only signal). Card and detail show the number with the colour as an accent.
- **Fee note**: text input under the fee fields (300 characters, counter), shown on the detail modal.

## 4. End time and duration
An "Ends at" field next to Duration; the one edited last is the source and the other is derived. Edit duration: end = start + duration. Edit end: duration = end - start. Edit start: the duration stays and the end moves. End must be after start; it may fall on the next day (the picker shows the date). `SessionStartTimePicker` goes from 5-minute to **1-minute steps** (`MINUTE_STEP = 5` becomes 1; only used in that file, mounted only in `CreateSessionModal`; its tests and stories that assume 5-minute options change), and the end field is the same component. The payload still sends `durationMinutes`.

## 5. Popups (sibling `Dialog`, never nested: the same pattern as `<LocationPicker />` rendered after the create `</Dialog>`; no Popover/DropdownMenu)
- **Auto approve**: ticking the box does not check it; it opens a confirm popup ("Turn on" / "Cancel"); unticking opens nothing; the inline hint under the checkbox goes away. Modelled on `UnfriendConfirmDialog` (centred, no pre-focused button, Escape cancels); focus returns to the checkbox.
- **Readiness** ("Are you ready?"), shown after submit validation. Incomplete (any of Location, Fee, Duration missing): the information below is missing, so the session will be PREPARING until it is completed, with the bullet list; buttons "Continue editing" / "Create preparing session". Complete: the session is ready to be SCHEDULED and its details cannot be updated afterwards, are you ready?; buttons "Let me check again" / "Let's go". The inline "will be created as Preparing" footer line is replaced by this popup. The same complete-variant popup confirms the Schedule button below.
- State lives in the modal, so the pages that mount it (HomeFeed, Groups, Friends, Profile, Matches) do not change.

## 6. Edit mode and the PREPARING warning
- `CreateSessionModal` gets `mode: 'create' | 'edit'`: edit pre-fills from the `Session` (taken slots from `initialSlot`, open slots from capacity), sport fixed, invitees hidden, remounted by `key` per session; replaces `SessionPreparingCompletion`'s location-and-fee block in `SessionDetailModal`.
- `SessionDetailModal`, `PREPARING` only: **every viewer** (joined users included) sees an amber banner ("The host is still preparing this session. Some details, such as the location or fee, may change. It is cancelled automatically if it is not scheduled before it starts."). The host (`canManage`) also sees the missing list, an "Edit session" button, and a "Schedule session" button (enabled when nothing is missing, otherwise disabled with the reason; the server re-checks). Wiring goes through `useSessionDetailModalData` (six hosts, one hook).
- `useScheduleSession` (+ invalidations like the other session mutations); `UpdateSessionPayload` widened; coded errors `SESSION_GENDER_SLOTS_EXCEED_OPEN`, `SESSION_NOT_READY`, `SESSION_NOT_PREPARING` (now "can no longer be edited") with en/vi `errors:codes` (add the rows to the I18N-4 census table in `documentation/md/I18N_READINESS.md` for the form).

## Consumer census (to run at pickup)
Every mounter of `CreateSessionModal` and `SessionDetailModal`; `SessionPreparingCompletion` (replaced or reduced) and its tests; `useUpdateSession`; `client/e2e/mocks` and `sessionListFixtures.ts` (new fields, `POST .../schedule`, the 400/409 errors); stories; the `title` readers above; e2e specs that read label texts or tick auto approve (`matches-journey.spec.ts`).

## Out of scope
Discover filters for slots and mood (CLIENT-SESSION-35), the group recurrence form's mood (GRP-12), editing a `SCHEDULED` session, un-scheduling, changing sport or group, a step-by-step wizard, notifying on schedule (NOTIF-10).

## Tests
Vitest: each form section and field (validation, payload, derivation both ways, midnight crossing, end before start), both readiness variants and their four buttons, the auto approve popup (tick, cancel, confirm, untick, payload), edit mode pre-fill, the detail banner for host and non-host in PREPARING versus SCHEDULED, Schedule enabled and disabled; every requirement mutation-checked. Scoped Playwright `matches-journey` (create PREPARING, edit, schedule) and the 320/375px width check; baselines through `/updatebaseline` when the owner asks. en/vi strings and stories for each new state.
