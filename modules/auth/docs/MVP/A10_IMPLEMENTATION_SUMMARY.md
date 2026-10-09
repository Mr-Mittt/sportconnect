# A10 · Implementation summary: `forgot-password` issues and emails a reset token

**Status:** `DONE` (2026-10-09, second pass for email language added below). Ticket: [A10](A10_WIRE_FORGOT_PASSWORD_TO_RESET_TOKEN_EMAIL.md).

## Approved design (as agreed before building)

- `POST /api/auth/forgot-password` looks the user up by email through `UserService` (deactivated accounts included), issues a one-hour token and emails the link. The response is the same 200 and message whether or not the email exists.
- One reset token per user, enforced by the database (scope change: unique constraint on `password_reset_tokens.user_id`, V078).
- `reset-password` also revokes the user's refresh tokens.
- Expiry comes from one property, read by both the token service and the email text.
- The reset-link default points at the new client (`:5173`).
- Timing difference between the known and unknown email paths is accepted and documented; rate limiting stays with A5.

## What was built

| Area | Change |
|---|---|
| Migration | `V078__password_reset_tokens_unique_user_id.sql`: removes older duplicate rows per user (keeps the newest), adds `uq_password_reset_tokens_user_id`, drops the redundant V002 index. Registered in `db.changelog-master.xml`. |
| Entity | `PasswordResetToken` declares the unique constraint. |
| `UserService` (`-api`) | New `Optional<UUID> findUserIdByEmail(String)`: includes deactivated users, never throws, exposes only the id. Implemented over `UserRepository.findByEmail`. |
| `PasswordResetService` | New `requestReset(email)` replaces the unused `createAndSendResetToken`. `resetPassword` now calls `RefreshTokenRepository.revokeAllUserTokens`. Expiry from `app.password-reset.expiration-minutes` (default 60). |
| `EmailService` | Reset-email text reads the same property ("expires in N minutes"). |
| `AuthController` | `forgotPassword` calls `requestReset`; Swagger description updated. |
| Config | `application.yml`: `reset-password-url` default `:3000` → `http://localhost:5173/reset-password`; new `app.password-reset.expiration-minutes`. |

## Key decisions and non-obvious constraints

- **Token replacement runs in a `TransactionTemplate`, with the race caught outside it.** Two concurrent requests for one user collide on the unique key. A catch *inside* a participating transaction would leave it rollback-only, so the `DataIntegrityViolationException` is caught around the template. The loser sends nothing; the winner's token and email stand.
- **The email is sent only after the commit,** so a rolled-back token never has a link mailed out. Before, the email went out inside the transaction.
- **Delete is flushed before the insert** (`flush()`, then `saveAndFlush`). The derived `deleteByUserId` is load-then-remove, and without the flush Hibernate may order the insert first and trip the new unique key.
- **Spring async was already enabled** (`AsyncConfig` with `@EnableAsync`), and `EmailService` is its only user. Nothing added.
- **A deactivated user can reset their password and stays deactivated** (A9 rule); `resetPassword` never touches `isActive` and issues no tokens.
- **Timing:** the known-email path still does a delete + insert + commit that the unknown path skips (a few milliseconds). Accepted; the SMTP send, the slow part, is `@Async`. Enumeration is already possible through register (409) and `GET /api/users/check/email`.

## Divergence from the approved design

None in the design itself. Two things came up during testing:
1. **A pre-existing security gap** (not introduced here): logout, deactivation and password reset stamp the DB but never evict the Redis revocation watermark, so a cached "never revoked" entry keeps older access tokens valid for up to an hour. Confirmed by experiment (the same test passes when no authenticated request primed the cache). Filed as **auth A12** (`A12_EVICT_REVOCATION_CACHE_ON_LOGOUT_AND_DEACTIVATION.md`) and not fixed here. A10's IT therefore asserts what A10 guarantees (refresh tokens revoked, watermark stamped, uncached access token rejected) and says so in a comment.
2. **My first expired-token test wrote the expiry with raw JDBC** and the token still read as valid (timezone mismatch between raw JDBC and Hibernate in the test profile). The test now writes it through the repository, the same mapping `isExpired()` reads.

## Consumer census

| Consumer | Verdict |
|---|---|
| `forgot-password` / `reset-password` REST contract | compatible as-is (no client caller yet; `client/` greps show docs only, no `src` and no MSW handler) |
| `UserService` (`-api`) | one method added; the only implementer is `UserServiceImpl` |
| `password_reset_tokens`: entity, repository, `AuthServiceImpl` (holds the repository only) | updated here / compatible |
| `AccountReactivationIntegrationTest`, `AuthErrorCodesIntegrationTest` | compatible (one token per user after a table clear); both re-run green |
| `server/src/test/resources/schema.sql` | updated here (`user_id UNIQUE`) |
| `TokenRevocationChecker` cache | gap found, deferred with filed ticket **auth A12** |

## Tests

