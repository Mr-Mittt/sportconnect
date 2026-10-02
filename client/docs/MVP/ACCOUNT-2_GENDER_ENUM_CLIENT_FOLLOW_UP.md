# ACCOUNT-2 · Gender enum — client follow-up to backend U20

**Status:** `DONE` (2026-10-02) · **Type:** Enhancement · **Depends on:** backend **U20** (`modules/user/user-impl/docs/BACKLOG_MVP.md`) - **shipped 2026-10-02, unblocked**
**Filed:** 2026-09-30, from ACCOUNT-1: the Account Settings gender field is a Male/Female dropdown sending `MALE`/`FEMALE`, but the server (until U20) still accepts and stores free text, so the client carries transitional handling.

## What

Once U20 ships (server validates `gender`, legacy rows normalized to `MALE`/`FEMALE`/`NULL`):
- Remove the transitional legacy handling: `normalizeGender` in `profileEditDraft.ts` and the "extra option for a value outside `GENDERS`" branch in `AccountSettingsModal`.
- Surface the server's gender-validation 400 (shown verbatim today via `useEditProfileSave` — I18N-4 census row already exists for that hook; confirm it still applies).
- Update MSW `e2e/mocks/fixtures.ts`/handlers so the mock rejects a non-enum gender like the real service.

**Localization:** no new copy expected (`enums:gender.*` already en + vi); if U20 adds values, add them to both bundles.

**Out of scope:** adding gender options beyond what U20 defines.

**Tests:** update `AccountSettingsModal.test.tsx` (drop the legacy-value cases), Vitest for the removed helper; scoped e2e `profile-journey`.

---

## Implementation summary (2026-10-02)

**Approved design:** with U20 shipped (validated `MALE`/`FEMALE`, legacy rows normalized, DB CHECK), delete the client's free-text workarounds, make the e2e mock behave like the real service, and keep `UserResponse.gender` as `string | null` (it is the wire contract; narrowing would touch fixtures for no behavioural gain). Scope confirmed unchanged at pickup.

**Built**
- `profile/types.ts`: `GENDERS` comment now describes the server enum; `isGender` removed (no remaining caller).
- `profileEditDraft.ts`: `normalizeGender` removed; the draft seeds `user.gender ?? ''`. Diff semantics unchanged (`""` clears, a changed value is sent).
- `AccountSettingsModal.tsx`: unknown-value `<option>` and the `isGender` import removed.
- `e2e/mocks/handlers/friends.ts`: `PUT /api/users/:userId/profile` returns 400 `gender must be one of: MALE, FEMALE` for anything but absent/`null` (skip), `""` (clear → stored `null`, not the previous `...body` spread's empty string), `MALE`, `FEMALE` (case-sensitive); a rejected request applies nothing.
- Fixtures: `'Female'` → `'FEMALE'` in `AccountSettingsModal.stories.tsx` and `EditProfileModal.stories.tsx` (values the server can no longer return).
- Tests: the two legacy cases in `AccountSettingsModal.test.tsx` replaced by "stored value preselected, form not dirty", "Not specified sends `''`" and "server gender-validation message shown verbatim"; `profile-journey` step 7 now selects Female, asserts the `PUT` body, and asserts the persisted value after the locale switch.

**Diverged from the plan:** none.

**Consumer census:** all client consumers of `gender` listed and handled — updated here: draft helper, modal, types, two stories, mock handler, modal test; compatible as-is: `UserResponse`, `friends/types.ts`, `ProfileHeader`, other `gender: null` fixtures. `useEditProfileSave` still surfaces the server message verbatim, so its I18N-4 census row is unchanged and still accurate (the dropdown can't produce an invalid value, so the 400 is a defence-in-depth path).
**Localization:** no new copy (`enums:gender.*` already en + vi; U20 added no values).
**Tests:** tsc/eslint clean; scoped Vitest (`shared/components`, `features/profile`, `App.test`) 60 files / 518 passed.
**E2E:** scoped `e2e` project (`profile-journey`, `a11y`, `locale`) — 42 passed; full `e2e` project not run (scoped only, per standing instruction). `E2E_OVERVIEW.md` step-7 row updated.
**Visual-regression expectation:** no baselined surface touched — no baseline change expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run locally.
