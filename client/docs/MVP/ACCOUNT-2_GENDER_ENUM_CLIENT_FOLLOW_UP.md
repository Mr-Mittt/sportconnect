# ACCOUNT-2 · Gender enum — client follow-up to backend U20

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** backend **U20** (`modules/user/user-impl/docs/BACKLOG_MVP.md`) - **shipped 2026-10-02, unblocked**
**Filed:** 2026-09-30, from ACCOUNT-1: the Account Settings gender field is a Male/Female dropdown sending `MALE`/`FEMALE`, but the server (until U20) still accepts and stores free text, so the client carries transitional handling.

## What

Once U20 ships (server validates `gender`, legacy rows normalized to `MALE`/`FEMALE`/`NULL`):
- Remove the transitional legacy handling: `normalizeGender` in `profileEditDraft.ts` and the "extra option for a value outside `GENDERS`" branch in `AccountSettingsModal`.
- Surface the server's gender-validation 400 (shown verbatim today via `useEditProfileSave` — I18N-4 census row already exists for that hook; confirm it still applies).
- Update MSW `e2e/mocks/fixtures.ts`/handlers so the mock rejects a non-enum gender like the real service.

**Localization:** no new copy expected (`enums:gender.*` already en + vi); if U20 adds values, add them to both bundles.

**Out of scope:** adding gender options beyond what U20 defines.

**Tests:** update `AccountSettingsModal.test.tsx` (drop the legacy-value cases), Vitest for the removed helper; scoped e2e `profile-journey`.
