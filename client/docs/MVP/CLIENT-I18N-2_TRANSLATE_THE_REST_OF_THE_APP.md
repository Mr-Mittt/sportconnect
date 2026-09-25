# CLIENT-I18N-2 · Translate the rest of the app (incrementally, feature by feature)

**Status:** `TODO`
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
