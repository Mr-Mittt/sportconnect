# A8 · Structured error codes on `ApiResponse.error()` for known auth failures

**Status:** `TODO`
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

**Known auth messages:** `Email already registered`, `Email already verified`, `Invalid email or password`, `Account is deactivated`, `Refresh token expired or revoked`, `Refresh token missing`, `Reset token already used`, `Reset token has expired`, `Verification token has expired`.

**Audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior |
|---|---|---|---|---|---|
| _to be filled during the audit_ | | | | | |

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
