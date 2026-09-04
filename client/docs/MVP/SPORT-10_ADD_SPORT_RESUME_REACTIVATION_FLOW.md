# SPORT-10 · Add-sport resume / reactivation flow (`isResume`)

**Status:** `DONE` (2026-09-04) · **Type:** Feature · **Filed:** 2026-09-03 ·
**Origin:** backend **A20** (`DONE`/merged 2026-09-03) § "Client follow-ups (filed by the user, not
in this PR)" item 1. A20 named this follow-up but it was never filed into this backlog; filed now
during A22's Phase 1 consumer census, which found the gap. ·
**Depends on:** backend **A20** (shipped — `isResume` on `CreateUserSportProfileRequest`,
`?includeInactive=true` on the profile-list read). Also touches the same hooks as **SPORT-11** —
if both are open, do SPORT-11's `useAddSportProfile` / query-key changes first or coordinate. ·
**Spec source:** `modules/sport/sport-impl/docs/MVP/A20_ISRESUME_REACTIVATION_MODE.md` §
"Client-visible" + "Client follow-ups"

## Why

Backend A20 changed profile reactivation semantics. Re-adding a sport the user previously had (a
soft-deleted `user_sport_profiles` row) is no longer "a fresh create" — the client must now:

1. detect that the chosen sport has a **soft-deleted** profile for this user, and
2. send `POST /api/sports/profiles` with `isResume: true`, which **purely reactivates** the old row
   (old scalars kept verbatim, `attributes` = A10 `retainDefined` prune only, request body
   otherwise ignored).

Today the client's add-sport flow (`useAddSportProfile` + the Add-sport modal) only ever does a
plain create. Against the A20 backend, re-adding a previously-removed sport either 400s (if A20's
`isResume`-required path rejects a plain re-create) or silently discards whatever the user typed in
the modal — neither is a coherent UX.

## What ships

### 1. Detect a resumable profile — shared, navigation-fresh hook

- The caller's own profile list **including soft-deleted rows** is read via a new shared hook
  `useResumableSports()` (SPORT-11 already made the active read `GET /api/sports/profiles`; this is
  the `?includeInactive=true` sibling). Backed by TanStack Query with its own stable key
  (`['sportProfiles','me','all']`) and `staleTime: 0` — the repo default — so it **reloads on
  every navigation** (a page switch remounts a consumer → refetch) and on window focus, rather
  than being a frozen one-time cache. Every Add-sport surface reads from this one hook.
- A sport counts as **resumable** when the list has a row for its `sportId` with `isActive: false`
  and **no** row with `isActive: true`.
