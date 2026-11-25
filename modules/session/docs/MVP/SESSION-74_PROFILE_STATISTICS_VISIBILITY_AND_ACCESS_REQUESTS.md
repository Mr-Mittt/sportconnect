# SESSION-74 · Who can see a player's personal and pair statistics: a setting and access requests (low priority)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-73
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`). Owner, 2026-11-23: a player can set a "view profile" setting for personal and for pair statistics (default **true**, readable by others), and another player can ask for access when it is off. Low priority.

A per-user setting (`personal`, `pair`) and an access request (asker, owner, status, time) with a notification to the owner and an answer; a read of another player's statistics follows the setting or an approved request. Interpretation to confirm at pickup: default true means visible to other signed-in users; when false, others can ask. Client pair: CLIENT-SESSION-55. Add a use case to `NOTIFICATION_USE_CASES.md` at pickup.

**Out of scope:** the board rows themselves (boards are public by decision).

**Tests:** Spock and an integration test for the access rule (self, other with setting on, off, approved request, deactivated).

**Hand-over from SESSION-73 (2026-11-24):** the group member detail endpoint `GET /api/sessions/group/{groupId}/stats/members/{userId}` returns that member's pair statistics to **any member of the group**, with no privacy setting. When this ticket adds the `pair` and `personal` visibility setting, that endpoint must follow it (and say what a group member sees when the setting is off); decide at pickup whether a group member is treated like any other signed-in user or has a right of their own.
