# ACCOUNT-1 · Account Settings modal

**Status:** `DONE` (2026-09-30) · **Type:** Component · **Depends on:** none ·
**Filed:** 2026-08-26, split out of the `/profile` page `/feature` scoping session — user decision:
"the account setting will be managed via account setting modal, triggered as an action on avatar
dropdown menu... not belong to profile page" ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md` §5 (context only — this ticket's own design is not
done yet, see below)

## What ships

A new "Account settings" item on `TopBar`'s existing avatar `DropdownMenu` (`shared/components/
TopBar.tsx`, which already has `DropdownMenuItem onSelect={onLogout}` wired for logout) — sits
alongside `Logout`, opens an Account Settings modal covering account-level preferences, independent
of `/profile` (a different page entirely) and every `PROFILE-*` ticket.

**Confirmed real, backed today:**
- Profile visibility — `privacyProfile` on `UserPreference`, `GET`/`PUT /api/users/me/preferences`
  (`UserPreferenceController`, already exists, auto-creates defaults on first access). Values today:
  `public`/`friends`/`private` (`UserPreference.privacyProfile` default `"public"`).

**Open, to decide at this ticket's own pickup (deliberately not resolved here):**
- The mockup's three toggles (Activity sharing / Tagging / Weekly digest) don't describe any feature
  that exists in the app — no auto-post-match-results, no friend-tagging-permission concept. The real
  `UserPreference` fields are `notificationEmail`/`notificationPush`/`notificationSms`, which are a
  different concept (notification channel, not behavior toggle). Decide at pickup whether to: (a) drop
  the three toggles entirely, (b) relabel and wire them to the real notification-channel fields, or
  (c) ship them local-only/unsaved with a disclaimer (`GroupChatTab` precedent). Don't guess here —
  this needs its own short design pass, not an inherited assumption from the `/profile` scoping
  session that split this ticket out.
- Whether Log out itself moves into this modal too, or stays exactly where it already is on
  `TopBar`'s dropdown (simplest: leave `Logout` where it is, this ticket only adds one new sibling
  item that opens the modal).

## Explicitly out of scope

Anything already covered by a `PROFILE-*` ticket (identity fields, sport-profile data) — this modal is
account-level only.

## Tests

Vitest/RTL — dropdown gains the new item; modal opens/closes; visibility picker round-trips through
the real mutation. Exact toggle tests depend on the open design question above being resolved first.

## Scope change (2026-09-30, `/workon` pickup, user decisions) — supersedes the open questions above

- **Toggles dropped** (Activity sharing / Tagging / Weekly digest) — no backing feature.
- **Profile-visibility picker dropped** — no visibility/privacy control ships in this ticket.
- **Log out stays** exactly where it is on `TopBar`'s dropdown; "Account settings" is only a new sibling item.
- **New scope: the Account Settings modal takes over `EditProfileModal`'s fields, except avatar and cover.**
  Identity (first/last name, username, bio), country/region/language (`GeoLocaleFields`), contact
  (phone) and personal (DOB, gender, height, weight, shoe size) move into Account Settings.
- **`EditProfileModal` shrinks to avatar URL + cover URL only** and stays as the `/profile` "Edit profile" modal.
- **Localization is in scope (standing rule, user decision 2026-09-30):** the new `TopBar` item, the
  Account Settings modal, and the shrunken `EditProfileModal` all ship with `en` + `vi` copy (moved
  keys re-homed, not duplicated), `i18nOverridePrefix` per the shared-component convention, a `vi`
  render test, and `noHardcodedText.test.ts`/`i18n.test.ts` parity green. Also check I18N-10 (no
  native validation; raw server error messages → I18N-4 census row).

## Implementation summary (2026-09-30)

**Approved design (as scoped above):** an "Account settings" item on `TopBar`'s avatar dropdown opens a
new `AccountSettingsModal`, owned by `AppShell` so it is reachable from every page. It carries every
field `EditProfileModal` used to edit except avatar/cover; `EditProfileModal` shrinks to avatar URL +
cover URL. Localized in en + vi.

**Built**
- `TopBar` gains `onOpenAccountSettings` and an "Account settings" `DropdownMenuItem` (settings icon)
  above Log out (`shell:topBar.accountSettings`). Log out is unchanged.
- `AccountSettingsModal` (new, `shared/components/`): the previous Edit Profile body minus avatar/cover —
  name/username/bio, `GeoLocaleFields` country/region/language, phone, DOB/gender/height/weight/shoe
  size. Same save contract (`AccountSettingsSavePayload` = profile payload + optional `languageCode`,
  fired by `useEditProfileSave`). New `accountSettings` namespace (en/vi, registered in `i18n.ts`,
  Storybook `preview.ts`, `i18n.test.ts` parity); `i18nOverridePrefix` via `useOverridableText`.
  The moved field/section keys were **re-homed** from `profile` (which keeps only title/avatar/cover/save).
- `AppShell` runs `useMyProfile`/`useUserPreferences`/`useEditProfileSave` and mounts the modal **only
  while open**, so its draft and its reference-data queries reset on each open and no page pays for
  them until then. `GET /users/me` is now fetched on every page (cache shared with `/profile`).
- `EditProfileModal` emits a plain `UpdateProfilePayload`; `ProfilePage` now uses `useUpdateMyProfile`
  directly and no longer fetches preferences. `profileEditDraft` unchanged (both modals share it; each
  only exposes its own fields).

**Diverged from / added beyond the plan**
- `useUpdateMyProfile`'s hardcoded English fallback (`Could not save your profile…`) is now localized
  (`profilePage:saveResult.profileFailedRetry`, en text byte-identical) — it became the Edit Profile
  modal's only error path, so leaving it English-only would have broken the localization rule.
- Mounted-only-while-open was the plan's "renders once profile has loaded" refined: an always-mounted modal
  would have fired the reference GETs/`POST /reference/resolve` on every page.
- I18N-4 census (`documentation/md/I18N_READINESS.md`): row split into Account Settings (any page) and
  the narrowed Edit Profile modal.

**Consumer census result:** `ProfilePage(+stories)`, `EditProfileModal(+test/stories)`,
`useEditProfileSave` (type import), `TopBar` (+test/stories) — updated here. MSW handlers/backend —
compatible as-is (no contract change). e2e `profile-journey` step 6, `a11y` (new Account-settings
test), `visual/app-profile` — updated here.

**Tests:** new `AccountSettingsModal.test.tsx` (moved Edit Profile cases + no-avatar/cover, vi, override),
rewritten `EditProfileModal.test.tsx` (avatar/cover only, vi), `TopBar.test.tsx` (item + vi), `App.test.tsx`
(opens Account settings, seeded from `/users/me`); stories for both modals. tsc/eslint clean (2 pre-existing
warnings in `SessionStartTimePicker`). Scoped Vitest: 60 files / 506 green (`locales`, `i18n`, `shared/components`,
`features/profile`) + `App.test.tsx` 14/14.

**E2E:** scoped `e2e` project (`profile-journey`, `a11y`, `locale`, `notification-bell`) — 47 passed. The
full `e2e` project was not run (scoped runs only, per standing instruction); `client/docs/E2E_OVERVIEW.md`
updated (journey steps 6/7/8, a11y row, visual note).

**Visual-regression expectation:** baselines `profile-edit-profile-modal-{375,768,1280}.png` legitimately
change (the modal shrinks from a full form to two fields) — expected to fail until the `update-baselines`
GitHub dispatch regenerates exactly those three files; every other baseline must stay byte-identical.
`visual-regression` was **not run** locally (Windows noise floor makes it uninformative without a
stash-and-rerun); no new visual spec for Account Settings was added — file one if wanted.

**Delta for later tickets:** `ProfilePage.test.tsx`/`.stories.tsx` still mock the preferences GET and the
geo `POST /reference/resolve` "for the Edit Profile modal" — now unused there, harmless leftovers.

## Delta — post-review fixes (2026-09-30, user feedback on the built modal)

- **Phone:** the register form's phone typing/paste guard was private to `RegisterForm`; extracted with the
  digits-only guard into `shared/lib/inputGuards.ts` (`phoneNumberInputProps`, `digitsOnlyInputProps`,
  unit-tested) and applied to `AccountSettingsModal`'s phone field; `RegisterForm` now uses the shared one.
- **Height / weight / shoe size** accepted `e`, `+`, `-`, `.` (native `type="number"` behaviour) — same gap
  `CreateSessionModal` already closed privately. They (and, by user decision, every other plain number input:
  `SportProfileSettingsTab` years of experience, `AddSportFields` years of experience, admin `SportFieldsForm`
  min/max players) now use `digitsOnlyInputProps`, so values are positive whole numbers only (no `-`), typed
  or pasted. `CreateSessionModal`/`FeeTypeFields` keep their own equivalent private copies (not deduped here).
  Schema-driven `NumberField` (attribute values) is deliberately untouched — it can legitimately take decimals.
- **Gender** is now a Male/Female dropdown (`GENDERS` in `features/profile/types.ts`, labels in `enums:gender.*`,
  en + vi), sending `MALE`/`FEMALE`. The server stores free text (`VARCHAR(20)`, no validation), so legacy values
  are handled transitionally: a case-insensitive `female`/`male` maps onto the enum in `toProfileEditDraft`
  (never marks the form dirty), anything else stays as an extra selectable option. **Filed:** backend
  `U20` (validated enum + migration) and client `ACCOUNT-2` (drop the transitional handling after U20).
- Tests: `inputGuards.test.ts` (new), `AccountSettingsModal.test.tsx` (+gender dropdown, legacy mapping,
  guard cases). Scoped Vitest green; scoped e2e (`profile-journey`, `a11y`, `signup-locale`) 38/38.
