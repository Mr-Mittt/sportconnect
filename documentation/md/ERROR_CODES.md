# Error codes registry

**Owner:** `modules/common` (C12). Every module adds its codes here when it converts throw sites (the Phase B audits in `ERROR_HANDLING_DESIGN.md`). Program design: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## Wire contract

```json
{ "success": false, "message": "Widget must be at least 5",
  "errorCode": "WIDGET_TOO_SMALL", "errorParams": { "min": 5 },
  "data": null, "timestamp": "..." }
```

- `errorCode` and `errorParams` are omitted when null (success responses and un-coded errors serialize exactly as before C12).
- `message` is always the English fallback. The client looks up `errors:<CODE>`, then the category copy, then `message`.
- `data` is always null on an error. (Validation used to put its field map in `data`; C12 moved it to `errorParams.fields`. The only reader was one Spock assertion, updated in C12.)
- `errorParams` holds the values interpolated into `message`, so the client can interpolate them into its own copy. An empty map is sent as omitted.

## Category (derived from the HTTP status; never sent on the wire)

| Status | Category | Notes |
|---|---|---|
| 401 | `UNAUTHENTICATED` | **Status-only, no code.** The client reacts to the 401 itself (silent refresh, then `/login`). The 401 is written by `JwtAuthenticationEntryPoint` in the security filter chain, outside `GlobalExceptionHandler`. |
| 403 | `FORBIDDEN` | Visibility failed: the resource exists but the caller may not see it. |
| 404 | `NOT_FOUND` / `UNAVAILABLE` | Availability failed (soft-deleted, parent gone). See CLAUDE.md § Resource access. |
| 400 | `VALIDATION` | Malformed or invalid input. |
| 409 | `CONFLICT` | Well-formed request that clashes with current state. Thrown as `ConflictException`. |
| 5xx | `INTERNAL` | Unexpected failure. |
| no response | `NETWORK` | Client-side only. |

## Naming rule

`<DOMAIN>_<REASON>`, upper snake case, stable once shipped (the client keys its copy on it): `EMAIL_ALREADY_REGISTERED`, `GROUP_NOT_FOUND`. A code names the *reason*, not the HTTP status. Params are named after what the message interpolates.

## How a module adds a code

1. Pick the exception that already gives the right status (`BadRequestException`, `ForbiddenException`, `NotFoundException`/`ResourceNotFoundException`, `ConflictException`, `UnauthorizedException`).
2. Throw the coded constructor: `new BadRequestException("WIDGET_TOO_SMALL", "Widget must be at least 5", Map.of("min", 5))`. For `ResourceNotFoundException` use `ResourceNotFoundException.coded(code, message, params)`; its constructor form would clash with the legacy `(String, String, Object)` one.
3. Keep `message` as the English text it was before.
4. Add a row below, with the module and the status.
5. Moving a site from 400 to 409 is a contract change: do the consumer census in that module's ticket.

## Registry

### common (framework-level, emitted by `GlobalExceptionHandler`)

| Code | Status | Params | When |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | `{fields: {<field>: <message>}}` | A `@Valid` request body failed bean validation. |
| `MISSING_PARAMETER` | 400 | `{param}` | A required `@RequestParam` was omitted. |
| `MALFORMED_REQUEST` | 400 | none | Unreadable body or an un-bindable path variable/parameter type. |
| `ACCESS_DENIED` | 403 | none | Spring Security denied the call (`@PreAuthorize`). |
| `ENDPOINT_NOT_FOUND` | 404 | none | No handler for the path. |
| `METHOD_NOT_ALLOWED` | 405 | none | Wrong HTTP method. |
| `NOT_ACCEPTABLE` | 406 | none | Unsatisfiable `Accept`. |
| `REQUEST_TOO_LARGE` | 413 | none | Body too large. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | none | Wrong `Content-Type`. |
| `SERVICE_UNAVAILABLE` | 503 | none | Framework-reported unavailability. |
| `INTERNAL_ERROR` | 5xx | none | Unhandled exception (catch-all) and other framework 5xx. The real cause is only in the server log. |

### Module codes

#### auth (A8, `AuthServiceImpl`, `AuthController`, `EmailVerificationService`, `PasswordResetService`)

| Code | Status | Params | When |
|---|---|---|---|
| `EMAIL_ALREADY_REGISTERED` | 409 | none | `POST /api/auth/register` with an email that already exists (moved from 400 by A8). |
| `INVALID_CREDENTIALS` | 401 | none | `POST /api/auth/login`: wrong password, unknown email, or a deactivated account (indistinguishable by design). |
| `REFRESH_TOKEN_MISSING` | 401 | none | `POST /api/auth/refresh` without the refresh cookie. |
| `REFRESH_TOKEN_INVALID` | 401 | none | `POST /api/auth/refresh` with a token that is not in the store. |
| `REFRESH_TOKEN_EXPIRED_OR_REVOKED` | 401 | none | `POST /api/auth/refresh` with an expired or revoked token (what a deactivated user normally gets). |
| `ACCOUNT_DEACTIVATED` | 401 | none | Refresh for a deactivated user. **Currently unreachable**: the user lookup throws a 404 first (ticket A9). |
| `VERIFICATION_TOKEN_INVALID` | 404 | none | `POST /api/auth/verify-email` with an unknown token. |
| `EMAIL_ALREADY_VERIFIED` | 400 | none | `POST /api/auth/verify-email` with an already-used token. |
| `VERIFICATION_TOKEN_EXPIRED` | 400 | none | `POST /api/auth/verify-email` with an expired token. |
| `RESET_TOKEN_INVALID` | 404 | none | `POST /api/auth/reset-password` with an unknown token. |
| `RESET_TOKEN_USED` | 400 | none | `POST /api/auth/reset-password` with an already-used token. |
| `RESET_TOKEN_EXPIRED` | 400 | none | `POST /api/auth/reset-password` with an expired token. |

The 401 written by `JwtAuthenticationEntryPoint` (missing/invalid access token) deliberately has **no code** (C12 decision; A8 left its text unchanged).

Still to come: each remaining Phase B ticket (U21, A25, A11, A18, SESSION-45, REF-5, LOC-6, NTF-5) adds its section here.
