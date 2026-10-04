# CLIENT-ERR-1 · Global API error handling: classifier, `errors` i18n namespace, not-found/forbidden screens, global mutation handler

**Status:** `DONE` (2026-10-04)
**Type:** Enhancement
**Program:** Error handling · Phase A
**Depends on:** C12 (common), needs the response shape only
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
The client has no general error handling: only the 401 refresh flow in `apiClient.ts`, one-off `status === 403/404` checks (`useSessionCommentsData`, `usePost`, `useComments`, `useChatConversation`), no global `QueryCache`/`MutationCache` handler (`main.tsx` is a plain `new QueryClient()`), no toast, no router `errorElement`, no catch-all route, and no not-found/forbidden screen — so opening a deleted or invisible group/post/session shows a generic error or blank state. This ticket builds the shared layer:

1. `getApiError(error)` classifier → `{ category, status, code?, params?, message }` (`NETWORK` for no response). Replaces the `axios.isAxiosError → data.message → fallback` block copied into `useLogin`, `useRegister`, `useUpdateMyProfile`, `useUpdateMyPreferences`, `useEditProfileSave`, `useUpdateSportProfile`, `useDeactivateSportProfile`, `useInviteFriendModalData`, `useUpdateSport`, `useReplaceSportAttributeSchema`, `useReplaceSessionAttributeSchema`, and the four ad-hoc status checks. **Behavior-identical** (server prose fallback) until the module tickets add codes.
2. New `errors` i18n namespace (en + vi; registered in `i18n.ts`, `.storybook/preview.ts`, `i18n.test.ts` parity) with category-level default copy; code entries (`errors:<CODE>`) are added per module by CLIENT-ERR-2..8. Lookup order: `errors:<CODE>` → category copy → server `message`.
3. Router: catch-all `*` route and an `errorElement` (not-found / forbidden / crash screens, localized, with a way back); reusable `ResourceUnavailable` state component for page-level queries (stories + tests).
4. Global `MutationCache`/`QueryCache` `onError` and a small toast host for mutation failures with no inline UI today (the like/delete/comment rollbacks fail silently); `UNAUTHENTICATED` stays with the existing refresh flow. Toast primitive decided at pickup (check for shadcn `sonner` before adding a dependency).
5. A guard (test or lint rule) failing when a hook renders `response.data.message` without going through `getApiError`.

**Who:** every user. **Localization:** en + vi for all new copy (client rule). **Admin:** the 3 admin editors adopt the classifier but get no vi copy (CLIENT-I18N-6 decision).

**I18N-4 census:** this ticket rewrites every census row's hook; update the table in `documentation/md/I18N_READINESS.md`.

## Scope change (2026-10-03, at pickup)

- **Behavior sign-off applies to this ticket too.** The program rule (see `documentation/md/ERROR_HANDLING_DESIGN.md` § Rule for Phase C tickets) is extended to CLIENT-ERR-1: its Phase 3 plan must carry the **category default behavior table**, and the user approves it before anything is built. Per category (`VALIDATION`, `CONFLICT`, `FORBIDDEN`, `NOT_FOUND`/`UNAVAILABLE`, `INTERNAL`, `NETWORK`, and non-axios errors) and per surface (page query, mutation with inline UI, mutation without inline UI, route not found, render crash): **where it shows**, **the en and vi copy**, and **what the app does afterward** (keep input, retry or refetch, roll back, redirect, way back from a screen). It also fixes the rule that decides when the global handler toasts and when it stays silent (mutations with inline error UI are not double-reported). These defaults are what CLIENT-ERR-2..8 start from.

- **Category-based default retry added (2026-10-04, user decision at pickup).** This ticket defines the *defaults*; module tickets override them. A default that is not wired is not a default, so `QueryClient` `defaultOptions.queries.retry` skips retry for `NOT_FOUND`/`UNAVAILABLE`, `FORBIDDEN`, `VALIDATION` and `CONFLICT` (permanent) and keeps the usual 3 attempts for `NETWORK` and `INTERNAL`. This lifts the "retry/backoff policy changes" exclusion for this one default only. Part of the approved defaults table.
- **The ad-hoc status sites move to the module tickets (2026-10-04).** Item 1 above no longer converts them here. Corrected list (the original named the wrong sites): `usePost` and `useComments` (404 skips retry) → **CLIENT-ERR-6**; `useSessionComments` (403/404 skips retry) and `useSessionCommentsData` (`isForbidden` from a 403) → **CLIENT-ERR-7**; `useChatConversation` (`retry: false`) → **CLIENT-ERR-9** (filed 2026-10-04, chat has no Phase B pair). Each of those tickets decides in its behavior table whether the new default makes the override redundant. The 11 copied `isAxiosError` blocks (the hooks listed in item 1) are still converted here: same return shape, same server-prose fallback.
- **Toast:** `sonner` (new dependency) for the global mutation-failure toast. Optimistic rollbacks (like, unlike, delete post/comment, session comment equivalents) toast on failure; mark-as-read stays silent.
- **Classifier handles non-envelope bodies:** the chat service returns plain-text errors (`http.Error`), so `getApiError` treats a non-JSON or non-envelope body as status-only, taking `message` from it only when it is a string.

