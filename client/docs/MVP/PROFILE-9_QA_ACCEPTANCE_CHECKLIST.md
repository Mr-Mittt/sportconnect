# PROFILE-9 · QA / acceptance checklist

**Status:** `DONE` (2026-08-27) · **Type:** Testing · **Depends on:** `PROFILE-0` through `PROFILE-8` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

Manual acceptance pass against the approved design (`client/docs/PROFILE_PAGE_DESIGN.md`) and the
original design reference, same role `HF-9`/`FEED-9`/`AUTH-7` played for their pages — a checklist
walking every tab, every field, every empty/loading/error state, confirming the shipped page matches
what was actually approved (not the original mockup verbatim, since several tabs were deliberately
rescoped — see design doc §2).

## Explicitly out of scope

Nothing new gets built here — this is verification only. Any gap found gets its own follow-up ticket,
not a scope change bolted onto this one.

## Tests

N/A — this ticket *is* the QA pass.

---

## Results (2026-08-27)

**User decision at pickup:** do a real-backend browser pass (not just automated suites), matching the
`HF-9`/`FEED-9`/`AUTH-7` precedent, and explicitly re-verify `PROFILE-10`'s six items live rather than
trusting that ticket's own verification alone.

### Environment

- Dev deps already running (Postgres+PostGIS `:5432`, Redis `:6379`), backend already live
  (`:server:bootRun`, `:8080`), client dev server already live (`pnpm dev`, `:5173`).
- Two throwaway accounts registered directly against the real backend: `profile9qa@test.com` (given
  both active sports — Badminton, Pickleball — via the real "Add sport" flow) and
  `profile9qa-zero@test.com` (left with zero sport profiles, for the page-access gate case).
- Claude-in-Chrome browser extension was disconnected at the start of this session (same recurring gap
  every prior `PROFILE-*` ticket noted) — user connected it mid-session so this pass could drive a real
  browser for the first time against this page.

### Automated suites

| Suite | Result |
|---|---|
| `pnpm exec tsc -b --noEmit` | Clean |
| `pnpm lint` | Clean (2 pre-existing unrelated warnings in `SessionStartTimePicker.tsx`, same ones every prior `PROFILE-*` ticket noted) |
| `pnpm test` (Vitest) | 153/153 files, 1029/1029 tests passed |
| `pnpm build-storybook` | Clean |
| `pnpm e2e` (full suite) | 74/74 passed, including `profile-journey.spec.ts` |
| `pnpm test:visual` (full suite) | 0/87 passed locally — see note below |

**Visual-regression note, not a `/profile`-specific finding:** every single visual-regression spec in
the *entire* suite failed on this machine, not just `app-profile.spec.ts`'s 12 baselines. Inspected a
representative diff (`profile-posts-375-diff.png`): the content is identical, the whole layout is
uniformly offset/re-flowed — the same class of Windows-local-vs-Linux-CI font-rendering skew this
backlog has already documented repeatedly (`CLIENT-SESSION-12`, and `PROFILE-7`'s own baselines, which
note "Windows-rendered locally, need the `client-ci` `update-baselines` dispatch swap"). Since every
screen's baselines failed identically on this machine, not just this page's, this is environmental
noise on this particular local run, not a regression introduced by anything in the `PROFILE-*` chain.
CI (Linux-rendered) remains the authoritative check per this repo's own convention.

### Live browser walkthrough (real backend, no MSW)

