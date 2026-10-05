# A8 · Structured error codes on `ApiResponse.error()` for known auth failures

**Status:** `DONE` (2026-10-05)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common) — the shared `ApiResponse` contract (see scope change below)
**Filed:** 2026-09-28, found during client **CLIENT-REF-2** (sign-up) — the register error banner shows the server's
raw English message (e.g. `"Email already registered"`) with no way for the client to translate it, since
`ApiResponse.error(message)` carries only free text, no code. The client-side fix at CLIENT-REF-2's pickup was to
leave the banner untranslated (a documented, accepted limitation) rather than string-match the English text, which
would be fragile and break silently the moment this message's wording changes.

## Scope change (2026-10-02, I18N-4 review — user decision)

The error-handling program (`documentation/md/ERROR_HANDLING_DESIGN.md`) puts the shared contract in **common C12**: `ApiResponse.errorCode`/`errorParams`, the additive exception constructors, `GlobalExceptionHandler` pass-through and the `ERROR_CODES.md` registry. This ticket therefore **no longer adds the `ApiResponse` field** and instead becomes the **auth Phase B audit**: check every user-reachable auth endpoint (login, register, refresh, logout, forgot/reset password, verify-email), categorize each error with the C12 taxonomy, define codes (starting with `EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED`, plus the refresh/reset/verify token errors), record them in `ERROR_CODES.md`, convert the throw sites, and cover the boundaries with ITs. The "decide at pickup which throw sites" caveat below is replaced by "all user-reachable auth errors". Paired client ticket: **CLIENT-ERR-2** (auth copy and states).

**Pickup decisions (2026-10-04, user):** only register's duplicate email moves from 400 to 409 (`ConflictException`, `EMAIL_ALREADY_REGISTERED`). `Email already verified` and `Reset token already used` stay 400 (`BadRequestException`) with codes `EMAIL_ALREADY_VERIFIED` / `RESET_TOKEN_USED`. The `JwtAuthenticationEntryPoint` 401 text stays unchanged (no code, no new message). `Invalid refresh token` (refresh, unknown token) is added to the audited sites.

**Known auth messages:** `Email already registered`, `Email already verified`, `Invalid email or password`, `Account is deactivated`, `Refresh token expired or revoked`, `Refresh token missing`, `Reset token already used`, `Reset token has expired`, `Verification token has expired`.

**Observation from C12 (2026-10-02):** `JwtAuthenticationEntryPoint` writes the 401 body itself, outside `GlobalExceptionHandler`, and puts Spring's internal text in `message` ("Unauthorized: Full authentication is required..."). The client's 401 flow keys off the status only, so **no `errorCode` is wanted for 401** (user decision, C12). Decide in this audit whether to replace that text with a fixed message; do not add a code.

**Audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior |
|---|---|---|---|---|---|
| `POST /register` | `Email already registered` | CONFLICT (**400 → 409**) | `EMAIL_ALREADY_REGISTERED` | none | Inline banner (CLIENT-ERR-2) |
| `POST /login` | `Invalid email or password` (wrong password, unknown email, **and a deactivated account**: `verifyPassword` returns false for it) | UNAUTHENTICATED (401) | `INVALID_CREDENTIALS` | none | Inline on the form; must not trigger the silent-refresh/redirect flow |
| `POST /refresh` | `Refresh token missing` (no cookie) | UNAUTHENTICATED (401) | `REFRESH_TOKEN_MISSING` | none | Session bootstrap: treat as logged out |
| `POST /refresh` | `Invalid refresh token` (unknown token) | UNAUTHENTICATED (401) | `REFRESH_TOKEN_INVALID` | none | Logged out |
| `POST /refresh` | `Refresh token expired or revoked` | UNAUTHENTICATED (401) | `REFRESH_TOKEN_EXPIRED_OR_REVOKED` | none | Logged out. This is what a deactivated user normally gets, because `deleteUser` revokes their tokens |
| `POST /refresh` | `Account is deactivated` | UNAUTHENTICATED (401) | `ACCOUNT_DEACTIVATED` | none | **Currently unreachable**, see the finding below |
| `POST /verify-email` | `Invalid verification token` | NOT_FOUND (404, unchanged) | `VERIFICATION_TOKEN_INVALID` | none | No client caller yet |
| `POST /verify-email` | `Email already verified` | VALIDATION (400, **kept**) | `EMAIL_ALREADY_VERIFIED` | none | No client caller yet |
| `POST /verify-email` | `Verification token has expired` | VALIDATION (400) | `VERIFICATION_TOKEN_EXPIRED` | none | No client caller yet |
| `POST /reset-password` | `Invalid reset token` | NOT_FOUND (404, unchanged) | `RESET_TOKEN_INVALID` | none | No client caller yet |
| `POST /reset-password` | `Reset token already used` | VALIDATION (400, **kept**) | `RESET_TOKEN_USED` | none | No client caller yet |
| `POST /reset-password` | `Reset token has expired` | VALIDATION (400) | `RESET_TOKEN_EXPIRED` | none | No client caller yet |
| any `@Valid` body | field errors | VALIDATION (400) | `VALIDATION_FAILED` (C12) | `{fields}` | Inline per field |
| any protected path | `Unauthorized: <Spring text>` from `JwtAuthenticationEntryPoint` | UNAUTHENTICATED (401) | none, by C12 decision | none | Status-only flow; text left unchanged by user decision 2026-10-04 |
| `POST /logout`, `POST /forgot-password` | no coded throw sites (logout is the 401 above; forgot-password is a placeholder that always succeeds) | n/a | n/a | n/a | n/a |

