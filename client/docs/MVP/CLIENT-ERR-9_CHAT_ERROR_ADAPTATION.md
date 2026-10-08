# CLIENT-ERR-9 · Client error adaptation: chat

**Status:** `DONE` (2026-10-08)
**Type:** Enhancement
**Program:** Error handling · Phase C (no Phase B pair: the chat service is not part of the Spring `ApiResponse` contract)
**Depends on:** CLIENT-ERR-1
**Filed:** 2026-10-04, at CLIENT-ERR-1 pickup (user decision): the chat site that was parked on CLIENT-ERR-8 has no natural owner there, because CLIENT-ERR-8 pairs with the reference, location and notification audits and chat is a separate Go service. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Chat (`chatApiClient`, `useChatConversation`, the direct and group chat UIs) talks to the Go service under `services/chat/`, which returns **plain-text errors** (`http.Error(w, "unauthenticated", 401)`), not the `ApiResponse` envelope. So there is no `errorCode` here; the client only has the HTTP status and a short text body. This ticket adapts chat's error states to the CLIENT-ERR-1 classifier and defaults:

- Confirm the classifier's non-envelope path (status-only, `message` only when the body is a string) gives the right category for every chat status the service returns (400, 401, 403, 404, 5xx, no response).
- `useChatConversation` (`retry: false`, comment says a 403 for "not a member / not friends" is terminal): decide whether the CLIENT-ERR-1 category-based default retry makes that override redundant or it must stay, and what the conversation view shows for a 403 or 404 (`ResourceUnavailable` or a chat-specific state) instead of today's generic state.
- WebSocket failures (`connectionStatus`), message-send failures and history-load failures: where each shows and what happens afterward.
- Add the en + vi copy (an `errors:` entry only where a chat status needs more than the category copy), and update the I18N-4 census row(s) if any chat form shows a raw server text.

**Who:** any signed-in user using direct or group chat. **Localization:** en + vi for every new string (client rule).

**Out of scope:** Making the chat service return the `ApiResponse` envelope or error codes (a Go-service change; file it separately if the behavior table shows the status alone is not enough); the Spring modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the CLIENT-ERR-1 approved defaults and list every row that departs from them. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated hook or component (`useChatConversation` 403/404/5xx, send failure), a flow e2e case for a forbidden conversation (the MSW chat handlers already exist under `e2e/mocks`), scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Scope change (2026-10-07, from the LOC-6 scope discussion): cross-module "repeated action" review

Added by user decision (replaces a separate CLIENT-LOC-2 ticket that was drafted and dropped): this is the last Phase C ticket, so by now every module's codes exist. Besides chat, it **reviews every toggle-style or "do once" mutation in the shipped client, all modules, not only location**, for the case where a double-click or a second tab produces an "already in the target state" error.

- List the mutations (favorite, like/unlike for posts, sessions and comments, follow/unfollow, join/leave, friend actions, notification read, group join and so on). For each: is the control disabled while the request is in flight; is an optimistic state reconciled on an "already done" 409/400; does a repeat click show a toast or dialog where a silent refetch would serve better?
- Cross-check against each module's "already in the target state" code (`LOCATION_ALREADY_FAVORITED`, `LOCATION_NOT_FAVORITED`, `SESSION_NOT_PARTICIPANT`, `SPORT_PROFILE_ALREADY_EXISTS`, the POST and GROUP equivalents).
- Output: a findings table in the behavior table for sign-off; fix the cheap ones here and file the rest as their own tickets.
- Location favorites themselves are implemented by CLIENT-ERR-8 (refetch, no error shown); this review only checks the rest and confirms ERR-8 matches the convention.

## Scope decisions (2026-10-08, pickup)

1. **Review depth:** list every toggle-style or "do once" mutation and fix the cheap ones here (one hook, no new UI); anything needing new UI or a design call is filed as its own ticket.
2. **Chat 403/404:** shown **inline inside the chat panel**, not as a page-level block: the rest of the page keeps working without chat.
3. **Send failure:** the draft is kept and a Retry is offered (no failed bubble in the transcript, no toast).
4. **WebSocket drops:** a quiet "Reconnecting…" line with the existing automatic retry; no toast, the draft is untouched.
5. **Chat service:** a Go-service ticket is filed only if the behavior table shows the status alone is not enough. It was enough, so none was filed.

## Approved behavior table

The service answers with a status only (plain text for handler-level 401/400, `{error, message}` JSON for domain errors), never an `errorCode`, so every row is told apart by the CLIENT-ERR-1 classifier's category.

| Flow / error | Where it shows | Copy (en) | What happens afterward |
|---|---|---|---|
| Open conversation: 403/404, direct | Inline, in the panel | "You can't chat with this person right now." | Composer disabled, no retry. The rest of the page keeps working. |
| Open conversation: 403/404, group | Inline, in the panel | "You're no longer part of this group's chat." | Same. |
| Open or history load: network/5xx | Inline, in the panel | "Couldn't load this conversation." plus **Retry** | Auto-retried 3 times first (app default), then the button. Composer disabled until loaded. |
| Older-history load fails | Inline, existing line with Retry | Existing "Couldn't load earlier messages." | Unchanged; loaded messages stay. |
| Send: network/5xx | Notice above the composer | "Couldn't send. Your message is still in the box." plus **Retry** | Draft kept (cleared only on success). Retry re-sends it. No toast. |
| Send: 400 | Same notice | "That message can't be sent. It may be empty or too long." | Draft kept so it can be shortened. No Retry button. |
| Send: 403/404 | The panel switches to the unavailable state | As the first two rows | Composer disabled. |
| Edit or delete: network/5xx | Notice above the composer | "Couldn't edit that message." / "Couldn't delete that message." | Message stays as it was; the edit text is not restored. |
| Edit or delete: 403 | Same notice | "You can only change your own messages." | History refetches. |
| Edit or delete: 404 | Same notice | "That message no longer exists." | History refetches. |
| WebSocket dropped | Muted line above the composer | "Reconnecting…" | Backoff reconnect continues, composer stays usable (sends go over REST), line disappears on reconnect, a gap is refetched. No toast. The initial "connecting" shows nothing. |
| Typing signal fails | Nowhere | n/a | Unchanged: best-effort. |
| Friend requests: `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING`, `FRIEND_REQUEST_NOT_FOUND` | Nowhere | n/a | The `onSettled` refetch shows the true state. |
| Friend requests: other errors | Toast, as today | Category / code copy | Unchanged. |