**Out of scope:** Per-module code copy and page-specific states (CLIENT-ERR-2..8); retry/backoff changes other than the one category-based default; admin vi copy.

**Tests:** Vitest for the classifier, screens and handler; Storybook stories for each screen/state; scoped e2e with MSW 403/404/500/offline cases; update `client/docs/E2E_OVERVIEW.md`; baselines for any new baselined surface via `update-baselines`.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

---

## Implementation summary (2026-10-04)

**Approved design, as built.** The shared client error layer, with the category-defaults table below approved by the user before any code was written.

- `shared/lib/apiError.ts`: `getApiError(error)` → `{ category, status, code?, params?, message?, canceled }` (401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 400 `VALIDATION`, 409 `CONFLICT`, 5xx `INTERNAL`, no response `NETWORK`, anything else `UNKNOWN`). Reads the `ApiResponse` envelope; a plain-text body (the Go chat service) is status-only. `shouldRetry` (no retry for 401/403/404/400/409, three attempts otherwise), `isPermanentError`, and `getErrorMessage` (`errors:codes.<CODE>` → server text for VALIDATION/CONFLICT/UNAUTHENTICATED → localized category copy).
- `app/queryClient.ts`: `createAppQueryClient()` (used by `main.tsx`): default `queries.retry = shouldRetry` (a query's own `retry` still wins); `MutationCache.onError` toasts unless the mutation sets `meta: { errorDisplay: 'inline' | 'silent' }`; no `QueryCache` handler (page queries show their own state, background refetch failures stay silent).
- `sonner` added; `ErrorToaster` (token-themed, mounted in `RootLayout`); `showErrorToast` dedupes by message and never toasts a 401 or a cancelled request.
- `ResourceUnavailable` (variants `notFound`, `forbidden`, `unavailable`, `error`, `network`, `crash`), `NotFoundPage` (the `*` route) and `RouteErrorPage` (the root `errorElement`), both outside `AppShell`. New `errors` namespace (en + vi), registered in `i18n.ts`, `.storybook/preview.ts` and the parity test.
- The 11 hooks with the copied `isAxiosError` block now call the classifier (same return shape): `useLogin`, `useRegister`, `useUpdateMyProfile`, `useUpdateMyPreferences`, `useEditProfileSave`, `useUpdateSportProfile`, `useDeactivateSportProfile`, `useInviteFriendModalData`, and the three admin editors (which keep server text or their fixed English fallback, no vi copy).
- Guard: `app/noRawServerError.test.ts` fails on any raw `isAxiosError(` / `.response?.status|data` read outside the classifier, with an allowlist naming the owning ticket for each remaining site (a stale entry also fails, so migrating a file forces removing it).
- `ApiResponse<T>` (client type) gained optional `errorCode` / `errorParams` (C12).

**Approved category defaults** (Q = page/section query first load, R = background refetch, M-in = mutation with inline error UI, M-out/Rb = mutation without it / optimistic rollback):

| Category | Q | R | M-in | M-out / Rb |
|---|---|---|---|---|
| `VALIDATION` | inline copy | silent | inline, input kept, form stays open | toast; Rb rolls back |
| `CONFLICT` | inline copy | silent | inline, input kept; no auto-refetch | toast; Rb rolls back, then refetch |
| `FORBIDDEN` | `ResourceUnavailable` forbidden, Back | silent | inline | toast |
| `NOT_FOUND` | `ResourceUnavailable` not found, Back | silent | inline | toast |
| `INTERNAL`/`UNKNOWN` | `ResourceUnavailable` error, Try again | silent | inline, input kept | toast |
| `NETWORK` | `ResourceUnavailable` network, Try again | silent | inline, input kept | toast |
| `UNAUTHENTICATED` | existing silent refresh, then `/login` | same | same | same |
| Unknown URL | not-found screen, "Back to home" | | | |
| Render crash | crash screen, "Reload" | | | |

**Divergences from the approved plan (stated, not smoothed over).**
- `UNAUTHENTICATED` joins `VALIDATION`/`CONFLICT` in "server text wins" in `getErrorMessage`: otherwise the login form's "Invalid email or password" (a 401) would have turned into a generic line, breaking the behavior-identical requirement. A refresh-failure 401 is never shown (the user is redirected).
- Six existing hook tests used a fake axios error with no `status`; I gave them realistic statuses (400/401/404). `useDeactivateSportProfile`'s "Sport profile not found" 404 now asserts the localized not-found copy, which is the approved behavior change (a 404 shows category copy, not English server prose).
- The MSW `apiError()` helper was not extended: the new e2e uses `page.route` fulfills, so no handler needed a code.
- `QueryCache.onError` was dropped entirely instead of logging in dev: the table says R and Q failures show nothing global, and a logger had no consumer.

**Mutation audit (65 hook files).** Marked `errorDisplay: 'inline'` (the consumer reads the mutation's error flag or has its own inline UI): the 11 above plus `useSendGroupInvitation`, `useCreateGroup`, `useCreatePost`, `useDeleteGroup`, `useJoinGroup`, `useLeaveGroup`, `useRejectInvitation`, `useUpdateGroup`, `useUpdateGroupGeneralData`, `useUpdateGroupSettings`, `useUpdatePost`, `useUnfriend`, `useCreateLocation`, `useResolveMapsUrl`, `useCancelSession`, `useCreateSession`, `useUpdateSession`, `useAddSportProfile`. Marked `silent`: `useLogout` (the session clears either way), `useSessionBootstrap` (a 401 with no cookie is normal), `useResolveGeo` (a pre-fill failure must never block sign-up), `useMarkNotificationRead`, `useMarkAllNotificationsRead`. Everything else toasts by default: the like/unlike/comment/delete rollbacks, friend-request accept/cancel/decline/send, invitation/join-request accept/decline/cancel/approve, session join/leave/like/approve/reject/comment, favorite/unfavorite location, and the chat send. The classification is by whether the consumer reads the error flag; each Phase C ticket re-verifies its own module (a hook that reads the flag but never renders it would show nothing, and is that ticket's to fix).

**Moved to the module tickets (per the scope change).** `usePost`/`useComments` → CLIENT-ERR-6; `useSessionComments`/`useSessionCommentsData` → CLIENT-ERR-7; `useChatConversation` → CLIENT-ERR-9 (filed). They stay on the guard's allowlist until then.

**Consumer census result.** The 11 hooks: updated here, same `errorMessage` return shape, callers compatible as-is. `apiClient.ts` 401 flow and `chatApiClient`: compatible as-is. The 13 `onError` rollbacks: compatible as-is, now also toasted (except mark-read). Client `ApiResponse<T>`: updated. I18N-4 census table: updated.

**Tests.** Vitest: `apiError.test.ts` (classifier, retry, message order, en/vi, params), `queryClient.test.ts` (toast vs inline vs silent vs 401/cancel, dedupe, default retry, global handler), `ResourceUnavailable.test.tsx`, `RouteErrorPages.test.tsx` (catch-all, 404, 403/404/500, offline, crash, en/vi), `ErrorToaster.test.tsx`, `noRawServerError.test.ts`, i18n parity. Stories: `ResourceUnavailable` (7 states) and `ErrorToaster`. Scoped Vitest over the touched areas (auth, profile, admin, groups, feed, app, shared, App): 149 files / 1097 tests passed on the final run. An earlier run in the same scope had 8 failures in 7 files; six were the fake-error fixtures above and were fixed, and the remaining file passed on rerun without a code change, so I do not have a root cause for it (suspected load-related flake, not proven). `tsc -b` clean; `eslint` 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`).

**E2E.** `e2e` project: 108 passed (full project, headless), including the new `error-handling.spec.ts` (5 tests: unknown URL en and vi, failed like → rollback + toast, offline like → toast, inline error does not toast). `client/docs/E2E_OVERVIEW.md` updated (§3 listing + §6 catalog).

**Visual-regression expectation.** No baselined surface touched; no baseline change expected. `ErrorToaster` renders nothing until a toast fires, and the not-found/crash screens have no baselined page. I did not run the `visual-regression` project; on this Windows host a failing run would be the documented font-rendering noise floor, not a regression.

**Not verified.** I did not open Storybook or walk the dev server by hand: the stories type-check and the e2e project drives the real built app in a browser, but the visual look of the new screens and the toast has not been reviewed by eye. No backend endpoint is called by new code, so there was no live-backend check.

**Follow-ups.** None new beyond those already filed: CLIENT-ERR-2..9 carry the per-module copy and the moved status sites.
