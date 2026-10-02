# C12 · Error contract: `errorCode` / `errorParams` on `ApiResponse` + error category taxonomy

**Status:** `TODO`
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

**Out of scope:** Converting any module's throw sites to coded exceptions (the per-module Phase B tickets); a backend message catalog / `MessageSource`; translating success messages; the client side (CLIENT-ERR-1).

**Tests:** Spock unit coverage for `GlobalExceptionHandler` (coded and un-coded paths, validation `fields`); a `server` IT (`MockMvc` through real wiring) proving a coded exception reaches the wire with `errorCode`/`errorParams`/status, and an un-coded one still returns `message` only.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).
