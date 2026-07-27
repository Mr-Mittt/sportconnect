# CHAT-13 · Editing and deleting messages — implementation summary

**Status:** `DONE` (2026-07-28) · **Type:** Feature (client + chat service)

## What this ticket was

CHAT-13 was filed unscoped, with 5 open design questions to resolve at pickup. Mid-implementation
the user also asked for two UI changes to both chat surfaces: swap own/other message alignment
(own messages now left, not right), and add a circular avatar for other group members' messages.

## Design decisions (Phase 1, resolved with the user before any code)

1. **Edit model:** replace content in place + a nullable `edited_at` timestamp, not a full edit-history
   table. Matches how most chat apps (WhatsApp/Slack/iMessage) actually work.
2. **Delete model:** soft-delete via a nullable `deleted_at` column — matches this app's existing
   convention elsewhere (`User.isActive`, `Group.isActive`). Content is also scrubbed to an empty
   string server-side on delete, so a deleted message's original text is never re-served.
3. **Authorization:** sender-only. No group-admin moderation — that would require first closing
   `services/chat/CLAUDE.md`'s documented role-sync gap (`group_members_cache.role` isn't kept
   fresh), deliberately out of scope here.
4. **Time window:** none — a message can be edited/deleted indefinitely.
5. **UI, added mid-ticket (user request):** own messages now align left, other participants' align
   right — a deliberate reversal of the usual own-on-right convention. Group chat (only) also shows
   a circular avatar next to other members' messages (not the caller's own), reusing the existing
   `Avatar`/`AvatarImage`/`AvatarFallback` component already used by `FriendRail`/`PostCard`.
6. **No delete confirmation dialog** (my default, flagged rather than assumed): deletion is
   immediate, matching most chat products (Slack/Messenger) rather than this app's heavier
   `DeleteGroupConfirmDialog` pattern reserved for higher-stakes actions.

## Approved design (Phase 3, restated)

**Backend:**
- Migration `000004_add_message_edit_delete`: `chat_messages` gains nullable `edited_at`/`deleted_at`.
- `internal/message`: new sentinel errors `ErrMessageNotFound`/`ErrNotSender`; `Repository.Edit`/
  `Delete` (a single guarded `UPDATE ... WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL`
  on the success path, falling back to a second diagnostic query only on failure, to tell apart
  "not found" vs "already deleted" vs "wrong sender" without paying that cost on every call);
  `Service.Edit`/`Delete` reuse `Send`'s content validation.
- `internal/api`: new `wsEvent{Type, Message}` envelope wraps **every** WebSocket broadcast as of
  this ticket (`MESSAGE_CREATED`/`MESSAGE_EDITED`/`MESSAGE_DELETED`) — a deliberate breaking change
  to the wire shape CHAT-7/8/9 shipped, updated in lockstep with the one client that consumes it,
  since nothing external depends on the old bare-message shape yet. New `PATCH`/`DELETE
  /conversations/{id}/messages/{messageId}` routes; `respond.go` maps the two new errors to 403/404.

**Client:**
- `types.ts`: `ChatMessage` gains `editedAt`/`deletedAt`; new `ChatWebSocketEvent` discriminated
  union matching the backend's envelope.
- `useChatConversation.ts`: `onmessage` branches on `event.type` — `MESSAGE_CREATED` uses the
  existing `mergeMessage` (dedup-and-prepend), `MESSAGE_EDITED`/`MESSAGE_DELETED` use a new
  `replaceMessage` (find-by-id-and-splice across every loaded page, since an edit/delete never
  changes which page a message lives on). New `editMessage`/`deleteMessage` mutations (PATCH/DELETE),
  both funnel their response through `replaceMessage` too.
