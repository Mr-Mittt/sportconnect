# CLIENT-ERR-2 · Client error adaptation: auth

**Status:** `DONE` (2026-10-05)
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, A8 (auth)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **auth**, after A8 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** `/login` and `/register` (`useLogin`, `useRegister`, `LoginForm`, `RegisterForm`); invalid credentials, duplicate email, deactivated account, session expiry.

**Localization:** en + vi for every new string (client rule).

**Pickup decisions (2026-10-05, user, after the A8 audit):**
- Copy (en + vi) for the three codes a user can see or will see: `EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED` (unreachable until backend A9, added now so A9 needs no client change). No copy for `REFRESH_TOKEN_*` (never rendered: bootstrap is silent, a refresh failure redirects), `VERIFICATION_*` (no client screen) or `RESET_*` (moved to **AUTH-9**).
- Deactivated users log in with the same 401 `INVALID_CREDENTIALS` as a wrong password (A8 audit), so the login form cannot show a deactivation message.
- Session expiry keeps the CLIENT-ERR-1 default: silent refresh, then redirect to `/login`, no notice.
- Duplicate email (409): inline banner with a "Sign in instead" link to `/login` (the one departure from the CLIENT-ERR-1 default). Input kept.
- Invalid credentials (401): inline banner, input kept, nothing cleared (default).
- Unknown code: category copy, then server prose (classifier unchanged).
- The auth feature has no ad-hoc `status ===` checks to remove; the `apiClient` 401 refresh flow is not display logic and stays.
- Follow-ups filed: backend **A10** (wire `forgot-password`), client **AUTH-9** (forgot/reset screens). Noted, not filed: the `apiClient` interceptor clears the session on any refresh failure, including a 500 or network error, so a transient server error logs the user out.

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

---

## Scope change (2026-10-05, at the behavior sign-off)

- **Validation 400s are localized.** Raised by the user at the table review: a register 400 showed English "Validation failed". Decision: the shared C12 code `VALIDATION_FAILED` gets en + vi generic copy in `errors:codes` (global, so every bean-validation failure in the app benefits), and the register banner names the failed fields from the form's own labels. The login form shows the generic invalid-credentials line for a 400, because the login API should not describe what is wrong with the input; the backend is unchanged.

## Implementation summary (2026-10-05)

**Approved behavior table, as built.**

| Flow | Error | Shows | en copy | vi copy | Afterwards |
|---|---|---|---|---|---|
| Register | 409 `EMAIL_ALREADY_REGISTERED` | Inline banner + "Sign in instead" link to `/login` (the one departure from the CLIENT-ERR-1 default) | An account with this email already exists. / Sign in instead | Đã có tài khoản dùng email này. / Đăng nhập ngay | Stay on form, input kept, no refetch |
| Register | 400 `VALIDATION_FAILED` | Inline banner: generic line + "Check: <field labels>" (known keys `email`, `password`, `fullName`, `phoneNumber`; others left out) | Some of the information you entered isn't valid. Check the form and try again. / Check: Password. | Một số thông tin bạn nhập chưa hợp lệ. Vui lòng kiểm tra lại biểu mẫu rồi thử lại. / Kiểm tra: Mật khẩu. | Stay, input kept |
| Register | 5xx, offline, other | Inline banner, category copy (CLIENT-ERR-1 default, unchanged) | existing | existing | Stay, input kept |
| Login | 401 `INVALID_CREDENTIALS` | Inline banner (default) | Invalid email or password. | Email hoặc mật khẩu không đúng. | Stay, nothing cleared, no silent refresh, no redirect |
| Login | 400 `VALIDATION_FAILED` | Same banner and copy as the 401, no field detail | same | same | same |
| Login | Deactivated account | Same banner: the API returns `INVALID_CREDENTIALS` for it | same | same | same |
| Login | 5xx, offline | Inline banner, category copy (default) | existing | existing | Stay, input kept |
| App-load bootstrap | any `REFRESH_TOKEN_*`, 5xx, offline | Nothing (silent) | none | none | Logged-out state |
| Mid-session refresh failure | any | Nothing | none | none | Session cleared, redirect to `/login` |
| Any | `ACCOUNT_DEACTIVATED` | Copy registered only: "This account has been deactivated." / "Tài khoản này đã bị vô hiệu hóa." | | | Dormant: only refresh could emit it (backend A9), and refresh is silent |

**Built.**
- `errors.json` (en + vi): `codes.EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED`, `VALIDATION_FAILED`. `register.json` (en + vi): `form.serverError.signInInstead` and `checkFields`.
- `useLogin`: a 400 `VALIDATION_FAILED` resolves to `errors:codes.INVALID_CREDENTIALS`; everything else through `getErrorMessage`. Return shape unchanged.
- `useRegister`: additionally returns `errorCode` and `errorFields` (the keys of `errorParams.fields` for a `VALIDATION_FAILED`). `RegisterPage` passes both to `RegisterForm`, which has two new optional props, `errorCode` and `errorFields`.
- Stale "server message stays untranslated" comments in `LoginForm`, `RegisterForm`, `useLogin`, `useRegister` rewritten.
- e2e: `mocks/handlers/auth.ts` `apiError()` takes `errorCode`/`errorParams`; login 401s carry `INVALID_CREDENTIALS`; register returns 409 for `mockTakenEmail` (new in `fixtures.ts`) and 400 `VALIDATION_FAILED` with `fields` for blank-after-trim fields. `auth-journey.spec.ts` step 4 now expects "Invalid email or password.".

**Divergences from the plan.**
- The validation-copy and login-400 rows were added at the sign-off (see the scope change above).
- No ad-hoc `status ===` checks existed in the auth feature, so nothing was removed; the `apiClient` 401 refresh flow is not display logic and is untouched.

**Consumer census result.** `useLogin` return shape: unchanged. `useRegister` return shape: additive (`RegisterPage` and its tests updated; any other caller: none). `RegisterForm` props: additive, optional. `errors:codes.VALIDATION_FAILED`: affects every form whose 400 is a bean-validation failure, which now shows localized generic copy instead of English "Validation failed"; compatible as-is, and CLIENT-ERR-3..8 do not need to re-decide it. `apiClient.ts` 401 flow, `useSessionBootstrap`: compatible as-is. I18N-4 census rows for `/login` and `/register`: updated.

**Tests.** Vitest: `useLogin` (401 en + vi, 400 → generic), `useRegister` (409 en + vi with `errorCode`, 400 with `errorFields`), `RegisterForm` (link only for a duplicate email, field labels with unknown keys skipped, no list when none known), existing page/form specs updated. Stories: `RegisterForm` `DuplicateEmail` and `ValidationFailed`. e2e: new `auth-errors.spec.ts` (6 tests, en and vi). Scoped runs: Vitest over `features/auth`, `shared/lib/apiError`, `app`, `locales`, `App` = 180 tests (the two `noRawServerError` guard tests timed out at 5s under the parallel load, then passed alone in 1.1s); `tsc -b` and eslint clean on the touched files; e2e `auth-errors`, `auth-journey`, `signup-locale`, `locale` = 21 passed.

**Not verified.** I did not open Storybook or look at the banner by eye, so the link styling and spacing are untested visually. No backend endpoint was called live; the codes come from A8's IT-verified responses. The visual-regression project was not run: no baselined surface renders an error banner.

**Follow-ups.** Backend **A10** (wire `forgot-password`) and client **AUTH-9** (forgot/reset screens) are filed. Not filed, noted: the `apiClient` interceptor clears the session on any refresh failure, including a 500 or network error, so a transient server error logs the user out. Say if you want it as a ticket.
