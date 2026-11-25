# CLIENT-SESSION-60 · The group's statistics and leaderboard switch

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-78 (session backlog)
**Filed:** 2026-11-25, `/ticket`: the client half of SESSION-78 (a group owner or admin switches the group's statistics and leaderboard on or off; default off).

In the group's **Settings** tab, a switch "Statistics and leaderboard" next to the Sessions section: owners and admins can change it, other members see its state read-only (the group's existing `GET/PUT /api/sessions/group/{groupId}/settings`, which now also carry `statisticsEnabled`; shapes in the SESSION-78 ticket; a `PUT` that sends only `statisticsEnabled` changes nothing else). **The setting is only shown while the group's sport has statistics switched on**: the settings answer carries `statisticsEnabled: null` otherwise (owner, 2026-11-25: the server ignores the group setting then and the client does not render it, no explanation needed), and a `PUT` of it is refused with 409 `SESSION_GROUP_STATISTICS_NOT_AVAILABLE` (a user does not normally meet it; it still needs its en/vi `errors:codes` entry in this ticket, and the I18N-4 row).

While it is off, the group's Statistics and Leaderboard screens (CLIENT-SESSION-41 and 42) show an empty state "Statistics are off for this group" (with the switch for an owner or admin) when nothing was counted; what was already counted stays shown. The two new group system posts (`GROUP_STATISTICS_ON`, `GROUP_STATISTICS_OFF`) need their en/vi sentences in the group feed, and the I18N-4 census gets a row for the setting form's errors.

**Out of scope:** the manual board refresh (SESSION-54's client pair), a reset, per-member visibility (CLIENT-SESSION-55).

**Tests:** component tests for the switch (owner and admin can toggle, a member cannot), the empty state, and the system-post copy in en and vi; MSW handlers for both endpoints. i18n: en and vi for every string, in this ticket.
