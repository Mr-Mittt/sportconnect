# i18n Readiness

A running list of considerations for **app-wide i18n** (static UI copy, a locale switcher,
`User.preferredLocale`) — collected here so they don't stay buried in whichever ticket first raised
them. **No app-wide i18n is built, or even designed, anywhere in this codebase yet.** There is no
i18n library in `client/package.json`, and the only trace of the idea is one unanswered question in
`documentation/md/ARCHITECTURE_PROPOSAL.md` ("Multi-language Support: Do you need
internationalization?"). This file exists so that when it's finally scoped, there's already a real
list of concrete interactions and gotchas to design against instead of starting from a blank page —
same purpose as `documentation/md/NOTIFICATION_USE_CASES.md` for the notification feature.

**Do not confuse this with the attribute-schema localization already built (A13).** That one is a
narrower, already-shipped mechanism — see [Relationship to A13](#relationship-to-a13-attribute-schema-localization)
below for exactly how the two interact and where they must not diverge.

## How to use this file

- Log a new consideration whenever an i18n-relevant gotcha, interaction, or open question comes up
  anywhere — a ticket, a `/vision` session, a bug write-up — and isn't resolved on the spot. Don't
  leave it as a loose bullet in that doc; add it here too, with a pointer back to the source.
- Entries are numbered `I18N-<n>`, sequential, never reused even if a consideration turns out moot.
- Status values: `CANDIDATE` (logged, not yet decided) · `CONFIRMED` (product/design decision made,
  still not built) · `BUILT` (shipped, link the ticket) · `MOOT` (considered and no longer applies —
  say why).
- When app-wide i18n is eventually scoped, this file is the starting input — every open entry
  becomes a concrete constraint the design has to satisfy, not a fresh brainstorm.

---

## Relationship to A13 (attribute-schema localization)

`modules/sport/sport-impl` already ships locale-aware content — per-sport attribute labels
(`SportAttributeSchema.label`, A13) — but via a mechanism that will *not* generalize to static UI
strings without deliberate work:

- **Resolved server-side, not bundled client-side.** The server reads `Accept-Language` and returns
  one string per node; the client never receives the full set of translations for a label the way a
  static i18n bundle ships every locale up front. This is the right call for A13 specifically —
  labels are admin-authored, dynamic content the client can't know about ahead of a fetch — but it
  is the *opposite* of how most static-string i18n libraries work (they bundle every locale
  client-side and switch instantly, no network round trip).
- **Locale codes are BCP 47** (`en`, `vi`, `en-US`, `vi-VN`), deliberately not the ISO 3166 country
  code (`vn`) mistake. Whatever app-wide i18n solution is picked must use the same code system —
  two different locale-code schemes living side by side in the same app would be its own bug class.
- **No `User.preferredLocale` field exists.** A13's design doc (§7.5) named this as a future
  override for `Accept-Language`-based resolution but deliberately did not build it, since nothing
  needed it yet. App-wide i18n's locale switcher is the natural moment this actually gets built — and
  once it exists, A13's resolver should almost certainly be extended to consult it too, not just
  `Accept-Language`, so a signed-in user's chosen language is consistent between the UI chrome and
  the attribute labels next to it.

## Considerations

### I18N-1 · No app-wide i18n exists — this file's own reason to exist
**Date added:** 2026-08-24
**Status:** `CONFIRMED` (2026-09-25 — scoped as client **CLIENT-I18N-1**, which supersedes the old V1 `I18N-1` placeholder ticket; design in `documentation/md/REFERENCE_DATA_DESIGN.md` § 9)
**Source:** `documentation/md/ARCHITECTURE_PROPOSAL.md`'s unanswered "Multi-language Support" question, surfaced while scoping A13

Nothing is built or designed. Whoever picks this up first needs to answer, at minimum: which
library (see I18N-8), where translation bundles live, how the locale is detected/selected, and
whether it's a v1-MVP requirement or a later phase.

### I18N-2 · The UI's chosen locale must drive `Accept-Language` on attribute-schema requests
**Date added:** 2026-08-24
**Status:** `CONFIRMED` (2026-09-25 — built by **CLIENT-I18N-1**: an `apiClient` interceptor sends `Accept-Language` from the in-app locale, and locale-dependent query keys include it)
**Source:** A13 (`modules/sport/sport-impl/docs/MVP/A13_LOCALIZED_ATTRIBUTE_SCHEMA_LABELS.md`)

Whatever mechanism app-wide i18n uses to pick the in-app language (URL locale prefix, cookie,
explicit switcher backed by local state) is *not* automatically what the browser sends as
`Accept-Language` — that header reflects OS/browser settings by default. If the two diverge (a user
picks Vietnamese in-app on an English-configured browser), the sport-attribute labels client `SPORT-2`
renders would silently resolve to the wrong language unless the client explicitly overrides the
`Accept-Language` header on that request to match the in-app selection. (`Accept-Language` is not on
the Fetch spec's forbidden-header list, so this is possible — worth a quick live confirmation at
implementation time rather than taken purely on faith here.) If a query library like TanStack Query
is used for that fetch (per `client/CLAUDE.md`), the query key must include the active locale, or
switching languages won't trigger a refetch and will keep serving the previous language's cached
response.

### I18N-3 · `User.preferredLocale` doesn't exist yet — building it here should also wire it into A13
**Date added:** 2026-08-24
**Status:** `CONFIRMED` (2026-09-25 — backend **A24**, `modules/sport/sport-impl`. Correction to the entry below: the stored language is the **existing** `UserPreference.language` column, validated against the new `languages` table by **U16**, not a new `User.preferredLocale` field. Only an *explicitly stored* language should override `Accept-Language`; the auto-created default `"en"` must not.)
**Source:** A13 design doc §7.5

A13 explicitly deferred a persisted per-user locale preference. If app-wide i18n adds a locale
switcher with server-persisted state (so the choice survives across devices/sessions, not just
`localStorage`), that's the same field A13 already anticipated. Whoever builds it should update
`SportAttributeSchemaLabelResolver` to prefer `User.preferredLocale` over `Accept-Language` when the
caller is authenticated and has one set, rather than treating the two as unrelated.

### I18N-4 · Backend-authored, user-facing strings are English-only today
**Date added:** 2026-08-24
**Status:** `CONFIRMED` (2026-10-02 — direction 1 chosen: stable error codes + client-owned en/vi copy, no backend message catalog. Delivered through the error-handling program: global handling first, then a per-module audit that defines codes, then client adaptation. Design, phases and ticket tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`. Contract in common **C12**, client foundation **CLIENT-ERR-1**, per-module Phase B/C pairs listed there; auth **A8** was folded in as the auth audit.)
**Source:** surfaced while scoping A13's resolution split (raw vs. resolved responses)

`ApiResponse.message` and every domain exception's message (`BadRequestException`,
`ForbiddenException`, etc.) are hardcoded English strings, returned directly over the wire and, in
several places, rendered close to as-is by the client. Once the UI is localized, an English error
toast next to a translated form is a visible seam. Two directions to choose between when this is
scoped, not decided here:
1. The client stops displaying `message` directly for known error cases and maps a stable error
   *code* to its own translated copy instead (the backend would need to start returning codes, not
   just prose, for at least the cases the client wants to localize).
2. The backend grows a message catalog and does `Accept-Language`-based resolution for its own
   error/validation messages — a generalized version of what A13 built specifically for schema
   labels, at a much larger surface area (every `throw new BadRequestException(...)` site in the
   app today). A13's own resolution mechanism (`Locale` param, Spring's default
   `AcceptHeaderLocaleResolver`) is reusable as-is; what A13 doesn't give for free is a catalog for
   *developer-authored, fixed* strings the way A13's per-document `Map<String,String>` fits
   *admin-authored, dynamic* labels — the natural fit here is Spring's own `MessageSource` +
   `.properties` bundles (and Jakarta Validation's `{key}`-style `@Size(message=...)` resolution
   against the same bundle), not a bespoke resolver. The real size of this direction is rewriting
   every throw site to a message key and authoring every translation, not the plumbing.

**Consumer census (2026-09-29, from the `login`/`register` follow-up discussion at CLIENT-I18N-2's
pickup) — every client form currently showing a server-authored message verbatim, kept updated as
each client localization ticket (`CLIENT-I18N-3`/`4`/`5`/beyond) touches new ground, so this list is
current whenever I18N-4 itself finally gets scoped:**

| Page | Form/flow | Hook | Phase C ticket |
|---|---|---|---|
| `/login` | Log in | `useLogin` | CLIENT-ERR-2 |
| `/register` | Sign up | `useRegister` | CLIENT-ERR-2 |
| Any page (avatar dropdown) | Account Settings modal (ACCOUNT-1 — was the `/profile` Edit Profile modal's body) | `useEditProfileSave` (wraps `useUpdateMyProfile` + `useUpdateMyPreferences`) | CLIENT-ERR-3 (done 2026-10-05) |
| `/profile` | Edit Profile modal (ACCOUNT-1 — avatar/cover URL only) | `useUpdateMyProfile` (its client fallback is now localized; the server message is still shown verbatim) | CLIENT-ERR-3 (done 2026-10-05) |
| `/profile` | Settings tab — per-sport profile editor | `useUpdateSportProfile` | CLIENT-ERR-4 (done 2026-10-05) |
| `/profile` | Settings tab — deactivate/reactivate a sport profile | `useDeactivateSportProfile` | CLIENT-ERR-4 (done 2026-10-05) |
| Every page | Add sport (modal, session modals), reactivate nudge, status-confirm dialog | `useAddSportProfile` (via `getCodedErrorMessage` -> `errorText`) | CLIENT-ERR-4 (done 2026-10-05) |
| `/friends` | Send / accept / decline / cancel friend request (toast) | `useSendFriendRequest`, `useAcceptFriendRequest`, `useDeclineFriendRequest`, `useCancelFriendRequest` | CLIENT-ERR-3 (done 2026-10-05) |
| `/friends` | Unfriend dialog | `useUnfriend` (via `useFriendsPageData.unfriendErrorText`) | CLIENT-ERR-3 (done 2026-10-05) |
| Groups page | Invite Friend modal | `useInviteFriendModalData` (`onCodedError` -> `GroupActionErrorDialog` pop-up; uncoded keeps the row line) | CLIENT-ERR-5 (done 2026-10-06) |
| Groups page | Join Group modal | `useJoinGroupModalData` (`onCodedError` -> `GroupActionErrorDialog` pop-up; uncoded keeps the modal line) | CLIENT-ERR-5 (done 2026-10-06) |
| Groups page | Create group modal, Delete group dialog, Settings tab (privacy, save, leave) | `GroupsPage` (`getCodedErrorMessage` -> `errorText` / `privacyErrorText` / `saveSettingsErrorText` / `leaveErrorText`) | CLIENT-ERR-5 (done 2026-10-06) |
| Groups page | Join-request and invitation list actions (accept, decline, approve, reject, cancel) | `useGroupMembersTabData`, `useGroupInvitationsData` (`onActionError` -> `GroupActionErrorDialog`) | CLIENT-ERR-5 (done 2026-10-06) |
| Home Feed, Groups page, Profile Posts tab | Comments modal: post or thread that is gone / hidden (`POST_NOT_FOUND`, `POST_FORBIDDEN`), and the same codes on like, comment and delete | `usePostErrorGuard` + `reportPostMutationError` -> `PostActionErrorDialog` (app-wide pop-up in `AppShell`; the modal never opens for a load failure) | CLIENT-ERR-6 (done 2026-10-06) |
| Home Feed, Groups page, Profile Posts tab | Delete post (`POST_DELETE_FORBIDDEN`); comment delete/like, reply, post like/unlike conflicts (`COMMENT_NOT_FOUND`, `COMMENT_PARENT_NOT_FOUND`, `*_ALREADY_LIKED`, `*_NOT_LIKED`) | `useDeletePost`, `useLikePost`, `useUnlikePost`, `useCreateComment`, `useDeleteComment`, `useLikeComment`, `useUnlikeComment` (silent: the refetch shows the truth) | CLIENT-ERR-6 (done 2026-10-06) |
| Home Feed, Groups page, Profile Posts tab | Create-post form (`POST_GROUP_MEMBER_REQUIRED`, `POST_BROADCAST_*`) and the update-broadcast dialog (`POST_EDIT_FORBIDDEN`) | `CreatePostForm.errorText`, `UpdateBroadcastConfirmDialog.errorText` (via `getCodedErrorMessage`) | CLIENT-ERR-6 (done 2026-10-06) |
| Every page with a session card or the session detail modal | Join, leave, cancel, update, approve, reject, session like and session comment failures (`SESSION_NOT_FOUND`, `SESSION_FORBIDDEN`, `SESSION_GROUP_*_REQUIRED`, `SESSION_CREATOR_REQUIRED`, `SESSION_CANCELLED`, `SESSION_NOT_CANCELLABLE`, `SESSION_NOT_PREPARING`, `SESSION_NOT_PARTICIPANT`, `SESSION_JOIN_REQUEST_NOT_FOUND`) | `reportSessionMutationError` / `reportSessionDialogError` -> `useSessionErrorDialog` (app-wide dialog in `AppShell`); a dismissed 403 closes the modal via `useSessionErrorGuard` | CLIENT-ERR-7 (done 2026-10-07) |
| Matches, Home Feed, Groups, Friends, Profile, notification bell | Session detail load failure (`SESSION_NOT_FOUND`, `SESSION_FORBIDDEN`) | `SessionDetailModal.loadError` -> `ResourceUnavailable` (`unavailable` / `forbidden`) with a Close action | CLIENT-ERR-7 (done 2026-10-07) |
| Matches, Home Feed, Groups, Friends, Profile | Create-session form (`SESSION_SPORT_REQUIRED`, `SESSION_LOCATION_SPORT_MISMATCH`, `SESSION_FEE_AMOUNT_REQUIRED`) | `CreateSessionModal.errorText` (via `getCodedErrorMessage`) | CLIENT-ERR-7 (done 2026-10-07) |
| Admin | Sport fields editor | `useUpdateSport` | CLIENT-ERR-1 (shared classifier only; no vi copy) |
| Admin | Sport attribute-schema editor | `useReplaceSportAttributeSchema` | CLIENT-ERR-1 (shared classifier only; no vi copy) |
| Admin | Session attribute-schema editor | `useReplaceSessionAttributeSchema` | CLIENT-ERR-1 (shared classifier only; no vi copy) |

**CLIENT-ERR-1 (2026-10-04):** all 11 hooks above now read their error through the shared classifier
(`shared/lib/apiError.ts`, `getErrorMessage`) with the same return shape. A 400/409 (and a login 401)
still shows the server text verbatim; a 403, 404, 5xx or offline failure now shows the localized
`errors:category.*` copy instead of English server prose (so the vi UI no longer shows English for
those). The three admin hooks keep the server text or their fixed English fallback (no vi copy). The
"Phase C ticket" column is where each row's per-code copy lands.

**CLIENT-ERR-2 (2026-10-05):** the `/login` and `/register` rows are done. `errors:codes` now holds en + vi copy for `EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED` and the shared C12 code `VALIDATION_FAILED`. `useLogin` shows the `INVALID_CREDENTIALS` line for a 401 and for a 400 `VALIDATION_FAILED` (the login API should not describe the input). `useRegister` also returns `errorCode` and `errorFields`; the register banner adds a "Sign in instead" link for a duplicate email and "Check: <field labels>" for a validation failure. Because `VALIDATION_FAILED` copy is global, every other form whose 400 is a bean-validation failure now shows the localized generic line instead of English "Validation failed" (nothing is lost: that text carried no field detail). Errors with their own codes and prose are untouched.

**CLIENT-ERR-3 (2026-10-05):** the account-settings, edit-profile and friends rows are done. `errors:codes` gains en + vi copy for all 17 U21 codes; range errors interpolate `{min}`/`{max}`. Account Settings keeps its single alert banner (no per-field slots, user decision), the friend toasts now show localized copy instead of English server text, and the unfriend dialog shows the coded `NOT_FRIENDS` line. `CURRENT_PASSWORD_INCORRECT` has copy but no screen (client **ACCOUNT-3**).

**CLIENT-ERR-4 (2026-10-05):** the sport rows are done. `errors:codes` gains en + vi copy for the 7 A25 codes; the two attribute-size codes carry the generic line (no `4KB` shown). The add-sport flow, reactivate nudge and status-confirm dialog take a code-specific `errorText` (new `getCodedErrorMessage`), falling back to their existing static lines for uncoded errors.

Home Feed, Friends (aside from the invite modal), Sessions/Matches, and Notifications don't
currently surface a raw server message anywhere. **Whoever picks up `CLIENT-I18N-3`/`4`/`5` (or any
later translation ticket): if the form you're translating shows a server error verbatim, add its row
here** rather than just noting it locally in that ticket (per I18N-10) — this table is the census
I18N-4 needs the moment it's scoped for real, and it only stays trustworthy if every ticket updates
it, not just states the fact once and forgets it.

### I18N-5 · Client-mirrored backend enums are also translatable surface
**Date added:** 2026-08-24
**Status:** `CANDIDATE` (2026-09-25 — sized into client CLIENT-I18N-2, item 4; 2026-09-29 — split out
into its own ticket, client **CLIENT-I18N-5**, at CLIENT-I18N-2's pickup; still unbuilt)
**Source:** the `/workon` skill's "client-visible enum or event type check" — the client hand-mirrors
~15 backend enums into display text (e.g. `getNotificationText`, post/comment type rendering)

These display strings (notification text, post/comment type labels, session status labels, etc.)
are currently hardcoded English in the client, generated from backend enum values. They're a
meaningful chunk of the eventual translation-bundle surface, distinct from generic static UI copy
(buttons, nav labels) — worth accounting for in scope/sizing when i18n is estimated, not discovered
partway through.

### I18N-6 · Library choice is constrained by the actual client stack
**Date added:** 2026-08-24
**Status:** `CONFIRMED` (2026-09-25 — `i18next` + `react-i18next`, per CLIENT-I18N-1)
**Source:** `client/CLAUDE.md` (Vite + React 18 + TS, not Next.js)

Some popular React i18n solutions (e.g. `next-intl`) are Next.js-specific and don't fit this stack.
A Vite-compatible option (e.g. `react-i18next`, FormatJS/`react-intl`) is the natural fit — not a
final decision, just a constraint to check against whatever gets proposed, per `client/CLAUDE.md`'s
"no second styling system / test runner / icon set" spirit applied to i18n libraries too.

### I18N-7 · The phased rollout leaves visible English seams by design
**Date added:** 2026-09-25
**Status:** `CONFIRMED`
**Source:** `/feature` session "Language, country and zone" (`documentation/md/REFERENCE_DATA_DESIGN.md` § 9)

The first pass translates only the sign-up form, `EditProfileModal` and the new geo/locale fields. Until
**CLIENT-I18N-2** lands, a user who picks Vietnamese sees an English `LoginForm`, shell and feature pages next to
Vietnamese sign-up copy, and server messages shown verbatim (I18N-4) stay English. This is a knowingly accepted
seam, not a bug — do not "fix" it by widening a ticket beyond its scope.

### I18N-8 · Country/region names use two mechanisms
**Date added:** 2026-09-25
**Status:** `CONFIRMED`
**Source:** same session

Country names are localized on the client with `Intl.DisplayNames({ type: 'region' })` from the ISO code, so no
per-language country data is stored or translated. Regions have no such browser API, so the `regions` table carries
`native_name` and the client shows it when the UI locale is `vi`. Adding a locale beyond `en`/`vi` therefore needs
region names for that locale (a column or a translations table) in addition to a bundle and a `languages` row.

### I18N-9 · Tests stay pinned to English
**Date added:** 2026-09-25
**Status:** `CONFIRMED`
**Source:** CLIENT-I18N-1 (answers V1 `I18N-1` question 5)

Vitest/RTL assertions match many literal English strings. The test setup initialises i18n with `en` so existing tests keep
passing; new tests that exercise Vietnamese select it explicitly and prefer roles/labels over raw text. A small "no missing
keys between `en` and `vi`" test guards bundle drift.

### I18N-10 · Translating a form is not just its static JSX strings — validation and error paths need their own check
**Date added:** 2026-09-29
**Status:** `CONFIRMED`
**Source:** found twice independently — `RegisterForm` (fixed at CLIENT-REF-2 pickup) and, missed
the *second* time, `LoginForm` (translated at CLIENT-I18N-2 step 1, 2026-09-29; the native-validation
gap below was caught by the user in review of that same PR and fixed as a same-branch follow-up
commit, not a separate ticket)

Two failure modes a plain "swap hardcoded strings for `t()`" pass does not catch, because neither
one is a string literal sitting in the component's own JSX:

1. **Native HTML5 constraint validation renders in the browser's own language, never the app's
   locale.** Any `<input required>` / `type="email"` with `noValidate` unset triggers the browser's
   own "Please fill out this field" / "Please enter an email address" popup on submit — that text
   comes from the browser's UI language setting, completely bypassing `i18next`. Switching the app
   to Vietnamese does nothing to it. Fix (established pattern, both `RegisterForm` and `LoginForm`
   now use it): `noValidate` on the `<form>`, a local `hasAttemptedSubmit` flag set on a failed
   submit, translated inline error text next to each label computed from current state, and
   `aria-required="true"` replacing the native `required` attribute for the same a11y signal.
2. **Server-response error messages are deliberately left untranslated (I18N-4, still `CANDIDATE`
   — no decision made yet on *how* to eventually fix it).** This is a real, accepted gap, not an
   oversight — but a translation ticket must say so *explicitly* every time it touches a form with
   one, not silently inherit the assumption. Stating it is the whole point: it keeps I18N-4 a
   single, trackable "not yet done," instead of N separate silent gaps nobody can find later.

**Checklist for every future translation ticket** (`CLIENT-I18N-3`/`4`/`5` and anything after them)
touching a form: for each one, explicitly check (a) does it use native `required`/constraint
validation, and if so convert it to the pattern above; (b) does it render a server error message
verbatim, and if so say so in the ticket's summary as a deliberate, known I18N-4 gap **and add its
row to I18N-4's own census table above** — don't just leave it unstated, and don't just leave it
stated locally in one ticket's own doc either. Don't assume "I translated the visible strings" is
the whole job.
