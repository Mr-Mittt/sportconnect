# A21 · Reset-token check endpoint, and one atomic transaction for "consume token + change password"

**Status:** `DONE` (2026-10-13; built on the **AUTH-9** client branch by user decision, one PR)
**Type:** Feature + bug fix (small)
**Depends on:** A10 (done). Client side: **AUTH-9** (page-load check).
**Filed:** 2026-10-13, found while hand-testing AUTH-9 (a used reset link still rendered the form).

## What

1. **Ordering weakness (bug).** `AuthController.resetPassword` calls `PasswordResetService.validateAndUseToken` (its own `@Transactional`, commits `used_at`) and then `resetPassword` (a second transaction). If the password update fails after the first commit, the token is dead and the password is unchanged: the user sees an error and must request a new link. Two concurrent submits of the same token can also both pass the "not used" check, since the check and the stamp are not one atomic step.
   Fix: one `@Transactional` service method (`completeReset(token, newPassword)`) that claims the token with a conditional update (`UPDATE password_reset_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?`, one row or nothing), changes the password, revokes the refresh tokens and evicts the revocation cache after commit. If anything fails, the token is still unused. When the claim updates no row, a read decides which error to throw (`RESET_TOKEN_INVALID` 404, `RESET_TOKEN_USED` 400, `RESET_TOKEN_EXPIRED` 400, as today).
2. **Check endpoint.** New public `POST /api/auth/reset-password/validate` with body `{ token }`; no side effects. 200 when the token exists, is unused and unexpired; otherwise **one generic answer for every bad token**: 404 `RESET_TOKEN_INVALID` (never "used" or "expired" on this endpoint, so it reveals as little as possible; the specific wording still appears on `reset-password` itself). POST with a body, not GET with a query string, so the token stays out of access logs.

## Consumer census (2026-10-13)

| Consumer | Verdict |
|---|---|
| `AuthController.resetPassword` (calls `validateAndUseToken` then `resetPassword`) | updated in this change |
| `PasswordResetService.validateAndUseToken`, `resetPassword` (no callers outside the controller and `PasswordResetServiceSpec`) | replaced by `completeReset`; spec updated |
| `PasswordResetIntegrationTest`, `AuthErrorCodesIntegrationTest`, `AccountReactivationIntegrationTest` (call `POST /api/auth/reset-password`) | compatible as-is (same endpoint, same codes); re-run |
| `SecurityConfig` public list, `PublicSurfaceAccessIntegrationTest` | updated: the new path is added on purpose |
| `password_reset_tokens` schema | unchanged (no migration) |
| Client: `useResetPassword`, `ResetPasswordPage`, MSW auth handler | updated in AUTH-9 |

Account lifecycle: unchanged. A deactivated user may still reset their password (A9/A10); the check endpoint is public and treats them like anyone else.

## Tests

Spock for `completeReset` (success; each error code; password update throwing leaves the token unused is covered by the IT, since a mock cannot prove a rollback). IT in `PasswordResetIntegrationTest`: check answers 200 for a fresh token and the identical 404 for used, expired and unknown tokens; a failing password update (a token row for a nonexistent user, no spy) leaves `used_at` null and the same link still works afterwards; a second submit of a used token answers `RESET_TOKEN_USED`. `PublicSurfaceAccessIntegrationTest` gains the new path.

## Out of scope

Rate limiting the endpoint (A5, moved to V1 — the token is a random UUID, so guessing is not practical meanwhile); deleting used/expired rows on a schedule.

## Implementation summary (2026-10-13)

**Design (approved):** as under "What" above: one atomic `completeReset`, and a public side-effect-free `POST /api/auth/reset-password/validate` with one generic 404 for every bad token. POST over GET (user decision) to keep the token out of access logs and avoid caching.

**Built:**
- `PasswordResetTokenRepository.claimUnusedToken(token, now)`: `UPDATE ... SET used_at = :now WHERE token = :token AND used_at IS NULL AND expires_at > :now`, returns 1 or 0.
- `PasswordResetService.completeReset(token, newPassword)` (`@Transactional`): claim, then `UserService.updateUserPassword`, `revokeAllUserTokens`, `evictAfterCommit` (A12). A zero-row claim is explained by a read: unknown 404 `RESET_TOKEN_INVALID`; expired-and-unused 400 `RESET_TOKEN_EXPIRED`; otherwise 400 `RESET_TOKEN_USED` (so a token both used and expired still reports used, as before, and a lost race reports used). `validateAndUseToken` and `resetPassword` are gone (callers: only `AuthController` and the spec).
- `PasswordResetService.checkToken(token)` (`@Transactional(readOnly = true)`): throws the same `RESET_TOKEN_INVALID` for unknown, used and expired.
- `AuthController`: `/reset-password` calls `completeReset`; new `POST /reset-password/validate` (`ValidateResetTokenRequest` in `auth-api`, `@NotBlank token`). `SecurityConfig` lists the new path explicitly.
- No migration, no schema change.

**Non-obvious:** the atomicity test uses a token row for a user id that does not exist, so `updateUserPassword` throws for real and the claim must roll back; no spy or mock is needed to prove the rollback. The public-surface IT pins the new path.

**Diverged from plan:** only the test mechanism: the plan said a `UserService` spy to force the failure; a token row for a nonexistent user does it for real, with no extra Spring context. Also planned but not added as a separate IT: "a second submit of a used token answers `RESET_TOKEN_USED`", already covered by the existing `aTokenCannotBeUsedTwice`, which passed unchanged against `completeReset`.

**IT changes report:**
- `PasswordResetIntegrationTest` (4 new, 14 total): `validate_acceptsAFreshToken_withoutConsumingIt` (200 twice, `used_at` stays null, reset still works); `validate_answersIdentically_forUnknownUsedAndExpiredTokens` (byte-identical 404 bodies); `validate_rejectsABlankToken_asAValidationFailure` (400 `VALIDATION_FAILED`); `aFailedPasswordUpdate_doesNotConsumeTheToken` (rollback leaves `used_at` null and the link still validates).
- `PublicSurfaceAccessIntegrationTest`: `/api/auth/reset-password/validate` added to the anonymous-reachable list.
- Re-run unchanged and green: `AuthErrorCodesIntegrationTest` (12), `AccountReactivationIntegrationTest` (9). `PasswordResetServiceSpec` rewritten for `completeReset` and `checkToken`.
- `:server:test` was run scoped to these four classes, not the full suite (standing rule). Real server check: the user's used token and an unknown token both got the identical 404, a blank token 400.