- `useResumableSports()` exposes:
  - `resumableProfiles: Map<SportKey, { skillLevel: string | null; yearsOfExperience: number | null }>`
    — the previous skill/YoE per resumable sport, for the modal pre-fill;
  - `inactiveSports: SportProfile[]` — the deactivated rows mapped to display shape (label / icon /
    ramp via SPORT-11's `sportProfileForId`), for the Profile-page `SportSwitcher` (§2c);
  - `isLoading` / `isError`.

### 2. Reactivate state in the Add-sport modal — **scope change 2026-09-04 (`/workon` Phase 1)**

Originally §2 was a plain text-only confirmation ("no edit form"). **Changed at pickup (user
decision):** keep the existing 3-field form visible, but when the selected sport has a soft-deleted
profile:

- **Skill level** and **Years of experience** are **pre-filled from the previous profile and
  rendered read-only (disabled)** — the user sees what they had, but can't edit it here, because
  A20 **ignores the request body on `isResume: true`** (the old row is restored verbatim). A UI
  that let them edit would be promising a change the server silently drops.
- The **Sport** select stays editable (switching back to a non-resumable sport returns the normal
  form).
- The footer shows **two buttons: Cancel + Reactivate** (Cancel is a new affordance — the normal
  add state still has only the primary button). Cancel closes the modal (new `onCancel` prop
  threaded `AddSportModal` → `onClose`).
- **Reactivate** → `POST /api/sports/profiles` with `{ sportId, isResume: true }` and **no other
  fields**.
- On success: the reactivated profile appears in the switcher / lists exactly as a normal create
  does today (same `useAddSportProfile` cache-write path); `onSettled` **also** invalidates the
  `['sportProfiles','me','all']` key so the resumable set drops it.
- Editing the restored skill/YoE afterwards is a normal `PUT` via the profile Settings tab —
  unchanged, still out of scope here.

### 2b. Applies everywhere the Add-sport picker opens — **scope change 2026-09-04**

Per the same user decision, the reactivate state is wired into **every** surface that mounts the
sport picker, not just the SportSwitcher "+" pill:

- the standalone `AddSportModal` on Home Feed, Groups (both the normal instance and the
  invitation-accept `sportGate` instance), Profile, Matches;
- the inline `AddSportFields` in `CreateSessionModal` / `SessionDiscoverModal`'s zero-profile gate.

Each hosting page/modal passes the `useResumableSports()` result down as a prop
(`resumableProfiles`), same plumbing pattern as the existing `availableSports` prop.

### 2c. Deactivated sports on the Profile-page `SportSwitcher` — **scope change 2026-09-04**

Profile page **only** (Home Feed / Groups / Matches unchanged — deactivated sports stay hidden
there):

- The `SportSwitcher` renders the user's deactivated sports as extra pills **after** the active
  ones — active pills left → deactivated pills right. Deactivated pills are visually muted
  (`text-text-muted`) and carry a `title="Reactivate {Sport}"`; position + behavior + muting are
  three signals, so colour is not the only one (a11y baseline).
- **Revised 2026-09-04 (scope change #4, below):** clicking a deactivated pill opens the
  **Settings tab** for that sport (not `AddSportModal`) — the tab shows that profile with its
  Active toggle set to Inactive and every field below read-only. It does **not** set the page's
  active sport pill.
- Source: `useResumableSports()` exposes the deactivated rows mapped to display `SportProfile[]`
  (via SPORT-11's `sportProfileForId`; a sport the live catalog can't resolve is dropped, same as
  the active mapping).
- New optional `SportSwitcher` props — `inactiveSports?: SportProfile[]` and
  `onInactiveSelect?: (key: SportKey) => void` — passed only by `ProfilePage`. Every other caller
  omits them → no change.

### 2d. Active/Inactive toggle in the profile Settings tab — **scope change 2026-09-04**

Profile page **only**. The Settings tab (`SportProfileSettingsTab`) never had a way to
deactivate/reactivate a sport profile — this adds it, and makes the deactivated `SportSwitcher`
pill (§2c) route here rather than to `AddSportModal`.

- **First control in the tab** — an **Active / Inactive sliding switch** (new `Switch` primitive,
  `role="switch"` + `aria-checked`), above the skill/YoE/position fields.
- **Toggling always goes through a confirm dialog** (`SportProfileStatusConfirmDialog`, new — mirrors
  `UnfriendConfirmDialog`):
  - Active → Inactive: *"Stop playing {Sport} for a while?"* → on confirm
    `DELETE /api/sports/profiles/{profileId}` (soft delete, already the backend contract).
  - Inactive → Active: *"Welcome back to {Sport}!"* → on confirm
    `POST /api/sports/profiles { sportId, isResume: true }` (the same A20 reactivate `useAddSportProfile`
    already wraps).
- **While Inactive:** the skill level / YoE / preferred position selects, `SportAttributesFields`,
  and the **Save button (visible but disabled)** are all read-only. Only the toggle is live.
- On either mutation settling: invalidate `['sportProfiles','me']`, `['sportProfiles','me','all']`,
  and the discover key (same set `useAddSportProfile` already invalidates). The tab stays on that
  sport and re-renders in the new state.
- **Data plumbing:** the Settings tab must be able to show an *inactive* sport, so:
  - `useSportProfileSettingsTabData(sportKey?)` gains a param — the sport the tab should edit — and
    resolves it against the **`includeInactive`** list (`useMySportProfilesRaw({ includeInactive:
    true })`), so `activeProfile` may be an `isActive: false` row;
  - `ProfilePage` owns a `settingsSportKey` override: an active-pill click clears it (Settings
    follows the page's active sport, as today); a deactivated-pill click sets it **and** switches
    to the Settings tab. Effective tab sport = `settingsSportKey ?? activeSport`.
- New hook `useDeactivateSportProfile()` wraps the `DELETE`; reactivate reuses the page's existing
  `useAddSportProfile` mutation with `{ sportId, isResume: true }`.
- The `AddSportModal` reactivate variant (§2 / §2b) is **unchanged** for every non-Profile surface;
  on the Profile page a soft-deleted sport is still also offered by the "+" picker (harmless second
  path — both end at "reactivated").

### 2e. Inactive sports on every `SportSwitcher` + a reactivate nudge — **scope change 2026-09-04**

Reverses §2c's "Profile page only" for the muted pills.

- **Every page's `SportSwitcher`** (Home Feed, Groups, Matches — and Profile, already) now renders
  the caller's deactivated sports as muted pills after the active ones. `SportSwitcher` change:
  a muted pill now reflects `active === sport.key` (`aria-pressed` + the active border) — a
  deactivated sport **can** be the active filter on a non-Profile page (see below); on Profile it
  never is.
- **Non-Profile pages — clicking a muted pill** → the new `ReactivateSportNudgeDialog`
  (`mode: 'sport-pill'`): *"This sport profile is down. Do you want to bring it up?"* — **Later** /
  **Yes**.
  - **Yes** → `POST /api/sports/profiles { sportId, isResume: true }` (reuses `useAddSportProfile`);
    on success the sport is now active and becomes the page's active filter.
  - **Later** → the sport becomes the active filter anyway (the page shows its view), and the nudge
    is **suppressed for that sport for the rest of the session** (`inactiveSportNudgeStore`, a
    non-persisted Zustand store — resets on reload). A sport already deferred this session skips
    straight to selection with no nudge.
  - Shared wiring: `useInactiveSportPillSelect({ userId, onSelectSport })` → `{ onInactiveSelect,
    nudge }`, used by all three pages.
- **Groups page — opening a group linked to a deactivated sport** → the same dialog in
  `mode: 'group'`: *"This is a {sportName} group, but your {sportName} profile is down. Do you want
  to bring it up?"* — **Later** / **Yes**.
  - Fires from `selectGroupAndShowPosts` when the group's `sportId` maps to an inactive-only sport;
    **once per group per session** (`inactiveSportNudgeStore.deferredGroupIds`). The programmatic
    pill change from selecting a group does **not** also fire the pill nudge — only a direct pill
    click does.
  - **Yes** reuses the page's `addSportMutation`; **Later** defers that group.
- **Profile page is unchanged** — its muted pill still routes to the Settings-tab Active toggle
  (§2c revised / §2d), no nudge.

### 3. Fresh create unchanged

- No resumable profile for the selected sport → the existing create flow runs verbatim (skill
  level + attributes form, `isResume` omitted).

## Edge cases

- User has an **active** profile for the sport already → existing duplicate-guard behavior, not
  this flow (A20 `isResume:true` with an active row → `400`).
- `isResume: true` with nothing to resume (race: profile hard-changed between detect and submit) →
  A20 returns `400`; surface the generic "couldn't add that sport" error, refetch the list.
- Sport is deactivated app-wide (A6/A7) → it won't be offered in the modal's sport picker; no
  special handling here.
- Deactivated caller with a live access token → same standing U12 gap as every write path; no new
  client-side check.
- `useResumableSports()` still loading / errored when the modal opens → treat as "no resumable
  profiles" (normal create form). The resumable set fills in on the next render if the fetch lands
  while the modal is open.
- Previous `skillLevel` / `yearsOfExperience` were `null` on the soft-deleted row → show the
  read-only field empty / blank rather than a fake value.

## Out of scope

- The caller-scoped read-path migration (`GET /sports/profiles`, other-user display) — that's
  **SPORT-11** (done, merged 2026-09-04).
- Any change to what the resume actually keeps/prunes server-side — fixed by A20/A10.
- Showing the previous profile's **attributes** (gear lists, structured records) in the reactivate
  state — only skill level + YoE are surfaced; revisit if users ask.
- An "edit while reactivating" path — A20 deliberately ignores the body on resume. The pre-filled
  skill/YoE fields are **read-only** for exactly this reason; editing is a follow-up `PUT` via the
  Settings tab.

## Tests

- Vitest —
  - `useResumableSports()` requests `GET /sports/profiles?includeInactive=true`, and derives the
    resumable set (inactive row present, no active row) + the previous skill/YoE per sport;
  - `AddSportFields` with a `resumableProfiles` entry for the selected sport: renders the
    read-only pre-filled skill/YoE, swaps the button to **Reactivate**, shows **Cancel**;
    Reactivate calls `onSubmit({ sportId, isResume: true })` with no other fields; Cancel calls
    `onCancel`;
  - switching the Sport select from a resumable sport to a non-resumable one returns the normal
    editable form and a plain create submission (no `isResume`);
  - `useAddSportProfile` sends the `isResume` payload through and, on settle, invalidates both
    `['sportProfiles','me']` and `['sportProfiles','me','all']`;
  - a `400` on resume surfaces the existing error alert;
  - `SportSwitcher` with `inactiveSports` renders muted pills after the active ones; clicking one
    calls `onInactiveSelect(key)` and does **not** call `onChange`;
  - `ProfilePage` — clicking a deactivated pill opens `AddSportModal` in reactivate state for that
    sport.
- Storybook — `AddSportModal`: existing states plus a **Reactivate** story (a `resumableProfiles`
  entry for the first available sport). `SportSwitcher`: a story with `inactiveSports`.
- `client/docs/E2E_OVERVIEW.md` — update only if an e2e/visual spec file is added or materially
  changed. `feed-groups-journey.spec.ts` already has an add-sport section — extend it with a
  reactivate assertion (MSW `sport.ts` needs a soft-deleted fixture row + `includeInactive` +
  `isResume` handling).

---

## Implementation summary (2026-09-04)

### Approved design (as built)

Client-only. Reads the `?includeInactive=true` profile list via a new shared hook, adds a
read-only "Reactivate" variant to `AddSportFields` (for every non-Profile add-sport surface), and
— Profile page only — shows deactivated sports as muted `SportSwitcher` pills that open the
**Settings tab**, where a new Active/Inactive toggle (with a confirm dialog either way) does the
`DELETE` / `isResume` round trip.

| Area | Change |
|---|---|
| `useRawMySportProfiles.ts` | new `{ includeInactive?: boolean }` arg — distinct key `sportProfilesWithInactiveQueryKey = ['sportProfiles','me','all']`, `apiClient.get('/sports/profiles', { params: { includeInactive: true } })` (a separate `queryFn` branch, so the active-only call stays a **1-arg** call and its existing tests are untouched). `staleTime` left at the repo default (0) → reloads on navigation / focus |
| `useResumableSports.ts` (new) | reads `useRawMySportProfiles({ includeInactive: true })` → `resumableProfiles: Map<SportKey, { skillLevel, yearsOfExperience }>` (inactive row, **no** active row for that sport) + `inactiveSports: SportProfile[]` (mapped via SPORT-11's `sportProfileForId`, sorted by label, unresolvable catalog ids dropped) + `isLoading` / `isError` |
| `AddSportFields.tsx` | `AddSportProfileSubmission` widened to a union: `{ sportId, skillLevel, yearsOfExperience? }` \| `{ sportId, isResume: true }`. New optional props `resumableProfiles`, `onCancel`, `initialSport`. When the selected sport is resumable: skill + YoE render pre-filled and `disabled`; a short "You had a {Sport} profile before…" line; footer becomes `[Cancel]` (only if `onCancel` given) `[Reactivate]`; submit sends `{ sportId, isResume: true }` only. Non-resumable → verbatim prior behaviour |
| `AddSportModal.tsx` | forwards `resumableProfiles` / `initialSport`; wires `onCancel` → its own `onClose` |
| `useAddSportProfile.ts` | payload type = `AddSportProfileSubmission`; `onSettled` also invalidates `sportProfilesWithInactiveQueryKey`. `userId` still a readiness guard only |
| `useUpdateSportProfile.ts` | `onSuccess` now patches **both** `sportProfilesQueryKey` and `sportProfilesWithInactiveQueryKey` — the Settings tab reads the `?includeInactive` list now, so a save that only patched the active-only key left it stale (`isDirty` stuck true, Save never re-disabled) |
| `SportSwitcher.tsx` | new optional `inactiveSports?: SportProfile[]` + `onInactiveSelect?`. Muted `Pill`s (`text-text-muted`, no `aria-pressed`, `title="Reactivate {label}"`) after the active ones, before "Add sport". Click → `onInactiveSelect`, never `onChange`. Omitted by every caller except `ProfilePage` → those switchers render byte-identically |
| `useDeactivateSportProfile.ts` (new) | wraps `DELETE /api/sports/profiles/{profileId}` (soft delete); `onSettled` invalidates the same three keys `useAddSportProfile` does; surfaces the server's error message |
| `useSportProfileSettingsTabData.ts` | new `sportKeyOverride?: SportKey` param; reads via `useMySportProfilesRaw({ includeInactive: true })`, so `activeProfile` may be an `isActive: false` row |
| `useMySportProfilesRaw.ts` | forwards a `{ includeInactive? }` option to `useRawMySportProfiles` |
| `shared/ui/switch.tsx` (new) | hand-written sliding toggle — `<button role="switch" aria-checked>` + track/thumb, tokens only (on `accent-solid` / off `border-strong`). No `@radix-ui/react-switch` in the repo; same "hand-written primitive" convention as `Select`/`Input` |
| `SportProfileSettingsTab.tsx` | new first control — an `ActiveToggleRow` wrapping the new `Switch` **outside** a `<fieldset disabled={!isActive}>` that wraps everything else. Native disabled `<fieldset>` makes every field below (incl. all of `SportAttributesFields`) + Save read-only when the profile is Inactive, zero prop threading. Save also gains `!isActive` to its `disabled`. New props `onToggleActive` / `isTogglingActive` |
| `SportProfileStatusConfirmDialog.tsx` (new) | `mode: 'deactivate' \| 'reactivate'` — *"Stop playing {Sport} for a while?"* (+ a keep-your-data note) or *"Welcome back to {Sport}!"*. Chrome-light / `centered` / no auto-focused button, same shape as `UnfriendConfirmDialog` |
| `ProfilePage.tsx` | calls `useResumableSports()` + `useDeactivateSportProfile()`. New state `settingsSportOverride` (the muted pill sets it **and** switches to the Settings tab — §2c revised: no longer opens `AddSportModal`) and `statusToggle` (the confirm dialog). `useSportProfileSettingsTabData(settingsSportOverride)`; an active-pill click clears the override. The toggle's `onConfirm` runs `deactivateSportProfile` or `addSportMutation.mutate({ sportId, isResume: true })`; `onToggleActive` pins the tab to that sport across the flip. `resumableProfiles` still passed to the page's `AddSportModal` + session modals (the "+" picker's reactivate path is left as a harmless second route) |
| MSW `sport.ts` | `GET /api/sports/profiles` honours `?includeInactive=true`; `POST` handles `isResume: true` (flip the inactive row active / `400` if none / `400` if already active), plain create only blocks on an **active** dup; new `DELETE /api/sports/profiles/:profileId` (soft delete → `isActive: false`); new `seedSoftDeletedSportProfile()` helper |
| MSW `mockServer.ts` / `fixtures.ts` | `seed-soft-deleted-sport-profile` admin action + `seedSoftDeletedSportProfileOnNextLoad()` |
| `app/inactiveSportNudgeStore.ts` (new, §2e) | non-persisted Zustand — `deferredSportKeys` + `deferredGroupIds` and their `defer*` / `is*Deferred`. "Later" is session memory, gone on reload |
| `shared/components/ReactivateSportNudgeDialog.tsx` (new, §2e) | `mode: 'sport-pill' \| 'group'` → "This sport profile is down. Do you want to bring it up?" / "This is a {sportName} group, but your {sportName} profile is down…". Later / Yes (Yes = reactivate). Chrome-light / `centered`, like the others |
| `shared/hooks/useInactiveSportPillSelect.ts` (new, §2e) | the muted-pill flow for Home Feed / Groups / Matches — `{ onInactiveSelect, nudge }`. Deferred sport → select straight through; else open the nudge; Later → defer + select; Yes → `useAddSportProfile.mutate({ isResume: true })` → select |
| `SportSwitcher.tsx` (§2e) | a muted pill now reflects `active === sport.key` (`aria-pressed` + active border) — a deactivated sport can be the active filter on a non-Profile page |
| `HomeFeedPage.tsx` / `MatchesPage.tsx` (§2e) | grab `inactiveSports` from `useResumableSports()`; wire `useInactiveSportPillSelect` + `SportSwitcher` props + render `ReactivateSportNudgeDialog` |
| `GroupsPage.tsx` (§2e) | same pill nudge (`onSelectSport = guardedSetActiveSport`), **plus** a group nudge: `selectGroupAndShowPosts` opens `ReactivateSportNudgeDialog mode="group"` when the group's `sportId` is an inactive-only sport and the group isn't session-deferred |
| e2e | `feed-groups-journey.spec.ts` — "re-adding a soft-deleted sport shows the read-only Reactivate flow", "Home Feed — a deactivated sport pill prompts the reactivate nudge, 'Later' lets it through", "Groups — opening a group linked to a deactivated sport prompts the reactivate nudge" (**Yes** path); `matches-journey.spec.ts` — "Matches — a deactivated sport pill nudge, 'Yes' reactivates it"; `profile-journey.spec.ts` — "Settings tab — deactivate a sport, then reactivate it via the muted pill". `E2E_OVERVIEW.md` catalog updated |

### Key decisions / non-obvious constraints

- **Read-only, not editable** (your Phase 1 answer). A20 ignores the request body on
  `isResume: true`, so an editable field would promise a change the server drops. Editing the
  restored profile is a normal `PUT` via the Settings tab afterward.
- **`useUserInfo`-style `staleTime: 0`, not a frozen store** (your Phase 1 answer: "reload on
  sport/page switch"). A `sportCatalogStore`-style one-time Zustand cache was considered and
  rejected — a page switch remounts a consumer and refetches, which is the freshness asked for,
  without new AppShell wiring.
- **`resumableProfiles` keyed by `SportKey`, not `sportId`** — `AddSportFields` already works in
  keys (`selectedSport`, `availableSports`), and it matches `inactiveSports: SportProfile[]`.
- **Deactivated pill routes to the Settings tab** (§2c revised, scope change #4) — not
  `AddSportModal`. It sets `settingsSportOverride` and `setActiveTab('settings')`; it never touches
  the page's active-sport store (an inactive sport is not "the active filter").
- **`<fieldset disabled>` for read-only-when-inactive** — a native disabled fieldset cascades to
  every control inside (all of `SportAttributesFields`' nested inputs, the Save button) with no
  per-field `disabled` prop. The toggle sits outside it, so it stays live.
- **`useUpdateSportProfile` patches both keys** — regression found by the profile-journey e2e:
  once the Settings tab read the `?includeInactive` list, a save that patched only the active-only
  cache left the tab's `activeProfile` stale, so `isDirty` never cleared and Save stayed enabled.
- **`Cancel` renders only when `onCancel` is passed** — `AddSportModal` passes it; the inline
  session-modal gates don't (the outer session modal owns cancel there). Documented limitation.
- **`AddSportProfilePayload` is now `AddSportProfileSubmission`** — the two were parallel copies;
  collapsed to one exported union. A `shared/hooks` → `shared/components` **type-only** import
  (erased at build), no runtime cycle.
- **Known minor edge:** deactivating the sport that is currently the page's active pill leaves
  `profilePageStore.activeSport` pointing at it (no active pill shows `aria-pressed`, PostsTab
  still filters by it) until the user picks another sport. `settingsSportOverride` keeps the
  Settings tab itself coherent through the flip; the pill-store cleanup was judged out of scope.

### Divergence from the approved design

**§2c was reworked twice mid-pickup, at the user's direction.**
- **Scope change #4:** a deactivated Profile-page pill first opened `AddSportModal`'s reactivate
  variant; the user asked for a two-way Active toggle in the Settings tab instead, so on Profile
  the muted pill opens the Settings tab and the toggle (confirm dialog either way) is the
  reactivate/deactivate control.
- **Scope change #5:** the muted pills stopped being Profile-only — every `SportSwitcher` now shows
  them, and on non-Profile pages selecting one raises the `ReactivateSportNudgeDialog` ("...profile
  is down. Bring it up?" — Later/Yes), with a Groups-page variant for opening a group linked to a
  deactivated sport. "Later" is session-remembered per sport / per group (`inactiveSportNudgeStore`).

The `AddSportModal` reactivate variant (§2/§2b) is unchanged and still serves every non-Profile
"+" picker. `initialSport` on `AddSportFields`/`AddSportModal` is kept as tested API but no longer
wired from `ProfilePage`.

### Verification

- `npx tsc -b --noEmit` — clean. `npx eslint` on every changed + new file — clean.
- Vitest — full suite **161 files / 1099 tests pass** (new files `useResumableSports.test.tsx`,
  `useDeactivateSportProfile.test.tsx`, `useInactiveSportPillSelect.test.tsx`,
  `ReactivateSportNudgeDialog.test.tsx`; +2 `useAddSportProfile`, +5 `AddSportModal`, +4
  `SportSwitcher`, +4 `SportProfileSettingsTab`, +1 `useSportProfileSettingsTabData`, +2
  `ProfilePage` cases).
- Playwright `e2e` — **full project green** with `--workers=2` (78 pass; the 2 `a11y.spec.ts`
  "home feed @ 375px" cases that time out at `page.goto` under load pass in isolation — the same
  Windows-host webserver-starvation symptom seen on SPORT-11, not a code issue). New: the
  `feed-groups-journey` reactivate-nudge case + `profile-journey` toggle case.
- Live browser walk against a running backend — **not done** (same as SPORT-11). A20's contract is
  backend-live-verified in its own summary; `DELETE /api/sports/profiles/{id}` is a pre-existing
  `ROLE_USER` endpoint; MSW mirrors both 1:1.

### Follow-up filed

**SPORT-12** (`client/docs/BACKLOG_MVP.md`) — visual-regression harness for the new surfaces here
(Settings-tab Active switch + inactive read-only state, `SportProfileStatusConfirmDialog`,
`ReactivateSportNudgeDialog`, muted `SportSwitcher` pills). Filed as its own ticket per the repo's
established pattern (CLIENT-NOTIF-2 / CLIENT-SESSION-12 / GRP-10 / FEED-11).

### Visual-regression expectation

No baselined surface changes. Everything new is **conditionally rendered**, off in every
baseline's default fixture state: the reactivate variant only when a resumable sport is selected;
the muted `SportSwitcher` pills only when the caller has a soft-deleted profile (no baseline
fixture does); the nudge dialogs only on a muted-pill click / a deactivated-sport-group open; the
Settings tab's Active toggle only once the tab has a profile, and the `<fieldset>` `disabled` only
when that profile is inactive. `SportSwitcher` renders byte-identically for every existing baseline
(empty `inactiveSports.map()` emits nothing; the `aria-pressed={isActive}` change is inert when
there are no muted pills). No `/profile` visual spec exists. A failing `visual-regression` run is
the Windows font-rendering noise floor — no `update-baselines` dispatch needed.