- `GroupChatTabView.tsx`/`FriendChatPanelView.tsx`: own-message bubbles get small `IconPencil`/
  `IconTrash` icon buttons (always visible, not hover-only, for guaranteed keyboard reachability
  without extra `focus-within` complexity); clicking Edit swaps the bubble for an inline `Input`
  (Enter to save, Escape to cancel, distinct `aria-label="Edit message content"` from the trigger
  button's `aria-label="Edit message"` — see Divergence below); `editedAt` shows a muted "(edited)"
  tag; `deletedAt` renders an italic "Message deleted" placeholder with no affordances. Alignment
  swapped (`isOwn ? items-start : items-end`); `GroupChatTabView` only additionally renders an
  `Avatar` (image with initials fallback) for non-own messages.

## Divergence from the approved design

- **`autoFocus` on the inline edit input** was in the initial implementation (auto-focusing the
  input when Edit is clicked, for a smoother interaction) but this repo's ESLint config enforces
  `jsx-a11y/no-autofocus` — removed rather than suppressing the rule. The input is still fully
  keyboard-reachable via Tab, just doesn't auto-focus on click.
- **Test-only naming collision, not a design change:** the inline edit input and the pencil trigger
  button both initially used `aria-label="Edit message"` — harmless for a screen reader (different
  elements, different contexts) but ambiguous for `getByLabelText` in tests. Renamed the input's
  label to `"Edit message content"` to disambiguate; no visible/behavioral change.

## Verification

- `go build ./...`, `go vet ./...`, `go test ./...` — all green, including 10 new tests (7
  repository/service-level in `internal/message`, a WS broadcast test and an HTTP-status-codes test
  in `internal/api`, plus the JSON-shape regression test added post-verification — see below).
- Client: `tsc -b`, `eslint .` — clean. Full `pnpm vitest run` — **97 test files / 580 tests** (up
  from CHAT-9's 96/560), including 30 new tests across `useChatConversation.test.tsx`,
  `GroupChatTabView.test.tsx`, and `FriendChatPanelView.test.tsx` (including the WS-race regression
  test added post-verification — see below).
- Full `pnpm e2e` — **46/46 passing**, no regressions from the UI changes (chat's own e2e coverage
  is still `CHAT-10`'s unstarted scope, so nothing here directly exercises the new edit/delete UI
  end-to-end through Playwright).
- **Live-verified through the real dev proxy (`localhost:5173`)**, per the binding note CHAT-8/9
  left about proxy-vs-direct verification: registered two users, opened a group conversation, sent
  a message, edited it (200, `editedAt` set), deleted it (200, `deletedAt` set, `content` scrubbed),
  confirmed a re-fetch of history shows the scrubbed content server-side (not just in the response),
  confirmed editing an already-deleted message correctly 404s, and confirmed all three WebSocket
  event types (`MESSAGE_CREATED`/`MESSAGE_EDITED`/`MESSAGE_DELETED`) arrived in order on a second
  connection. One imprecision in this manual script (not in the automated tests): the "non-sender"
  403 check used a user who also wasn't a group member, so it mainly proves the pre-existing
  membership gate rather than isolating the new sender-only check specifically — the automated
  `TestEditDeleteMessage_HTTPStatusCodes` (Go) does isolate it correctly (adds the other user as a
  real group member first).
- **Not verified this session:** the actual rendered UI in a live browser (no browser tooling
  connected) — same limitation flagged at CHAT-8/CHAT-9, still outstanding.

## Post-verification: two real bugs found via the user's own manual testing, same day

Same pattern as CHAT-8's proxy bug — the manual browser check this doc's Verification section
flagged as unperformed is exactly where these two surfaced. Neither was caught by the extensive
automated coverage above, for the same underlying reason in both cases: the tests exercise plain
TypeScript/Go objects, never the actual JSON serialization round-trip a real browser depends on.

### Bug 1 — sent messages could intermittently vanish (React 18 StrictMode WebSocket race)

`useChatConversation`'s WebSocket handlers (`onopen`/`onmessage`/`onclose`) all guarded on a single
shared `unmountedRef`. React 18 `StrictMode` (enabled in `main.tsx`) double-invokes every effect in
dev — mount → cleanup → mount — and `unmountedRef` is one ref shared across both invocations: the
second mount resets it to `false` before the *first* (already torn-down) socket's async `onclose`
event has necessarily fired. That stale `onclose` then saw `unmountedRef.current === false`,
concluded the (long-gone) connection it belonged to had dropped, and scheduled a reconnect — whose
`onopen` calls `queryClient.invalidateQueries` on the messages query, which could race a just-sent
message's local cache update with a server refetch.

**Fix:** every handler now compares socket identity (`socketRef.current !== socket`) instead of
relying on the shared flag — a torn-down or superseded socket's callbacks become no-ops regardless
of which ref got reset when. `unmountedRef` still gates a *scheduled* reconnect from firing after a
real unmount, but is no longer what stale in-flight callbacks are judged against.

**Regression test:** `useChatConversation.test.tsx`'s new `"a stale socket's late close event is a
no-op once superseded"` forces a real reconnect (so two sockets exist), then re-fires the first
socket's `close` a second time and asserts nothing further happens. Confirmed this fails without the
fix (status incorrectly flips back to `reconnecting`) and passes with it, same
temporarily-reintroduce-the-bug verification method CHAT-6/CHAT-8 used.

### Bug 2 — the actual reported symptom: every message rendered as "Message deleted"

`messageBody`'s `editedAt`/`deletedAt` fields were `*time.Time` with `json:",omitempty"`. Go's
`encoding/json` omits an `omitempty` pointer field **entirely** from the output when it's `nil` — it
does not emit `null`. On the client, a JSON key that's simply absent decodes to `undefined` in
JavaScript, not `null`. But `GroupChatTabView`/`FriendChatPanelView`'s `isDeleted = message.deletedAt
!== null` (matching the `ChatMessage` type's `string | null`, not `string | null | undefined`) —
`undefined !== null` is `true`. Every message that had never been edited or deleted therefore
evaluated as deleted, immediately, including one just sent — this is the literal bug behind "message
auto delete after send."

Every automated test constructs `ChatMessage`/`messageBody` fixtures as plain objects with
`editedAt: null`/`deletedAt: null` set explicitly — none of them ever go through actual JSON
marshal/unmarshal, so this exact class of bug had no way to surface in the suite as it stood.

**Fix:** dropped `omitempty` from both fields — they're now always present in the JSON, explicitly
`null` when unset, matching the TypeScript contract exactly.

**Regression test:** new `internal/api/responses_test.go`,
`TestMessageResponse_EditedAtAndDeletedAtAreExplicitNull` — marshals an untouched message and asserts
the JSON actually contains `"editedAt":null`/`"deletedAt":null` as keys, not that they're absent.
This is deliberately a JSON-level assertion (`json.Marshal` → `map[string]any` → key presence check),
not a struct-field assertion, since a struct-field check (`m.EditedAt == nil`) is exactly what this
package's other tests already did and is exactly what didn't catch this. Confirmed this fails when
`omitempty` is reintroduced and passes with the fix, same verification method as Bug 1.

**Live-reverified after both fixes:** a fresh `POST .../messages` response through the real proxy now
reads `"editedAt":null,"deletedAt":null` explicitly in the raw JSON (previously these keys were
absent entirely).

## Known follow-ups (not this ticket's scope)

- The manual two-session browser check + Storybook visual pass, outstanding since CHAT-8.
- Group-admin moderation rights over others' messages, if ever wanted — needs the role-sync gap
  closed first (see decision #3 above).
- `CHAT-14`/`CHAT-15`/`CHAT-16` (read receipts, typing indicators, attachments) — still unscoped,
  each needs its own Phase 1/2/3 pass at pickup.
- `CHAT-10` (E2E + MSW handlers for chat) — still not started; would be the natural place to add
  Playwright coverage for edit/delete specifically once it lands.
