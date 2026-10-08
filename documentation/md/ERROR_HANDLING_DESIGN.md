# Error Handling Program: design and phase tracker

**Status:** Planned, tickets filed 2026-10-02 (nothing built yet)
**Origin:** I18N-4 review (`documentation/md/I18N_READINESS.md`). What began as "translate server error text" turned out to be a wider gap, so I18N-4 is now delivered through this program.

## Why

- **Client:** no general error handling. Only the 401 silent-refresh in `client/src/app/apiClient.ts`; one-off `status === 403/404` checks (`useSessionCommentsData`, `usePost`, `useComments`, `useChatConversation`); `main.tsx` is a plain `new QueryClient()` (no `QueryCache`/`MutationCache` handler); no toast; no router `errorElement`; no catch-all route; no not-found/forbidden screen. The same `isAxiosError → data.message → fallback` block is copied into 11 hooks.
- **Backend:** no machine-readable error code. `ApiResponse` is `{success, message, data, timestamp}` and `GlobalExceptionHandler` maps exception type → HTTP status only, so the only way to tell what failed is English prose.
- **Size (main code):** about 231 `throw new *Exception(...)` sites, 102 literal validation messages, 114 `ApiResponse.success/error("...")` literals, 47 throws that interpolate values. No `MessageSource` exists.

## Decisions (2026-10-02)

1. **Error codes + client copy**, not a backend message catalog. The client owns the en/vi text; `message` stays as the English fallback.
2. **Order:** global handling first (Phase A), then per-module audit and code definition (Phase B), then client adaptation (Phase C).
3. **First pass covers the audited modules** listed below; modules outside a ticket keep emitting un-coded errors and are converted as they are touched.
4. **Auth A8 is folded in:** the shared contract moved to common C12; A8 became the auth Phase B audit.
5. Admin editors adopt the shared client classifier but get no Vietnamese copy (CLIENT-I18N-6 decision).

## Contract (owned by C12)

```json
{ "success": false,
  "message": "Email already registered",
  "errorCode": "EMAIL_ALREADY_REGISTERED",
  "errorParams": null,
  "data": null, "timestamp": "..." }
```

- `errorCode` and `errorParams` are nullable and additive; omitting them is always valid.
- Code naming: `<DOMAIN>_<REASON>` upper snake case, registered in `documentation/md/ERROR_CODES.md` (created by C12).
- `errorParams` carries values interpolated into the message (`{min: 50, max: 300}`); Jakarta validation failures arrive as `{fields: {<field>: <code-or-message>}}`.

## Category taxonomy (derived from HTTP status; a code refines it)

| Category | Status | Client treatment (default) |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Existing silent refresh, then `/login` |
| `FORBIDDEN` | 403 | "No access" state (`ResourceUnavailable`), or hide the feature when it is an optional section |
| `NOT_FOUND` / `UNAVAILABLE` | 404 | "No longer exists" state, per CLAUDE.md availability-vs-visibility |
| `VALIDATION` | 400 | Inline field/form message |
| `CONFLICT` | 409 | Inline message (business-rule conflicts that are 400 today are decided in C12) |
| `NETWORK` | no response | "Check your connection", retry |
| `INTERNAL` | 5xx | Generic "something went wrong", retry |

Lookup order on the client (as built in CLIENT-ERR-1): `errors:codes.<CODE>` → the server `message` for `VALIDATION`, `CONFLICT` and `UNAUTHENTICATED` (specific text such as "gender must be one of: MALE, FEMALE" or "Invalid email or password" beats a generic line; English only until a code exists) → the localized category copy (`errors:category.<CATEGORY>`). `FORBIDDEN`, `NOT_FOUND`, `INTERNAL` and `NETWORK` always use the category copy, so a server string like "An unexpected error occurred" never shows in Vietnamese. 404 `NOT_FOUND` covers "unavailable" too (the client cannot tell them apart by status).

## Phases and tracker