**Finding: `ACCOUNT_DEACTIVATED` is unreachable (2026-10-05).** In `AuthServiceImpl.refreshToken`, `getActiveUserForUpdate` runs before the `!user.getIsActive()` check, and it throws `ResourceNotFoundException` for an inactive user, so the `ACCOUNT_DEACTIVATED` branch is dead code. A deactivated user's refresh returns 401 `REFRESH_TOKEN_EXPIRED_OR_REVOKED` in the normal case (`deleteUser` revokes their tokens), and 404 `User not found with id : <uuid>` in the race U12 closed. **User decision: keep the behavior as is**, since there is no account re-activation process. The code stays registered, the Spock spec for the branch stays (it documents the intended mapping), and the gap is filed as **A9** (`TODO`).

## Implementation summary (2026-10-05)

**Design (as approved, restated):** no `common` changes. C12 already provides the coded constructors, `ConflictException` (409) and the `GlobalExceptionHandler` pass-through. This ticket converts auth's throw sites, registers the codes, and proves them through the real pipeline. `message` text is unchanged at every site.

**Built:**
- `AuthServiceImpl`: register duplicate email now throws `ConflictException("EMAIL_ALREADY_REGISTERED", …)` (the only status change, 400 → 409); login, and the three refresh sites plus the deactivated one, throw coded `UnauthorizedException`s.
- `AuthController`: refresh with no cookie throws `REFRESH_TOKEN_MISSING`; Swagger on `/register` now documents 400 (validation) and 409.
- `EmailVerificationService` / `PasswordResetService`: all six sites coded, statuses unchanged (404 unknown token, 400 used/verified/expired).
- Registry: auth section added to `documentation/md/ERROR_CODES.md`; tracker row updated in `ERROR_HANDLING_DESIGN.md`.

**Tests:**
- Spock: `AuthServiceImplSpec` (duplicate email → 409, login, deactivated, `errorCode` added to the existing refresh specs), new `EmailVerificationServiceSpec` and `PasswordResetServiceSpec`, `AuthControllerSpec` (missing cookie code).
- IT: new `server/.../integration/AuthErrorCodesIntegrationTest` (12 tests, through real MockMvc + H2): register duplicate (409), login wrong password and unknown email (401), refresh missing / unknown / revoked (401), verify-email unknown / already verified / expired, reset-password unknown / used / expired. It proves status and `errorCode` reach the real response body. `server/src/test/resources/schema.sql` gained `email_verifications` and `password_reset_tokens` (mirroring V002 without the V044-dropped FKs).

**Divergences from the design:**
- The 400 → 409 scope narrowed from three sites to one (user decision 2026-10-04); verify and reset "already" cases stay 400.
- The IT first inserted token rows with raw JDBC `Timestamp.valueOf(...)` and the "expired" cases wrongly passed (the test JVM's timezone is not UTC, and the entity path converts differently); they now save through the repositories, which is also how production writes them.
- No IT for `ACCOUNT_DEACTIVATED`: it is unreachable (finding above), so there is no real request that produces it.

**Consumer census result:** register 400 → 409: `RegisterForm` compatible as-is (409 is CONFLICT and still shows the message); e2e MSW handler has no duplicate-email case; no other module calls register's error shape. Verify/reset: no client or backend consumer. Mapping codes to copy is CLIENT-ERR-2 (already filed).

**Not covered here:** the `/refresh` 404 leak and dead branch (A9); `createUser` errors reached through register (U21); copy for any code (CLIENT-ERR-2).

The original ticket text follows unchanged for history.

---

## What

Add an optional `errorCode` (or similarly named) field to `ApiResponse`/`ApiResponse.error()`, and set it at known
auth throw sites — starting with register's `"Email already registered"` (`BadRequestException` thrown from
`AuthServiceImpl.register()`) — so a client can map a stable, versioned code to its own translated message instead
of rendering the server's own free-text string. `message` stays exactly as it is today (a human-readable English
fallback) for any caller that never adopts the code, so this is additive, not a breaking change to the existing
contract.

**Who:** any client screen that currently shows a server-driven auth error — today, sign-up's inline error banner
(`RegisterForm`'s `errorMessage` prop) is the only one.

**Entry point:** the existing `POST /api/auth/register` error response (and, if scope allows once this is designed,
`login`'s equivalent failures — decide at pickup which throw sites are worth codifying first rather than doing all
of them in one pass).

**Inputs/outputs:** no new request shape. Response shape gains one optional field on the existing error envelope;
omitted entirely when a throw site hasn't been updated to set it yet.

## Consumer census note (CLAUDE.md § API Change Discipline)

`ApiResponse` is the shared response envelope used by every controller in the app. Adding one new optional field to
it is additive and non-breaking for every existing consumer (nothing reads a field that isn't there yet), but this
still counts as a shared-DTO change per CLAUDE.md's discipline — do the actual census (grep every backend module's
`ApiResponse.error(...)` call site, and the client's `ApiResponse` type mirror + any MSW fixtures asserting the error
shape) at pickup, not skipped because "it's just additive."

## Out of scope

- Retrofitting every backend error in the app with a code — this ticket scopes to auth's known throw sites
  (register's duplicate-email case at minimum; more if pickup decides to widen it).
- The client-side mapping/translation itself — a client ticket (map `errorCode` → `t('errors.<code>')`), filed once
  this ships and the exact code names/shape are known.

**Tests:** Spock coverage for each throw site updated to assert the new `errorCode` alongside the existing `message`
assertion; an integration test confirming the field round-trips through the real HTTP response for at least the
register-duplicate-email case.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md`.