## Repeated-action review (findings)

| Mutation | In-flight guard | Already-done error | Verdict |
|---|---|---|---|
| Post like/unlike, comment like/unlike | Optimistic, rolls back, refetches | Silent codes (ERR-6) | OK |
| Session like/unlike, comment like | Button disabled while pending | Toast or dialog (ERR-7) | OK |
| Session join/leave/approve/reject | Disabled while pending | Dialog for `SESSION_NOT_PARTICIPANT` and the other session codes | OK |
| Location favorite/unfavorite | Disabled while pending | Silent plus refetch (ERR-8) | OK, matches the convention |
| Notification read | Silent, optimistic | Refetch (ERR-8) | OK |
| Group join, leave, invitations, join requests | Disabled while pending | `inline` (ERR-5) | OK |
| Friend request send / accept / decline / cancel | Disabled while pending | No meta: the global toast showed "You're already friends" etc. | **Fixed here** (silent for the three stale codes) |
| Unfriend | Disabled while pending | `inline` | OK |
| Sport profile add, deactivate | Not checked | `inline` (`SPORT_PROFILE_ALREADY_EXISTS` handled inline) | OK |
| Follow | No follow mutation exists in the client | n/a | Nothing to do |

`FRIEND_REQUEST_NOT_PENDING` (accept/decline of a request someone else already answered) keeps its CLIENT-ERR-4 toast: it is information about another person's action, not a stale echo of the user's own click, and it was approved that way. No follow-up ticket came out of the review.

## Implementation summary (2026-10-08)

**What was built, as approved.** No backend or Go-service change.

- **Classification:** new `features/chat/chatErrors.ts` (`getChatLoadFailure`, `getChatSendFailure`, `getChatActionFailureKind`), by classifier category only. The classifier itself is unchanged.
- **`useChatConversation`:** the `retry: false` override is removed (the app default `shouldRetry` already skips 403/404 and retries network/5xx). Send, edit and delete are `errorDisplay: 'silent'`. It now exposes `loadFailure`, `retryLoad`, `sendFailure`, `actionFailure`; `sendMessage(content, onSuccess?)` runs `onSuccess` only when the server accepted the message. A 403/404 on send makes `isError` true and `loadFailure` `'unavailable'`; a 403/404 on edit or delete refetches the history.
- **UI:** new `features/chat/components/ChatNotices.tsx` (`ChatLoadFailureNotice`, `ChatComposerNotices`) shared by `FriendChatPanelView` and `GroupChatTabView`. Both views take the new props as optional, clear the draft only on success (`d.trim() === text` keeps anything typed meanwhile), and render the notices.
- **Friends:** new `friends/friendErrors.ts` (`reportFriendMutationError`); the four friend-request hooks are `silent` with it.
- **Copy:** en + vi under `errors:chat.*` (one set for both chat panels, not duplicated into `friends:` and `groups:`).

**Divergences from the plan.**
1. A failed send keeps the draft and a Retry notice instead of a failed bubble in the transcript (decided at pickup, restated in the plan).
2. The copy lives in the `errors` namespace as one shared set, not in `friends:chat.*` and `groups:chat.*` as the plan said, so the two panels cannot drift. The old `chat.loadError` keys in `friends`/`groups` are now unused by these views and were left in place (they remain overridable through `i18nOverridePrefix`); the group panel's load error now reads "Couldn't load this conversation." instead of "Couldn't load this group's chat."

**Consumer census.** `useChatConversation`'s result is consumed only by `useDirectChatData` / `useGroupChatData` and then `FriendChatPanel` / `GroupChatTab` (spread into the views): the new fields are additive and the view props are optional, compatible as-is. `sendMessage` gained an optional second argument: both views updated. The four friend-request hooks are consumed through `useFriendsPageData`, whose shape is unchanged.

**Tests.**
- **Vitest** (scoped, 18 files, 215 passed): new `chatErrors.test.ts`, `friendErrors.test.ts`; `useChatConversation.test.tsx` (+8: 403 open, 500 open with `retryLoad`, failed then accepted send, 400 send, 403 send, 403 edit with refetch, 500 delete, reconnecting); both view tests (+10 each: unavailable, Retry, draft kept and Retry, 400 without Retry, Reconnecting, four action lines), and the three assertions the new send contract changed.
- **E2E:** new `e2e/flows/chat-errors.spec.ts` (3 tests: forbidden direct chat, forbidden group chat, failed send keeps the draft and Retry sends it), 3 passed. Existing specs covering the touched surfaces (`direct-chat`, `group-chat`, `friends-journey`, `group-members`, `locale`, `a11y`, `smoke`, `user-errors`, `matches-journey`): 54 passed. The full `e2e` project, the full Vitest suite and visual-regression were not run (scoped-test rule).
- **Visual-regression expectation:** no baselined surface touched, so no baseline change is expected; a failing `visual-regression` run is the Windows noise floor, not a regression. It was not run.
- **Not done:** no browser walkthrough and no check against the real chat service.
