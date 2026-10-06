# CLIENT-ERR-6 · Client error adaptation: post

**Status:** `DONE` (2026-10-06)
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, A18 (post)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **post**, after A18 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** `/posts/:postId` and feed: post not found/forbidden (`usePost`, `useComments`), comment/like/delete failures (replace silent rollbacks with the toast), create-post failures.

**Localization:** en + vi for every new string (client rule).

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Carried over from CLIENT-ERR-1 (2026-10-04):** `usePost` and `useComments` skip retry on a 404 by hand. CLIENT-ERR-1 ships a category-based default retry; decide in this ticket's behavior table whether it makes each override redundant (remove it) or it must stay.

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

**Carried over from post A18 (2026-10-06):** the final codes are the `ERROR_CODES.md` § post registry (22 codes) and the per-flow audit table in `modules/social/post-impl/docs/MVP/A18_ERROR_CODE_AUDIT.md`. A18 moved statuses (permission failures 400 -> 403, already/not liked 400 -> 409, second broadcast 400 -> 409), so build the behavior table from the audit table, not the old messages. Also update the MSW like handlers (`client/e2e/mocks/handlers/sessions.ts` ~1033/1053, and feed handlers) to return 409 with the new codes; they still return 400.

**Scope change (2026-10-06, at pickup):** the user decided a 404 must never retry, and asked to make that the app default if it is not already, and to check CLIENT-ERR-1 to 5 for any retry on a 404. **Finding:** the default is already in place. `shouldRetry` (`shared/lib/apiError.ts`, installed by `createAppQueryClient`) skips retry for `NOT_FOUND` (and 401/403/400/409). CLIENT-ERR-2 to 5 added no `retry` override. The only per-query overrides in `src` are `usePost` and `useComments` (this ticket: 404 only, strictly weaker than the default, so **removed here**), `useSessionComments` (403/404, redundant, CLIENT-ERR-7's), and `useChatConversation` (`retry: false`, CLIENT-ERR-9's). No code change to the default is needed; add a guard test that a 404 is not retried by the default.

## Implementation summary (2026-10-06)

**Approved behavior table** (user sign-off 2026-10-06, after two rounds: the user changed "post gone / forbidden" from an inline line to an error pop-up, and made the comment-not-found codes silent). "Pop-up" is the shared `PostActionErrorDialog`: one message and a "Got it" button.

| Flow | Error | Where it shows | After |
|---|---|---|---|
| Open the comments modal (a link, a feed card) | `POST_NOT_FOUND`, `POST_FORBIDDEN` on the post or thread load | Pop-up only; the modal is not shown | "Got it" closes the pop-up, the page returns to the feed and the feed refetches |
| Comments modal already open | `POST_NOT_FOUND`, `POST_FORBIDDEN` on add comment, reply, comment like or unlike, or a refetch | Pop-up over the modal | "Got it" closes the pop-up **and** the modal; the feed refetches |
| Feed or profile card, outside the modal | `POST_NOT_FOUND`, `POST_FORBIDDEN` on like, unlike or delete | Pop-up | "Got it" closes it; the feed refetches, so a deleted post disappears |
| Delete post | `POST_DELETE_FORBIDDEN` | Pop-up | "Got it" closes it; no special refetch (the existing settle refetch is harmless) |
| Add reply | `COMMENT_PARENT_NOT_FOUND` | Nothing shown | Roll back and refetch the thread |
| Delete, like or unlike comment | `COMMENT_NOT_FOUND` | Nothing shown | Roll back and refetch the thread |
| Like or unlike a post or comment | `POST_/COMMENT_ALREADY_LIKED`, `*_NOT_LIKED` (409) | Nothing shown | Roll back, refetch shows the true state |
| Delete comment | `COMMENT_DELETE_FORBIDDEN` | Toast | Roll back |
| Create post | `POST_GROUP_MEMBER_REQUIRED`, `POST_BROADCAST_ADMIN_REQUIRED`, `POST_BROADCAST_ALREADY_ACTIVE`, `POST_BROADCAST_END_TIME_PAST` | Inline line under the form, specific copy | Form stays (the textarea clears on submit by existing FEED-10 design) |
| Update-broadcast dialog | `POST_EDIT_FORBIDDEN`, `POST_NOT_FOUND` | Existing dialog line, specific copy | Dialog stays |
| Diagnostic codes (`POST_TYPE_NOT_*`, `POST_GROUP_*`, `POST_NOT_BROADCAST`, `COMMENT_SYSTEM_READONLY`) | | Copy only, no special UI | The registry is complete for when the UI exists |
| Network, 5xx, unknown code, or any other code on the pop-up flows | | Existing toast / static line | Unchanged |

**Departures from the CLIENT-ERR-1 defaults:** no inline page state for a gone post (the user chose a pop-up; there is no `ResourceUnavailable` for the comments modal); likes and comment-not-found are silent; a 409 on a like never toasts (A18 audit).

**Divergence from the approved table (stated, not smoothed over):** the table said the create form "keeps the text". It does not: `CreatePostForm` clears its textarea on submit by FEED-10's documented design (`submitPost`), and changing that was out of scope. The e2e case found it and asserts only the line. Also, the first design plan said the post-load and thread-load errors would get per-code inline lines in `CommentSection`; the pop-up decision replaced that, so `CommentSection` is unchanged (the static lines still cover network and 5xx).

