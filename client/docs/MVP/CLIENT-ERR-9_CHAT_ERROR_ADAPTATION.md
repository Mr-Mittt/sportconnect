# CLIENT-ERR-9 · Client error adaptation: chat

**Status:** `TODO`
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
