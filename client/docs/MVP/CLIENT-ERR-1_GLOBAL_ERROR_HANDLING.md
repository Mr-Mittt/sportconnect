# CLIENT-ERR-1 · Global API error handling: classifier, `errors` i18n namespace, not-found/forbidden screens, global mutation handler

**Status:** `TODO`
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

**Out of scope:** Per-module code copy and page-specific states (CLIENT-ERR-2..8); retry/backoff policy changes; admin vi copy.

**Tests:** Vitest for the classifier, screens and handler; Storybook stories for each screen/state; scoped e2e with MSW 403/404/500/offline cases; update `client/docs/E2E_OVERVIEW.md`; baselines for any new baselined surface via `update-baselines`.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).
