# C12 · Error contract: `errorCode` / `errorParams` on `ApiResponse` + error category taxonomy

**Status:** `DONE` (2026-10-02)
**Type:** Enhancement
**Program:** Error handling · Phase A
**Depends on:** none
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
`ApiResponse` today is `{success, message, data, timestamp}` and `GlobalExceptionHandler` maps exception type → HTTP status only, so a client can only tell *what went wrong* by reading English prose. This ticket adds the machine-readable half, once, in `common`:

- `ApiResponse` gains nullable `errorCode` (String, `<DOMAIN>_<REASON>`, e.g. `EMAIL_ALREADY_REGISTERED`) and nullable `errorParams` (`Map<String,Object>`, values interpolated into the message such as `{min: 50, max: 300}`). `message` stays as the English fallback, so old clients and un-coded sites are unchanged.
- The shared exceptions (`BadRequestException`, `ForbiddenException`, `NotFoundException`/`ResourceNotFoundException`, `UnauthorizedException`) get an additive `(code, message, params)` constructor; `GlobalExceptionHandler` copies code/params onto the response.
- `MethodArgumentNotValidException` (Jakarta validation) is handled once: status 400 with `errorParams = {fields: {<field>: <code-or-message>}}`, so no module re-solves it.
- **Category taxonomy** — the fixed set the client switches on, derived from HTTP status (401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`/`UNAVAILABLE` per the availability-vs-visibility rule in CLAUDE.md, 400 `VALIDATION`, 409 `CONFLICT`, 5xx `INTERNAL`); a specific `errorCode` refines it. Confirm at pickup whether any business-rule failure that is a 400 today should become 409.
- New `documentation/md/ERROR_CODES.md` registry (code, category, status, params, owning module) and the naming rule.

**Who:** every API consumer; the client reads it via CLIENT-ERR-1. **Entry point:** any error response through `GlobalExceptionHandler`.

## Consumer census (CLAUDE.md § API Change Discipline)
`ApiResponse` is the shared envelope for every controller; a new nullable field is additive. Do the actual census at pickup anyway: grep every `ApiResponse.error(...)` and `ApiResponse` constructor/builder call across all modules, the client's `ApiResponse` type mirror and MSW fixtures (`client/e2e/mocks`), and any test asserting the full error JSON. This also **subsumes the contract half of auth A8** (A8 is re-scoped to the auth audit and depends on this ticket).

## Scope changes (2026-10-02, at pickup)

- **Validation `data` dropped.** `MethodArgumentNotValidException` no longer returns the `{field: message}` map in `data`; it moves to `errorParams.fields` and `data` is `null` on every error. The census must list every reader of that `data` map (client forms, MSW fixtures, ITs/Spock asserting `$.data.<field>`), and each is updated in this change or deferred with a filed ticket. Anything found is also noted here so a later cleanup knows what moved.
- **`ConflictException` (409) added** to `common` with its handler and a `(code, message, params)` constructor. No existing `BadRequestException` site is converted here: a 400 to 409 change is a contract change that belongs in each module's Phase B census.

**Out of scope:** Converting any module's throw sites to coded exceptions (the per-module Phase B tickets); a backend message catalog / `MessageSource`; translating success messages; the client side (CLIENT-ERR-1).

**Tests:** Spock unit coverage for `GlobalExceptionHandler` (coded and un-coded paths, validation `fields`); a `server` IT (`MockMvc` through real wiring) proving a coded exception reaches the wire with `errorCode`/`errorParams`/status, and an un-coded one still returns `message` only.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).


---

## Implementation summary (2026-10-02)

**Approved design, as built.** All changes are in `modules/common` plus docs.

- `ApiResponse`: new `errorCode` (String) and `errorParams` (`Map<String,Object>`), both `@JsonInclude(NON_NULL)` so success responses and un-coded errors serialize byte-for-byte as before. New `error(code, message, params)` factory (null or empty params are omitted). Existing factories untouched.
- `CodedException` interface (`getErrorCode()`, `getErrorParams()`); implemented by `BadRequestException`, `ForbiddenException`, `UnauthorizedException`, `NotFoundException`, `ResourceNotFoundException` and the new `ConflictException` (409). Each gets a `(code, message, params)` constructor; the message-only constructors are unchanged.
- `GlobalExceptionHandler`: coded exceptions copy code/params onto the response; new 409 handler. Validation returns `VALIDATION_FAILED` with `errorParams.fields` and **`data` null**. Framework errors get fixed codes (`MALFORMED_REQUEST`, `ENDPOINT_NOT_FOUND`, `METHOD_NOT_ALLOWED`, `NOT_ACCEPTABLE`, `REQUEST_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `SERVICE_UNAVAILABLE`), `MISSING_PARAMETER` carries `{param}`, `AccessDeniedException` is `ACCESS_DENIED`, and the catch-all is `INTERNAL_ERROR` (still the fixed message, real cause only in the log).
- `documentation/md/ERROR_CODES.md`: wire contract, category table, naming rule, how-to, registry of the common codes.

**Divergence from the plan.** `ResourceNotFoundException` has no `(code, message, params)` constructor; it has a static factory `ResourceNotFoundException.coded(...)` instead. The legacy `(String, String, Object)` constructor would have been ambiguous with a `(String, String, Map)` one (a `null` third argument silently picked the wrong overload; the Spock spec hit it).

**Decisions made at pickup (scope changes above).** `data` dropped on validation errors; `ConflictException` added with no existing site converted. Also decided: **no `errorCode` for 401** (the client's refresh-then-`/login` flow keys off the status only), so `JwtAuthenticationEntryPoint` is untouched; A8 got a note about the Spring text it puts in `message`.

**Consumer census result.**

| Consumer | Status |
|---|---|
| All `ApiResponse.success/error` callers (no one outside `common` constructs it) | compatible as-is |
| `GlobalExceptionHandlerSpec` asserting `$.data.name` | updated in this change (the only reader of the validation `data` map) |
| `GlobalExceptionMappingIntegrationTest` | compatible; extended with the new codes |
| Client `ApiResponse<T>` type and the 11 hook error blocks | compatible as-is (no reader of an error body's `data`); CLIENT-ERR-1 adopts the new fields |
| Client MSW `apiError(...)` fixtures | compatible as-is |

**Tests.**
- `GlobalExceptionHandlerSpec` (all green): coded and un-coded paths for each exception type, 409 coded and un-coded, empty params omitted, validation `fields` with no `data`, `MISSING_PARAMETER` params, framework codes, `INTERNAL_ERROR`, success response gains no new keys.
- IT: `GlobalExceptionMappingIntegrationTest` extended through real wiring (framework codes plus a real `@Valid` endpoint, `POST /api/auth/login` with `{}`, asserting `VALIDATION_FAILED` and `errorParams.fields`). `:server:test` full run green.
- Not covered by an IT: a *coded domain exception* reaching the wire through real wiring. No production throw site is coded yet; the Spock spec proves the handler path and the first Phase B ticket (A8) adds the first real IT for a coded site.

**IT changes report.** Updated `server/.../integration/GlobalExceptionMappingIntegrationTest.java` (new `errorCode` assertions on the 404/405/415/400 cases, new `validationFailure_carriesFieldsInErrorParams_andNoData`). Updated `modules/common/.../GlobalExceptionHandlerSpec.groovy` (unit, listed above). No schema changes.

**Follow-ups.** None new to file: CLIENT-ERR-1 already covers the client classifier, and A8 now carries the 401 message observation. Tracker row in `ERROR_HANDLING_DESIGN.md` set to `DONE`.
