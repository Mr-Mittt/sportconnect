# SPORT-8 · Remove "Preferred position" from the sport profile editor

**Status:** `DONE` (2026-09-04) · **Type:** Enhancement (Architecture) · **Depends on:** pairs with
backend **A18** — land SPORT-8 first or together, never drop the column while the client still
sends the field.
**Filed:** 2026-09-02 — client half of A18 (the `preferred_position` column was a mistake).

## What ships

- Drop `preferredPosition` from `shared/types/sport.ts` (`UserSportProfileResponse`), the
  `SportProfileEditDraft`, `toSportProfileEditDraft`, `buildSportProfileUpdatePayload`,
  `isSportProfileDraftDirty`.
- Remove the "Preferred position" `<Input>` and its `setPreferredPosition` wiring from
  `SportProfileSettingsTab` / `useSportProfileSettingsTabData`.
- Update `AddSportModal` if it collects the field at creation.
- MSW handlers + fixtures: drop the field.

## Out of scope

Adding a per-sport "position" attribute (admin content via ADMIN-2 later, if a sport wants it).

## Tests

Update `SportProfileSettingsTab` / `useSportProfileSettingsTabData` specs and the sport-profile MSW
mutation tests to drop the field; e2e profile journey step if it asserts on it.

---

## Implementation summary (2026-09-04)

### Approved design (Phase 3)

Pure client-side removal of the fixed `preferredPosition` free-text field, sequenced ahead of
backend A18 so the client stops reading/sending the field before the column is dropped. Position is
sport-specific and belongs in the per-sport A9 attribute schema (`SportAttributesFields`, SPORT-2),
never a flat column next to `skillLevel`/`yearsOfExperience`. No new UI — the "Preferred position"
row on the `/profile` Settings-tab per-sport editor is simply deleted, and every type / draft
helper / payload builder / MSW handler / fixture that named the field is purged.

### What was built

**Production code (7 files):**

| File | Change |
|---|---|
| `shared/types/sport.ts` | removed `preferredPosition: string \| null` from `UserSportProfileResponse` |
| `features/profile/sportProfileEditDraft.ts` | removed the field from `UpdateSportProfilePayload`, `SportProfileEditDraft`, `toSportProfileEditDraft`, the diff block in `buildSportProfileUpdatePayload`, and the dirty clause in `isSportProfileDraftDirty`; rewrote the "Known limit" doc paragraph to use `yearsOfExperience` as its example |
| `features/profile/useSportProfileSettingsTabData.ts` | removed `setPreferredPosition` (impl + return + return-type) and the field from `emptyDraft()` |
| `features/profile/components/SportProfileSettingsTab.tsx` | removed the `setPreferredPosition` prop and the entire "Preferred position" `<Label>` + `<Input>` block; updated the component doc comment |
| `features/profile/ProfilePage.tsx` | removed the `setPreferredPosition={settingsTabData.setPreferredPosition}` wire |
| `features/profile/useMySportProfilesRaw.ts` / `shared/hooks/useRawMySportProfiles.ts` | stale doc-comment field lists corrected |

**MSW + fixtures (2 files):** `e2e/mocks/handlers/sport.ts` — dropped `preferredPosition` from the
create-response literal, the `PUT /api/sports/profiles/:profileId` body type + its conditional
spread, and the `seedSoftDeletedSportProfile` literal. `e2e/mocks/fixtures.ts` — dropped from both
`mockSportProfiles` entries.

**Tests (~16 files):** the ~12 files that only carried `preferredPosition: null` in a
`UserSportProfileResponse` fixture literal had that line removed. Three files had real assertions
re-pointed to **Years of experience** (an already-supported control) so draft / payload / dirty /
unsaved-guard behaviour stays covered:

- `SportProfileSettingsTab.test.tsx` — dropped `setPreferredPosition` from `baseProps` and the
  `profile()`/`draft()` factories; the "calls setPreferredPosition as the field is edited" case
  became "calls setYearsOfExperience…"; removed the "Preferred position" assertions from the
  "renders seeded from the draft" and "every field … disabled" cases.
- `useSportProfileSettingsTabData.test.tsx` — the `profile()` factory lost the field; the
  re-seed / diffed-payload / onSuccess / discard cases now dirty `yearsOfExperience` instead.
- `ProfilePage.test.tsx` — the PROFILE-10 "Settings unsaved-changes guard" block's
  `openSettingsAndEdit` helper now types into **Years of experience** (2 → 25); assertions and the
  `put` spy payload updated accordingly; `footballProfile` / `basketballProfile` fixtures lost the
  field.
- `ProfilePage.stories.tsx` — `footballProfile` fixture lost the field.

`AddSportFields` / `AddSportModal` were checked and **do not collect** the field (sport + skill
level + optional years of experience only) — no change there, contrary to the ticket's conditional
bullet.

### Key decisions

- **Client-first, as the ticket mandates.** Backend A18 is still `TODO`; after this ships the
  backend keeps returning `preferredPosition` in the JSON — a surplus key with no TS field is
  harmless. The reverse order (drop the column first) is the unsafe one and was not taken.
- **Re-point, don't delete, the behavioural tests.** The removed field was the vehicle for testing
  "an edit dirties the draft / produces a diffed payload / trips the unsaved-changes guard".
  Those assertions were moved onto `yearsOfExperience` rather than dropped, so coverage of the
  draft/payload/guard machinery is unchanged.
- **No `design-reference-profile.html` edit.** The reference never had a "Preferred position"
  field (the per-sport editor is a PROFILE-4/SPORT-2 addition beyond it) — removing the field moves
  the built page *closer* to the reference.

### Divergence from the approved design

None.

### Visual-regression expectation

Baselines **`profile-settings-375.png` / `profile-settings-768.png` / `profile-settings-1280.png`**
(`e2e/visual/app-profile.spec.ts`) legitimately change — the Settings tab loses one field row
(`sport-profile-position`). They are expected to fail until the `update-baselines` GitHub dispatch
(`/updatebaseline`) regenerates exactly those three files; **every other baseline must come back
byte-identical**. Baselines cannot be regenerated on this Windows host. A local
`visual-regression` run was not used as evidence — on Windows it fails wholesale on the documented
font-rendering noise floor; the expectation above is by construction (a DOM row was removed from a
baselined surface, nothing else baselined was touched).

### Verification

- `pnpm exec tsc -b` — clean.
- `pnpm exec eslint` (all changed files) — clean.
- `pnpm test` (Vitest) — **161 files / 1099 tests pass**.
- `pnpm exec playwright test --project=e2e` — `profile-journey` (2, incl. the Settings-tab save
  through the edited MSW `PUT` handler), `feed-groups-journey`, `matches-journey`, `friends-journey`
  all pass. (`friends-journey` flaked once under `--workers=2` three-spec contention — the
  documented Windows-host starvation — and passed clean in isolation; unrelated to this change,
  which touches no friend-request path.)
- `visual-regression` not run — Windows font-rendering noise floor makes a local run
  non-informative; see the expectation line above (3 `profile-settings-*` baselines change by
  construction, nothing else baselined touched).
- No e2e spec files added/removed/materially changed → `client/docs/E2E_OVERVIEW.md` unchanged
  (`profile-journey.spec.ts` never referenced the field).

### Delta for later tickets

`UserSportProfileResponse` no longer carries `preferredPosition` client-side. Backend **A18** still
needs to drop the column + remove the field from `UserSportProfile` / `CreateUserSportProfileRequest`
/ `UserSportProfileResponse` server-side; until it does, the backend response simply carries an
extra key the client ignores.
