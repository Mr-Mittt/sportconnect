# CLIENT-I18N-2 · Translate the rest of the app (incrementally, feature by feature)

**Status:** `DONE` (2026-09-29, step 1 only — see Scope at pickup)
**Type:** Enhancement (broad, incremental — expect to split at pickup)
**Depends on:** CLIENT-I18N-1, CLIENT-REF-2, CLIENT-REF-3
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone": the first pass translates only the sign-up form and
profile-edit surfaces (`documentation/md/REFERENCE_DATA_DESIGN.md` § 9); this is the follow-up that closes the English-only
seam it knowingly leaves (e.g. an English `LoginForm` next to a Vietnamese sign-up).

## What

Extract and translate the remaining hardcoded UI strings into the `en`/`vi` bundles, in this order of user impact:
1. `LoginForm`/`LoginPage` and the auth shell (visible immediately next to the translated sign-up).
2. `TopBar`, `NavTabs`, shared modals and empty/error states.
3. Home Feed, Groups, Friends, Profile, Sessions/Matches, Notifications, Admin — one feature per PR, each
   with its own tests and baselines.
4. **Client-mirrored backend enums** — session status labels, comment/post types, `getNotificationText` (I18N_READINESS
   **I18N-5**). These are a distinct chunk of the surface; `NotificationType` is an exhaustive union, so a new locale key
   set is enforced by the compiler for that one.

Backend-authored messages (`ApiResponse.message`, exception text — **I18N-4**) are **not** this ticket; where the client shows a
server message verbatim, it stays English until that is designed.

## Notes for pickup

- Every feature PR flips visible copy, so **visual baselines change**; regenerate via `update-baselines`, never from Windows.
- Vitest stays pinned to `en` (CLIENT-I18N-1). Add a small "no missing keys between `en` and `vi`" test so a bundle can't drift.
- Prefer splitting this ticket into one ticket per feature when picked up (file each as its own backlog entry), rather than one
  giant PR.
- Dates, numbers and currency (`VND`) go through `Intl` with the active locale — audit existing hardcoded formats as each
  feature is touched.

**Out of scope:** backend message/enum localization (I18N-4); adding locales beyond `en`/`vi`; the language picker UI (CLIENT-REF-1/3).

## Scope at pickup (2026-09-29, user decision)

Split per the "Notes for pickup" recommendation above: **this pickup covers step 1 only —
`LoginForm`/`LoginPage` + `AuthShell`'s default tagline.** Steps 2–4 (`TopBar`/`NavTabs`/shared
modals; each per-feature page; client-mirrored enums) are filed as their own separate backlog
tickets rather than built here, so this stays a small, reviewable PR instead of one giant one. This
ticket (`CLIENT-I18N-2`) closes covering only step 1; the follow-up tickets carry the rest forward.

## Implementation summary (2026-09-29)

Built exactly per the "Scope at pickup" split above — `LoginForm`/`LoginPage`/`AuthShell`'s default
tagline only.

**i18n:** new `login` namespace (`src/locales/{en,vi}/login.json`), same shape `register.json`
established — `tagline`, `heading`, `subheading`, `form.{email,password}.label`,
`form.password.{showAction,hideAction}`, `form.{submit,submitting,or}`, `form.oauth.*`,
`form.{newToSportHub,createAccount}`. English values copied verbatim from the previously-hardcoded
strings, so every existing English-locale test/e2e assertion needed zero changes. Registered in
`app/i18n.ts`. `LoginForm.tsx`/`LoginPage.tsx` wired via `useTranslation('login')`; `LoginPage`
passes `tagline={t('tagline')}` into `AuthShell`, mirroring `RegisterPage` exactly — `AuthShell`'s
own doc comment updated (it previously said "LoginPage never passes this prop," now stale).
`useLogin.ts`'s client-side fallback error string ("Something went wrong…") deliberately **left
untranslated**, matching `useRegister.ts`'s own precedent from CLIENT-REF-2 rather than diverging.

**Found and fixed while touching `.storybook/preview.ts`:** the `profile` namespace (CLIENT-REF-3)
had never been registered in Storybook's own isolated i18next instance — `EditProfileModal` stories
reviewed under the `vi` toolbar were showing raw untranslated keys. Fixed alongside adding `login`.