- **Spock** (`PasswordResetServiceSpec`, 4 new): known email → old token deleted, fresh token saved, email sent with it; unknown email → nothing; unique-key race → no email, no throw; `resetPassword` revokes refresh tokens. `UserServiceImplSpec` (2 new): `findUserIdByEmail` finds a deactivated user and returns empty for an unknown email.
- **IT changes** (`server/.../integration/`):
  - **Added** `PasswordResetIntegrationTest` (7 cases): register → forgot → read token row → reset → log in with the new password; identical 200 body (timestamp excluded) for active, deactivated and unknown emails, with a token row only for the two real accounts; a deactivated user resets and stays deactivated (login still `ACCOUNT_DEACTIVATED`); an expired token gives `RESET_TOKEN_EXPIRED`; a reused token gives `RESET_TOKEN_USED`; reset revokes refresh tokens and rejects an uncached earlier access token; a second request replaces the first token (old link `RESET_TOKEN_INVALID`) and the DB refuses a second row for one user.
  - **Updated** `server/src/test/resources/schema.sql` (unique `user_id`). The two existing IT classes that touch the table needed no change.
- **Results:** `:modules:auth:auth-impl:test` and the `UserServiceImplSpec` run green. `:server:test` full run: 551 tests, 6 failed, all in `SessionEventsConsumerIntegrationTest` with a RabbitMQ `AmqpIOException` (session/notification code A10 does not touch); that class passes when run alone, so it is a container flake in the full run, not a regression. `PasswordResetIntegrationTest`, `AccountReactivationIntegrationTest`, `AuthErrorCodesIntegrationTest` and `PublicSurfaceAccessIntegrationTest` all pass.

## Follow-ups

- **auth A12** (filed): evict the Redis revocation watermark when sessions are revoked.
- **A5** (V1): `forgot-password` is a public, mail-sending endpoint with no rate limit until A5 ships; noted in A5.
- **client AUTH-9**: the screens that call these endpoints; its reset-link path (`/reset-password?token=…`) matches the new default.
- Reset-email copy is English only (I18N-4 note).

---

## Second pass (2026-10-09): the reset email in the user's language

Scope change after the first pass (ticket item 7): the reset email goes out in the user's language. Approved design: a `UserService` lookup that resolves the language, en/vi bundles in `auth-impl`, and a bundle-availability gate.

**Built**
- `UserService.findPreferredLanguageCode(UUID)` (`-api`, impl in `UserServiceImpl`): `UserPreference.language` when it is an active language, else the country's `default_language_code` when active, else empty. Includes deactivated users; returns only a code. The country default comes from `ReferenceService.getCountriesByIds` (user-impl already depends on `reference-api`; `auth` never touches countries).
- `EmailMessages` (`auth-impl`, new): `resolveLanguage` takes the primary subtag (`vi-VN` → `vi`) and returns it only when `email/reset-password_<lang>.properties` exists, otherwise `en`; renders subject and body via `ResourceBundleMessageSource` (UTF-8, MessageFormat).
- `email/reset-password_en.properties` and `_vi.properties` (new). The expiry minutes and link are parameters, so the text still follows `app.password-reset.expiration-minutes`.
- `EmailService.sendPasswordResetEmail(to, token, language)` (was `(to, token)`; its only caller, `PasswordResetService`, updated). `PasswordResetService.requestReset` resolves the language after the token commit, before handing off to the async sender.

**Decisions and constraints**
- **A preference row always has a language.** `UserPreference.language` defaults to `en`, and the row is created lazily when preferences are first read, so a user who only opened their preferences counts as having chosen English and never reaches the country default. A user with no row (registered without a language, never opened preferences) does. Accepted as the straightforward reading of the stored value.
- **"Supported" means "has a bundle."** A language active in `languages` but without a bundle falls back to `en` instead of failing at send time.
- **Timing:** the known-email path now does three more small reads (preference, user, country) before the async send. Same accepted trade-off as before; the SMTP send is still async.
- MessageFormat quirk: a literal apostrophe in a bundle is written twice (`didn''t`); noted in the bundle header.

**Tests**
- Spock: `EmailMessagesSpec` (new: language resolution cases, English text with apostrophe, Vietnamese text), `PasswordResetServiceSpec` (+4 rows: the language passed to the sender for `vi`, `vi-VN`, an unbundled `fr`, and empty), `UserServiceImplSpec` (+4: preference wins, country-default fallback, inactive stored language skipped, empty with no data).
- **IT changes:** `PasswordResetIntegrationTest` gained 3 cases (10 total) and now seeds the real reference data with `ReferenceTestData.reseed` (en/vi, Vietnam with default `vi`) and clears it after: country-default fallback for a deactivated user plus a full `forgot-password` run with the Vietnamese path; a stored preference beating the country default; empty when there is no preference and no country, and an inactive language skipped. **Not covered by the IT:** the text of the message actually handed to the SMTP sender (the sender is not captured in this context); that is covered by `EmailMessagesSpec`.
- Results: `:modules:auth:auth-impl:test`, the `UserServiceImplSpec` run and the full `:server:test` are green (the earlier RabbitMQ flake did not recur).

**Follow-ups:** auth **A13** (filed) localises the verification and welcome emails with this machinery; `documentation/md/I18N_READINESS.md` has the new note.