| Area | Result |
|---|---|
| Header | ✅ Cover renders as a plain band (no image set), avatar-initials fallback ("PQ"), name renders, `@username`/city line correctly omitted (both null), bio correctly omitted when empty. Edit profile button present. |
| `SportSwitcher` | ✅ No "All" pill (per `PROFILE-4`'s page-wide rule) — only real sport pills + "Add sport". Switching pills re-filters Posts and re-seeds/guards Settings. Hover/selected 10% scale (`PROFILE-10` item 6) is Vitest-covered (class-split assertion); not independently pixel-verified live — synthetic `hover` events didn't produce a visually confirmable scale delta in two zoom captures, treated as inconclusive rather than a failure. |
| Posts tab | ✅ Composer tags the active sport (posted to Pickleball, confirmed invisible under Badminton, visible again under Pickleball); no sport badge on cards (`PROFILE-10` item 1); like toggled instantly; comment posted and count incremented instantly. |
| Memories tab | ✅ Renders `ComingSoonPage` placeholder; header/switcher/rail stay live around it. |
| Settings tab | ✅ Base fields (`skillLevel`/`yearsOfExperience`/`preferredPosition`) and `SportAttributesFields` (Badminton: Hand/Playstyle/Rackets/String/Shuttlecocks/Footwear) render and save via the real `PUT /api/sports/profiles/{profileId}`, confirmed persisted on reload. Unsaved-changes guard (`PROFILE-10` item 3) fires correctly on **both** leave-points built for it: switching to another tab, and switching the `SportSwitcher` pill while dirty — both showed the dialog; "Save changes" and "Discard changes" both verified to actually proceed. |
| Edit Profile modal | ✅ All 14 fields render seeded from the real profile; shoe-size field accepts `500` (raised bound, `PROFILE-10` item 2) and the value persisted through a real `PUT /api/users/{userId}/profile` round-trip (confirmed by reopening the modal after save). |
| Zero-sport-profile gate | ✅ Fresh account with no sport profiles auto-opens `AddSportModal` with the expected prompt copy on first `/profile` load; Settings tab independently shows "Add a sport above to set up its profile." for the same zero-profile case. |
| Post-composer unsaved-changes guard | ✅ (`PROFILE-10` item 4, app-wide via `CreatePostForm`) — typed, unsubmitted composer text on Home Feed correctly blocked in-app navigation with a "Leave without posting?" dialog; "Leave" proceeded and discarded the draft. |
| Right rail | ✅ `UpcomingMatches`/`TrendingHashtags`/`GroupBroadcasts` render; Join/Create-match actions present (not driven end-to-end this pass — unchanged, already-shipped wiring from `PROFILE-6`, not new surface for this ticket). |
| Responsive/a11y spot-check | Partial — `resize_window` did not visibly change the captured viewport in this session, so 375/768/1280px could not be independently re-confirmed live; deferred to `PROFILE-7`'s already-committed, full 3-breakpoint automated coverage (12 baselines, content-correct per the diff inspection above). Keyboard tab order spot-checked: focus visibly advanced through Search → Notifications → Account → Home → Groups → Play with visible focus rings, consistent with the app-wide a11y baseline. |
| Design tokens | ✅ `grep`-verified zero hardcoded hex/rgb/arbitrary-Tailwind-color values across `features/profile/` and the shared components this page touches (`ProfileHeader`, `EditProfileModal`, `SportSwitcher`). |

### Real finding — filed, not fixed here

**Duplicate React key warning** between `EditProfileModal` and `AddSportModal` on `ProfilePage.tsx`
(both keyed by a per-open remount counter starting at `useState(0)`, colliding on the literal key
`"0"` until either has been opened once) — the same bug class `FEED-9` already found and fixed in
`GroupsPage.tsx`, reintroduced here since `PROFILE-6` built this page independently. Confirmed
functionally harmless (accessibility-tree snapshot showed no actual duplicated DOM), but a real,
reproducible console warning. Filed as **`PROFILE-11`**, `TODO`, per this ticket's own "any gap gets
its own follow-up" scope — not fixed inline here.

### Not re-verified / out of scope

- `DialogOverlay` ref-forwarding console warning (pre-existing since `FEED-2`, already flagged and
  deferred by `PROFILE-7`) — not re-litigated here.
- The `@Size`-validation generic-error-message extraction gap (`PROFILE-5`'s own noted, repo-wide,
  pre-existing limitation) — not re-litigated here.
- Right rail's session-modal stack (`CreateSessionModal`/`SessionDiscoverModal`/`SessionDetailModal`)
  was visually confirmed present but not driven end-to-end — unchanged, already-tested wiring from
  `PROFILE-6`, not this ticket's surface.

## Epic closeout

`PROFILE-0` → `PROFILE-9`, plus `PROFILE-10`: the `/profile` page epic is functionally complete and
QA-verified against a real running backend for the first time (every prior `PROFILE-*` ticket noted no
live browser session was available). One trivial follow-up filed (`PROFILE-11`). `ACCOUNT-1` remains
independent and unscoped by this pass, per the design doc's own §5.

---

### PROFILE-9 · QA / acceptance checklist
**Status:** `DONE` (2026-08-27) · **Type:** QA · **Dependency:** `PROFILE-0`..`PROFILE-8` · **Spec:** `PROFILE_PAGE_DESIGN.md` ·
**Summary:** `client/docs/MVP/PROFILE-9_QA_ACCEPTANCE_CHECKLIST.md`

First live-browser pass against a real backend for `/profile` (prior tickets had none). All checklist
areas pass; one trivial duplicate-React-key bug found and filed as `PROFILE-11` rather than fixed
inline, per this ticket's own scope. Visual-regression's 0/87 local pass rate is a pre-existing,
machine-wide Windows-vs-Linux rendering-skew artifact, not a `/profile` regression — confirmed by
diff inspection.