**New `src/app/i18n.test.ts`:** the "no missing keys between `en`/`vi`" guard the ticket's own
"Notes for pickup" asked for — walks every namespace pair's leaf key paths and asserts they match
exactly, covering all 4 namespaces that exist today (`common`, `register`, `profile`, `login`).

**e2e:** `locale.spec.ts`'s vi-locale test previously asserted still-English `getByLabel('Email')`/
`getByRole('button', {name:'Log in'})` locators while the page's locale was already `vi` — it only
passed because nothing on `/login` translated yet. Updated to assert the real Vietnamese labels
("Chào mừng trở lại", "Mật khẩu", "Đăng nhập").

**Follow-ups filed** (steps 2–4 of the original scope, per its own "prefer splitting" note):
**CLIENT-I18N-3** (TopBar/NavTabs/shared chrome), **CLIENT-I18N-4** (per-feature pages),
**CLIENT-I18N-5** (client-mirrored backend enums — closes `I18N_READINESS.md`'s I18N-5).

**Tests:**
- Vitest: `LoginForm.test.tsx`/`LoginPage.test.tsx` unchanged and green (proves the English strings
  are byte-identical); new `i18n.test.ts` (4 namespace-pair cases). Scoped run: 48/48 green.
- `e2e`: every spec touching `/login` re-run directly rather than deferred — `locale.spec.ts` (2/2,
  including the fixed vi-locale test), `a11y.spec.ts`'s `/login`-scoped subset (7/7),
  `auth-journey.spec.ts`/`msw-setup.spec.ts`/`post-deep-link.spec.ts`/`admin-route-guard.spec.ts`
  (13/13), `admin-sports.spec.ts` (6/6). **28/28 total, full `e2e` project not re-run this pickup.**
- **Visual-regression expectation:** no baselined `/login` surface exists in this repo (confirmed —
  same finding CLIENT-REF-2 made for `/register`/`/login`), so no baseline change expected; a
  failing `visual-regression` run on this branch would be pure Windows noise floor, not caused by
  this change.

**`tsc -b`** and **ESLint** both clean across every touched file.

## Follow-up fix (2026-09-29, same PR): native validation wasn't translated

Caught by the user in review, after the PR above was already pushed: `LoginForm` translated every
*static* string but still used native HTML5 constraint validation (`required`, no `noValidate`) —
the browser's own "Please fill out this field" popup renders in the browser's own language, never
this app's `i18next` locale, so switching to Vietnamese never translated it. This is the exact bug
`RegisterForm` already hit and fixed at CLIENT-REF-2 (custom `noValidate` + `hasAttemptedSubmit` +
translated inline messages) — it just wasn't carried over when `LoginForm` was translated here.

Fixed by mirroring `RegisterForm`'s pattern exactly: `noValidate`, `hasAttemptedSubmit` state,
`aria-required="true"` replacing `required`, translated inline error text beside each label (new
`form.email.error.{required,invalid}` / `form.password.error.required` keys in `login.json`).
Login has no `RequiredMark` (unlike Register) — every field here is required, so a visual "*" on
both adds no information a required/optional distinction would give on the longer sign-up form.
Password gets only a "required" check, no length rule — that's a registration-time concern, not
login's; the server stays the source of truth for whether credentials are actually correct.

**Documented so this class of gap isn't missed a third time:** added `I18N_READINESS.md`'s new
**I18N-10** ("translating a form is not just its static JSX strings") covering both this
native-validation gap and the parallel "does this form show a server error message verbatim"
question (I18N-4) that every translation ticket should state explicitly rather than silently
inherit. Referenced from all three filed follow-ups (`CLIENT-I18N-3`/`4`/`5`) so whoever picks them
up checks every form they touch for both, not just the visible static copy.

**Tests:** new `describe('custom validation ...')` block in `LoginForm.test.tsx` (4 cases, mirrors
`RegisterForm.test.tsx`'s shape) + a new `InvalidSubmit` Storybook story with a `play` function.
Scoped Vitest 52/52 green (was 48, +4 new). Re-ran every previously-green e2e spec touching
`/login` after the DOM change (`noValidate`, dropped `required`, label markup restructured):
`a11y.spec.ts`'s `/login`-scoped subset (7/7, including the Tab-order test), `locale.spec.ts` (2/2),
`auth-journey.spec.ts`/`msw-setup.spec.ts` (9/9) — all still green, confirming the restructure
didn't change tab order or accessible names. `tsc -b`/ESLint clean; `pnpm exec storybook build`
succeeds (build-time check only).