**Built:**
- `errors.json` en + vi: all 22 codes. `sharedDialogs.json` `postActionError.{title,gotIt}`. `postErrorCodes.test.ts` (24 cases over all 22 codes in en + vi).
- `app/postErrorDialogStore.ts` (raw error + a dismissal counter) and `shared/components/PostActionErrorDialog` (+ test, 4 stories), hosted once in `AppShell` next to `JoinFeedbackDialog`. The message is resolved from the raw error at render, so a locale switch is picked up.
- `features/feed/postErrors.ts`: `reportPostMutationError` (pop-up codes open the pop-up; silent codes say nothing; everything else toasts), `isPostDialogError`, and `usePostErrorGuard(loadErrors, closeComments)`, which hides the comments modal and opens the pop-up for a load failure with a pop-up code, and on every dismissal closes the modal and invalidates the feed. Errored queries are excluded from that invalidation (the failed post query is still mounted for one render and would re-open the pop-up; found by the first e2e run).
- Seven hooks (`useLikePost`, `useUnlikePost`, `useDeletePost`, `useCreateComment`, `useDeleteComment`, `useLikeComment`, `useUnlikeComment`) set `meta.errorDisplay: 'silent'` and report through `reportPostMutationError` in `onError` (no per-call plumbing: the pop-up is app-wide, so the feed card, the comments modal and the hashtag modal all work on any of the three pages). Their existing rollback and settle refetch are untouched.
- `HomeFeedPage`, `GroupsPage`, `PostsTab` call `usePostErrorGuard` and hide `CommentSection` while a pop-up code is pending; `useCommentsData` exposes `error`; the three page data hooks expose `createPostError`, and `useGroupsPageData` `broadcastUpdateError`. `CreatePostForm` and `UpdateBroadcastConfirmDialog` gained an optional `errorText`, filled by `getCodedErrorMessage`.
- **Retry:** the 404-only `retry` overrides in `usePost` and `useComments` are removed, and their two `noRawServerError` allowlist entries too. The app default (`shouldRetry`) already skips `NOT_FOUND`, `FORBIDDEN`, `VALIDATION`, `CONFLICT` and `UNAUTHENTICATED`; CLIENT-ERR-2 to 5 added no retry override. Remaining overrides belong to CLIENT-ERR-7 (`useSessionComments`) and CLIENT-ERR-9 (`useChatConversation`). The `usePost` tests now use `createAppQueryClient()` with real `AxiosError`s (a bare `{response:{status}}` object classifies as `UNKNOWN` and would be retried), proving the default skips a 404 and still retries a 500.
- MSW: `feed.ts` post like/unlike return 409 `POST_ALREADY_LIKED`/`POST_NOT_LIKED` for a repeat (strict now, like the real backend); `sessions.ts` session-post like/unlike return 409 with the same codes (was 400). Both `apiError` helpers take an optional `errorCode`. Comment-like handlers stay lenient (not needed by any flow).

**Consumer census:** `CreatePostForm`, `UpdateBroadcastConfirmDialog`: one optional prop each, all callers updated or compatible as-is. `useCommentsData` and the three page data hooks: one additive return field. The seven mutation hooks: no signature change; their failure reporting moved from the global toast to `reportPostMutationError` (callers: the data hooks only; session hooks have their own). `usePost`/`useComments`: lost an override, behavior for 404 unchanged and 403 now also skips retry. `useLikeSession` (CLIENT-ERR-7) still toasts via the global handler and gets the localized `POST_ALREADY_LIKED` text now that the copy exists (compatible as-is). No backend contract, shared DTO or endpoint changed, so no new follow-up ticket came out of this.

**I18N-4 census:** three rows added to `I18N_READINESS.md` (modal load/action failures, mutation conflicts, create-post and broadcast-update lines). `ERROR_HANDLING_DESIGN.md` tracker: post Phase C `DONE`.

**Tests:**
- Vitest, scoped to `src/features/feed`, `home-feed`, `profile`, `groups`, `src/shared`, `src/app`: **170 files / 1266 passed**. New or changed: `postErrorCodes.test.ts` (24), `postErrors.test.tsx` (16: reporting rules, `isPostDialogError`, the guard), `PostActionErrorDialog.test.tsx` (4), one `errorText` case each in `CreatePostForm` and `UpdateBroadcastConfirmDialog` tests, two failure-reporting cases in `useLikePost.test.tsx` (409 silent, 404 opens the pop-up), `usePost.test.tsx` moved to the app default. `tsc -b` clean; `eslint` 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`).
- **E2E:** one new spec, `e2e/flows/post-errors.spec.ts`, **8 tests**, 24/24 at `--repeat-each=3`: dead shared link (en), same in vi, comment on a vanished post (pop-up closes both), like a deleted post, delete without permission, repeat like silent, comment delete `COMMENT_NOT_FOUND` silent, create post as a non-member. Scoped existing specs run alongside, **80 passed**: `a11y`, `error-handling`, `feed-groups-journey`, `home-feed-journey`, `locale`, `matches-journey` (session like handler), `notification-bell`, `post-deep-link`, `profile-journey`, `group-invitations`. **The full `e2e` project was not run** (token-saving rule; scoped subset above). The first run of the new spec failed 5 of 8: a real bug (the pop-up re-opened after "Got it", fixed with the errored-query exclusion), an unfounded "text kept" assertion (the divergence above), a curly-apostrophe in the copy, an unloaded article count, and the fixture's English login form for the vi case. `E2E_OVERVIEW.md` updated (directory listing + new section).
- **Storybook:** `PostActionErrorDialog` has 4 stories; they typecheck and lint, Storybook itself was not opened.
- Not run: the full Vitest suite, `visual-regression`, a hand walk of the dev server, and the real backend (the contract is proven by A18's `PostErrorCodesIntegrationTest`).

**E2E:** `e2e` project, scoped: 8 new tests (24/24 repeated) + 80 existing specs passed; no spec failed in the final runs; full project not run.

**Visual-regression expectation:** no baselined surface touched. The pop-up only renders in an error state and no existing screen changed, so no baseline change is expected; a failing `visual-regression` run on this Windows host is the noise floor, not a regression. It was not run.
