# Swagger UI — authorize with email + password instead of a raw bearer token

**Status:** `DONE` (2026-07-14) · **Type:** Tooling (dev experience) — not a backlog ticket, requested
directly.
**Scope:** `server/src/main/java/com/sportconnect/config/OpenApiConfig.java`,
new `modules/auth/auth-impl/src/main/java/com/sportconnect/auth/controller/
SwaggerOAuth2TokenController.java` + `OAuth2TokenResponse.java`.

## Motivation

Swagger UI's Authorize dialog previously used a plain HTTP-bearer scheme (`bearerAuth`) — using
any protected endpoint meant calling `POST /api/auth/login` manually, copying `accessToken` out of
the JSON response, then pasting it into the Authorize box. Asked to make the Authorize dialog
itself accept email + password directly instead.

## Why this needs a backend adapter, not just a Swagger config change

Swagger UI has no built-in "call this endpoint, extract a field, use it as the bearer token" flow
— that's a Postman/Insomnia pre-request-script feature, not part of the OpenAPI/Swagger-UI spec.
The closest built-in mechanism that lets a user type credentials directly into the Authorize
dialog is OAuth2's **password grant** flow — but that flow POSTs
`grant_type=password&username=&password=` as `application/x-www-form-urlencoded` to a `tokenUrl`,
and expects the standard `{access_token, token_type, expires_in}` JSON shape back. The real
`/api/auth/login` endpoint expects JSON `{email, password}` (confirmed via `LoginRequest.java`)
and returns the app's own `ApiResponse<AuthResponse>` envelope with camelCase fields — neither the
request nor the response shape matches, so pointing the OAuth2 flow directly at `/api/auth/login`
would not work without a translation layer in between.

## Design

- **`OpenApiConfig.java`** — replaced the `bearerAuth` HTTP-bearer `SecurityScheme` with an
  `oauth2Password` OAuth2 scheme (`flows.password.tokenUrl = /api/auth/oauth-token`, empty
  `Scopes()` — this API has no scope concept). Applied as the same API-wide default
  `SecurityRequirement` as before; the existing `@SecurityRequirements()` per-endpoint opt-out
  convention (for public endpoints) is unaffected — it doesn't reference the scheme by name.
- **`SwaggerOAuth2TokenController`** (new, `auth-impl`) — the translation layer. Accepts the
  OAuth2 form fields (`grant_type` accepted but not validated — this endpoint has exactly one
  caller, Swagger UI's own dialog), builds a `LoginRequest` from `username`/`password`, and calls
  the **exact same** `AuthService.login()` the real `/api/auth/login` endpoint uses — so credential
  validation, account-active checks, etc. all behave identically to a normal login. Returns
  `OAuth2TokenResponse` (`access_token`/`token_type`/`expires_in`, snake_case via `@JsonProperty`
  — the OAuth2 wire format, not this codebase's usual camelCase convention).
  - **Unit conversion caught during implementation:** `AuthResponse.getExpiresIn()` is
    milliseconds (`app.jwt.expiration` in `application.yml`), but OAuth2's `expires_in` is defined
    in whole seconds (RFC 6749 §4.2.2) — divided by 1000 before returning.
  - `@Hidden` (springdoc) — excluded from the rendered endpoint list. Nothing should ever call this
    except Swagger UI's own Authorize dialog; it's plumbing for that button, not a real API surface.
  - Already covered by `SecurityConfig`'s existing `/api/auth/**` permitAll rule — no security
    config change needed.

## What is unaffected

The real API's own auth mechanism — `JwtAuthenticationFilter`, bearer tokens required on every
other protected endpoint, the real `/api/auth/login` contract the actual client uses — is
completely unchanged. This only changes how Swagger UI itself acquires a token for its own
"Try it out" calls.

## Verification

Live-verified against a running backend (not just read the code):
- `POST /api/auth/oauth-token` with form-encoded `grant_type=password&username=<email>&password=<pw>`
  returns `{"access_token": "...", "token_type": "bearer", "expires_in": 3600}` for a real
  registered user.
- That `access_token` works as a real bearer token against a real protected endpoint
  (`GET /api/posts/feed`).
- `GET /api-docs` confirms the `oauth2Password` scheme is registered with the correct `tokenUrl`,
  and that `/api/auth/oauth-token` does **not** appear in the rendered `paths` list (the `@Hidden`
  annotation works as intended) while `/api/auth/login` still does.
- Drove the actual Swagger UI in a real browser (Playwright): opened the Authorize dialog,
  confirmed it renders `username`/`password` fields (not a token field), filled in a real
  account's credentials, clicked Authorize, and confirmed the dialog shows "Authorized" —
  ready to bearer-auth every subsequent "Try it out" call automatically.
- `:modules:auth:auth-impl:test` and `:server:test` both green (no existing test touches
  `OpenApiConfig` or adds coverage for this controller — it's a dev-tooling adapter with a single
  caller, not app logic with a testable contract worth asserting against).

## Out of scope

- Any real OAuth2 server/client integration — this app has none, and none is planned. The scheme
  name and flow are borrowed purely because they're the shape Swagger UI's Authorize dialog
  understands.
- `client_id`/`client_secret` fields Swagger UI renders alongside username/password (standard for
  the OAuth2 password flow) — left blank/unused; the adapter endpoint ignores them entirely.
