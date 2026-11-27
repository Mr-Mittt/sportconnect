# SESSION-86 · Season KPI (games target) and season recap

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-55 (group seasons)
**Filed:** 2026-11-27, split off at the pickup of SESSION-55: the owner kept the season itself (period, counters, board, post, lifecycle) and put the KPI and the recap aside, "it will be needed for tournaments".

From the original SESSION-55 (BA SE-1 to SE-3, KP-1 to KP-3): the admin sets a **target number of games per player** for a season and each player sees their progress; at the end of a season a recap shows **most points, most games and who reached the target**. Rewards are offline, no reward logic. To settle at pickup: whether the target is editable while `ONGOING`; "points" needs the `scoreFor` stat in the season's list (skipped with a stated reason when it is not); the recap is computed from the season's own counters once it is `FINALISED`. Client: the KPI and recap parts of CLIENT-SESSION-43.

**Out of scope:** fees, rewards, tournaments.

**Tests:** to be written at pickup.
