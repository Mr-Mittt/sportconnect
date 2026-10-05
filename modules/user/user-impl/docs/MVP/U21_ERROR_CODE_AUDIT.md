# U21 · Error code audit: user module

**Status:** `DONE` (2026-10-05)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **user**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-3** lists the final codes.

**Scope:** profile and account updates, preferences, password change, friends and friend requests, user search/lookup, geo selection.

**Known messages to start from (not exhaustive — the audit finds the rest):** `heightCm must be between 50 and 300`, `weightKg must be between 20 and 300`, `shoeSizeCm must be between 10 and 500`, `Unknown or inactive language: <code>`, `gender must be one of: MALE, FEMALE` (U20), `You can only update your own profile`, `Current password is incorrect`, `You are already friends`, `Friend request already pending`, `latitude and longitude must be provided together`.

**Deliverable — audit table (filled 2026-10-05):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior |
|---|---|---|---|---|---|
| `PUT /users/{id}/profile` | `You can only update your own profile` | FORBIDDEN (403) | `USER_PROFILE_NOT_OWNED` | none | Page state: "no access" (not reachable from the UI, which only edits the caller's own profile) |
| profile | `heightCm must be between 50 and 300` | VALIDATION (400) | `HEIGHT_OUT_OF_RANGE` | `{min,max}` | Inline on the field |
| profile | `weightKg must be between 20 and 300` | VALIDATION (400) | `WEIGHT_OUT_OF_RANGE` | `{min,max}` | Inline on the field |
| profile | `shoeSizeMm must be between 10 and 500` (was `shoeSizeCm`) | VALIDATION (400) | `SHOE_SIZE_OUT_OF_RANGE` | `{min:10,max:500}` | Inline on the field |
| profile | `gender must be one of: MALE, FEMALE` | VALIDATION (400) | `GENDER_INVALID` | `{allowed}` | Inline on the field (the UI is a closed select, so a defensive fallback) |
| preferences, register | `Unknown or inactive language: <code>` | VALIDATION (400) | `LANGUAGE_UNKNOWN` | `{language}` | Inline / form banner |
| register (`createUser`) | `latitude and longitude must be provided together` | VALIDATION (400) | `LOCATION_INCOMPLETE` | none | Form banner (the UI always sends a pair) |
| register | `latitude must be between -90 and 90 …` | VALIDATION (400) | `LOCATION_OUT_OF_RANGE` | none | Form banner |
| `PUT /users/me/password` | `Current password is incorrect` | VALIDATION (400) | `CURRENT_PASSWORD_INCORRECT` | none | Inline on the current-password field |
| `GET /users/search` | `Search keyword must be at least 2 characters` | VALIDATION (400) | `SEARCH_KEYWORD_TOO_SHORT` | `{min}` | Hint under the search box (the UI normally gates this client-side) |
| `POST /users/friends/requests` | `Cannot send friend request to yourself` | VALIDATION (400) | `FRIEND_REQUEST_SELF` | none | Toast / inline |
| same | `User not found` (receiver missing or deactivated) | NOT_FOUND (404) | `USER_NOT_FOUND` | none | Inline "this person is no longer available" |
| same | `You are already friends` | CONFLICT (**400 → 409**) | `ALREADY_FRIENDS` | none | Inline, then refetch so the button shows the real state |
| same | `Friend request already pending` | CONFLICT (**400 → 409**) | `FRIEND_REQUEST_ALREADY_PENDING` | none | Inline, then refetch |
| `PUT …/requests/{id}/accept`, `/decline`, `DELETE …/requests/{id}` | `Friend request not found` (also when it belongs to someone else) | NOT_FOUND (404) | `FRIEND_REQUEST_NOT_FOUND` | none | Inline, then refetch the lists |
| same three | `Friend request is no longer pending` | CONFLICT (**400 → 409**) | `FRIEND_REQUEST_NOT_PENDING` | none | Inline, then refetch the lists |
| `DELETE /users/friends/{id}` | `You are not friends with this user` | CONFLICT (**400 → 409**) | `NOT_FRIENDS` | none | Inline in the unfriend dialog, then refetch |
| profile, password, preferences | `User not found with id : '<uuid>'` for a deactivated or missing caller | NOT_FOUND (404) | none (category copy) | none | Category copy |
| lookups (`/{id}`, `/email`, `/username`) | same 404 | NOT_FOUND (404) | none (category copy) | none | Category copy |
| any `@Valid` body | field errors | VALIDATION (400) | `VALIDATION_FAILED` (C12) | `{fields}` | Inline per field |
| `createUser` | `RuntimeException("Default USER role not found")` | INTERNAL (500) | `INTERNAL_ERROR` (C12) | none | Generic "something went wrong" |
| profile, register | `A region cannot be selected without a country`, `Unknown or inactive country: <id>`, `Region <id> is unknown…` | VALIDATION (400) | none yet, **REF-5** | none | Server message until REF-5 |

**Deactivated caller, per endpoint (CLAUDE.md § Account lifecycle):** since U12, `JwtAuthenticationFilter` rejects a deactivated user's access token (`tokenRevocationChecker`), so such a caller is stopped with a 401 before reaching any user endpoint. The services add a second layer where they read the caller: profile update, password change and both preference calls answer 404 with no code (`findByIdAndIsActiveTrue` / `requireActiveCaller`). Search and the friend endpoints have no caller `isActive` check of their own and rely on the filter; adding one is out of scope here. (CLAUDE.md § Account lifecycle still lists the U12 gaps as open; it is stale and is not edited by this ticket.)

**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-3**, filed alongside this ticket.

## Scope changes at pickup (2026-10-05, user decisions)

1. **Friend-state conflicts move 400 → 409** (`ConflictException`): `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_FRIENDS`. Contract change, so the consumer census covers the `client/src` friend hooks, MSW handlers and tests.
2. **`USER_NOT_FOUND` (404) is coded only on the friend-request receiver** in `sendFriendRequest`. The generic lookup/profile/password/preference 404s stay uncoded (category copy).
3. **`createUser` language and location errors are coded** (`LANGUAGE_UNKNOWN`, `LOCATION_INCOMPLETE`, `LOCATION_OUT_OF_RANGE`), reached through register.
4. **Shoe size unit changes from cm to mm, folded into this ticket.** `users.shoe_size_cm` becomes `shoe_size_mm` (new migration V077 multiplying existing values by 10), and `shoeSizeCm` becomes `shoeSizeMm` in the entity, `UpdateProfileRequest`, `UserResponse`, and the client types, drafts, `EditProfileModal`/`AccountSettingsModal`, `ProfileHeader`/`ProfilePage`, tests, stories and e2e mocks (label and unit copy in en + vi). The validation range stays 10-500, now in mm, as `SHOE_SIZE_OUT_OF_RANGE {min:10, max:500}`. The wire field rename is breaking, so backend and client ship together in this change.
5. **Found during the audit, not in scope:** `ReferenceService.requireValidSelection` throws three uncoded 400s reached through profile update and register. They belong to REF-5 and stay uncoded until then.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Implementation summary (2026-10-05)

**Design (as approved, restated):** no `common` changes; C12 already supplies the coded constructors, `ConflictException` and the `GlobalExceptionHandler` pass-through. U21 converts the user module's throw sites in place with inline string codes (the A8 pattern, no constants class), keeps every English `message` as it was, registers the codes in `documentation/md/ERROR_CODES.md`, and folds in the shoe-size unit change (cm to mm) at the user's request.

**Built:**
- `UserServiceImpl`, `UserPreferenceServiceImpl`, `UserFriendServiceImpl`: 17 sites coded (see the audit table). The four friend-state conflicts (`ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_FRIENDS`) moved from 400 to 409 via `ConflictException`; the two friend 404s are coded with `NotFoundException`. Swagger annotations on `UserFriendController` updated to 409.
- Shoe size: `V077__rename_shoe_size_cm_to_mm.sql` renames `users.shoe_size_cm` to `shoe_size_mm` and multiplies existing values by 10. `shoeSizeCm` became `shoeSizeMm` in `User`, `UpdateProfileRequest`, `UserResponse` and the service; the range stays 10 to 500, now millimetres, message `shoeSizeMm must be between 10 and 500`. Client: `shoeSizeMm` in the types, draft, `AccountSettingsModal`, tests, stories and e2e fixtures; label `Shoe size (JP, mm)` / `Cỡ giày (JP, mm)` (locale key `field.shoeSizeMm`). The input bounds were already `10..500`.
- Registry: user section in `ERROR_CODES.md`; tracker row in `ERROR_HANDLING_DESIGN.md`; `CLIENT-ERR-3` flow list updated with the final codes.

**Tests:**
- Spock: `UserServiceImplSpec`, `UserPreferenceServiceImplSpec`, `UserFriendServiceImplSpec` assert `errorCode`/`errorParams` beside each `message`, the 409 exception types, and the coordinate cases per code. `:modules:user:user-impl:test`: 185 specs, 0 failures.
- IT: new `server/.../integration/UserErrorCodesIntegrationTest` (21 tests, real MockMvc + H2): profile ownership 403, height/weight/shoe-size ranges with params, gender with `allowed`, unknown language, wrong current password, short search keyword, self friend request, receiver 404, already friends / already pending / not pending (accept, decline, cancel) / not friends as 409, request-not-found 404, a deactivated caller on profile, password and preferences (404, un-coded), and a shoe-size millimetre write-and-read round trip. `UserLookupAccessIntegrationTest` updated for the renamed field; `schema.sql` renamed the column.
- Full `:server:test`: 401 tests, 0 failures. A first full run had 6 failures in `SessionEventsConsumerIntegrationTest` (AMQP `IOException` connecting to the RabbitMQ Testcontainer while a Playwright run was loading the machine); that class passed 6/6 in isolation and the full re-run was clean, so it was a load flake, not a regression.
- Migration V077 run against real Postgres (a scratch database; the dev database had live connections, so it was not touched): 26 becomes 260, NULL stays NULL, 35 becomes 350, column renamed.
- Client: `tsc -b` clean; scoped Vitest 19 files / 117 passed (AccountSettingsModal, EditProfileModal, ProfileHeader, `features/profile`, locales, App.test).
- **E2E:** scoped `e2e` project, 8 passed (`profile-journey`, `friends-journey`, `error-handling`); the full `e2e` suite was not run (token-saving rule, scoped subset only). `e2e/` only references the field in `fixtures.ts`.
- **Visual-regression expectation:** no baselined surface touched (the shoe-size label only renders inside Account Settings, which no baseline opens, and the fixture value is `null`), so no baseline change is expected; a failing `visual-regression` run on this Windows host would be the noise floor. It was not run.

**Divergences from the design:** none in behavior. Two corrections made along the way: an earlier suspicion of a `privacyLocation` bug in `updatePreferences` was my misreading of two stitched `sed` ranges (the code is correct), and my first draft of the account-lifecycle note described the token window as open, though U12 had since closed it in `JwtAuthenticationFilter`.

**Consumer census result:**
- Friend 400 → 409: the client friend hooks (`useSendFriendRequest`, `useAcceptFriendRequest`, `useDeclineFriendRequest`, `useCancelFriendRequest`, `useUnfriend`) never branch on 400 vs 409, the CLIENT-ERR-1 classifier shows CONFLICT inline, and no MSW handler returns these errors: **compatible as-is**. Mapping codes to copy is **CLIENT-ERR-3** (already filed and updated).
- `shoeSizeCm` to `shoeSizeMm`: backend entity, DTOs, service, specs, `schema.sql`, `UserLookupAccessIntegrationTest` **updated in this change**; client types, draft, modal, tests, stories, fixtures, en/vi locale **updated in this change**; `UserInfoResponse` never carried it; no other module and not the Go chat service reads it.
- DB: `users.shoe_size_cm` is referenced only by the entity, V024, and the test schema. Legacy nonsense rows (over 50 cm) become over 500 mm and are left as is (the check applies on write). The dev database has 3 users with a shoe size, 2 of them over 50.

**Not covered here:** copy for any code (CLIENT-ERR-3); `ReferenceService.requireValidSelection`'s three uncoded 400s (REF-5); `CLAUDE.md`'s stale Account-lifecycle "known gaps" paragraph (U12 has since closed them).

The original ticket text follows unchanged for history; this summary supersedes its audit placeholder.
