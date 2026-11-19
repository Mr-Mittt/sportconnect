# CLIENT-GROUP-SESSION-3 · Share a group session with members, and the group session notification texts

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-1, SESSION-GROUP-3
**Filed:** 2026-11-19, from the owner's group-session specification ("Modal: share button trigger for invitation dialog with group member only") and the notifications decided for SESSION-GROUP-1.

- **Share:** `canShare` in `SessionDetailModal` also allows a group session for a group member (today `session.groupId === null && session.isPublic`); `ShareSessionDialog` gets its list injected: for a group session the members come from `useGroupMembers` (one 100-row page, a known cap, noted) instead of friends; the Joined mark, the 50 limit and the sent/limit lines are unchanged. The `SESSION_SHARE_NOT_ALLOWED` text goes back to "a private session" (en/vi).
- **Notification types:** `session.group.created` ("{name} created {session} in {group}") and `session.group.cancelled` ("{name} cancelled {session}") added to the `NotificationType` union with a `getNotificationText` case each (the exhaustiveness guard fails the build otherwise), en/vi `enums.json`; the click opens the session (`entityType` SESSION).
- Strings en and vi; tests for the dialog in group mode, the two texts; stories; MSW share handler accepts a group session for members.

**Consumer census:** `canShare`, `ShareSessionDialog`/`useSessionDetailModalData` (`share` slice), `useShareSession`, `notificationText.ts`, `notifications/types.ts`, `errors.json`, `I18N_READINESS.md`, e2e mocks.

---

**Server contract (built 2026-11-19; the whole contract is `modules/session/docs/GROUP_SESSION_DESIGN.md` § 4.3 and § 7).** `POST /api/sessions/{id}/shares` on a group session: any member of the group in any status (`403 SESSION_GROUP_MEMBER_REQUIRED` otherwise), `{ userIds }` of 1 to 50, answer `{ sent, skipped }`; the recipients are other members of the group (not friends), and anyone outside the group, deactivated, repeated or already in the session is skipped and counted. Notifications: `type` `session.group.created` (a group session was created or generated for you) and `session.group.cancelled` (a group session you were told about, or joined, was cancelled); each carries the session id and the actor and **no group id**. Add both `NotificationType` values, their `getNotificationText` cases and `enums.json` entries in en and vi.
