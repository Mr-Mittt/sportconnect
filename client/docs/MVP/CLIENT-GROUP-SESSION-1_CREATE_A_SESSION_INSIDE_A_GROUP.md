# CLIENT-GROUP-SESSION-1 · Create a session inside a group (group mode of the create form)

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-1 (`modules/session/docs/MVP/`)
**Filed:** 2026-11-19, from the owner's group-session specification ("Custom session ... Creation: share the creation form with standalone session").

The client cannot create a group session today: `CreateSessionModal` never sends `groupId` and has no sport lock. New **group mode** (a `group` prop with the group's id, sport id and name; entry point is the group's Sessions tab, CLIENT-GROUP-SESSION-2), same sections as the standalone form with these differences:
- **Overview:** the sport select is hidden (the `sportField` slot is simply omitted) and the sport is the group's; the form must not re-seed on a sport change (`seededForSport` logic keys off the locked sport).
- **Who:** the visibility switch and its warning are absent (a group session is never public); taken/open slots and the gender split are absent (a group session shows no slot information); in their place **two radios, "All members" (default) and "Specific"**. Specific opens a **member picker**: server search through `useGroupMemberSearch` (`GET /groups/{id}/members/search`, B23), removable badges as the friend picker has, no limit on the number picked. The picker is a small shared component with a `{id, name, avatarUrl}` adapter, so CLIENT-GROUP-SESSION-5 and -3 reuse it (extract `isGroupManager(role)` while there: the role strings are repeated in four files).
- **Auto approve:** on by default; the confirm dialog for turning it on does not show for a group session.
- **Payload:** `CreateSessionPayload` sends `groupId`, `audience` (`ALL_MEMBERS`|`SPECIFIC`) and `audienceUserIds`; `isPublic` is not sent.
- **Errors:** the new SESSION-GROUP-1 codes get en/vi entries in `errors.json` and a row in the I18N-4 census; an `SPECIFIC` audience with nobody picked is a client validation message.
- All new strings en and vi; stories (group mode, Specific with picks); tests; MSW: the create handler accepts `groupId`/`audience`, refuses a non-member.

**Consumer census:** `CreateSessionModal` and its four page instances (`MatchesPage`, `GroupsPage`, `HomeFeedPage`, `FriendsPage`), `useCreateSessionModalData`, `useSessionWhoFields`, `SessionSectionFields`, `CreateSessionPayload`, e2e mocks.

**Out of scope:** editing the audience after creation, the Sessions tab (CLIENT-GROUP-SESSION-2), sharing (-3).

---