Update the matching cell when a ticket closes (each ticket's **On close** line says so). The module backlogs stay the source of truth for status; this table mirrors them.

| Module | Phase A: foundation | Phase B: audit and codes | Phase C: client adaptation |
|---|---|---|---|
| common / client | [C12](../../modules/common/docs/MVP/C12_ERROR_CONTRACT_AND_CATEGORY_TAXONOMY.md) `DONE` · [CLIENT-ERR-1](../../client/docs/MVP/CLIENT-ERR-1_GLOBAL_ERROR_HANDLING.md) `DONE` | n/a | n/a |
| auth | n/a | [A8](../../modules/auth/docs/MVP/A8_STRUCTURED_ERROR_CODES_ON_APIRESPONSE_ERROR.md) `DONE` | [CLIENT-ERR-2](../../client/docs/MVP/CLIENT-ERR-2_AUTH_ERROR_ADAPTATION.md) `DONE` |
| user | n/a | [U21](../../modules/user/user-impl/docs/MVP/U21_ERROR_CODE_AUDIT.md) `DONE` | [CLIENT-ERR-3](../../client/docs/MVP/CLIENT-ERR-3_USER_ERROR_ADAPTATION.md) `DONE` |
| sport | n/a | [A25](../../modules/sport/sport-impl/docs/MVP/A25_ERROR_CODE_AUDIT.md) `DONE` (2026-10-05) | [CLIENT-ERR-4](../../client/docs/MVP/CLIENT-ERR-4_SPORT_ERROR_ADAPTATION.md) `DONE` (2026-10-05) |
| group | n/a | [A11](../../modules/social/group-impl/docs/MVP/A11_ERROR_CODE_AUDIT.md) `DONE` (2026-10-05) | [CLIENT-ERR-5](../../client/docs/MVP/CLIENT-ERR-5_GROUP_ERROR_ADAPTATION.md) `DONE` (2026-10-06) |
| post | n/a | [A18](../../modules/social/post-impl/docs/MVP/A18_ERROR_CODE_AUDIT.md) `DONE` (2026-10-06) | [CLIENT-ERR-6](../../client/docs/MVP/CLIENT-ERR-6_POST_ERROR_ADAPTATION.md) `DONE` (2026-10-06) |
| session | n/a | [SESSION-45](../../modules/session/docs/MVP/SESSION-45_ERROR_CODE_AUDIT.md) `DONE` (2026-10-06) | [CLIENT-ERR-7](../../client/docs/MVP/CLIENT-ERR-7_SESSION_ERROR_ADAPTATION.md) `DONE` (2026-10-07) |
| reference / location / notification | n/a | [REF-5](../../modules/reference/docs/MVP/REF-5_ERROR_CODE_AUDIT.md) `DONE` (2026-10-07) · [LOC-6](../../modules/location/docs/MVP/LOC-6_ERROR_CODE_AUDIT.md) `DONE` (2026-10-07) · [NTF-5](../../modules/notification/docs/MVP/NTF-5_ERROR_CODE_AUDIT.md) `DONE` (2026-10-07) | [CLIENT-ERR-8](../../client/docs/MVP/CLIENT-ERR-8_MISC_ERROR_ADAPTATION.md) `DONE` (2026-10-07) |
| chat (Go service, plain-text errors) | n/a | n/a (no `ApiResponse` envelope) | [CLIENT-ERR-9](../../client/docs/MVP/CLIENT-ERR-9_CHAT_ERROR_ADAPTATION.md) `DONE` (2026-10-08) |

**Order:** C12 → CLIENT-ERR-1 → the B/C pairs in parallel per module (suggested: auth, user, sport, group, post, session, misc). A Phase C ticket depends on CLIENT-ERR-1 and its module's Phase B ticket; `/workon` stops if a dependency has not shipped.

The program is `DONE` when every cell is `DONE`; then set I18N-4 to `BUILT` in `I18N_READINESS.md`.

## Behavior sign-off rule (CLIENT-ERR-1 and Phase C tickets CLIENT-ERR-2..8), added 2026-10-03

Error handling is a product behavior, not only copy, so CLIENT-ERR-1 and each Phase C ticket align it with the user **before** it is implemented. The ticket's Phase 3 plan must include a per-flow table: for each endpoint or screen and each error (code or category), **where the message shows** (inline field, banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard input, retry or refetch, roll back an optimistic update, keep or close a modal, redirect, not-found/forbidden screen). It starts from the Phase B audit table's "Client behavior" column and the category defaults above and lists every departure from them. Implementation starts only after the user approves the table; the approved table goes into the ticket's implementation summary. CLIENT-ERR-1 applies the rule to the category defaults themselves (the table above plus the toast-versus-inline decision), and the approved defaults are the baseline every Phase C table departs from.

## Out of scope

A backend message catalog / `MessageSource`; translating success messages (`ApiResponse.success("...")`); admin Vietnamese copy; retry/backoff policy changes; the deactivated-user token gaps (U12).

## Related

`documentation/md/I18N_READINESS.md` (I18N-4, I18N-10), `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` (not-found vs forbidden), CLAUDE.md § API Change Discipline.
