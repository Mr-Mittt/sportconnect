# SESSION-76 · Head-to-head, best partners and the opponent a player loses to most (BA ST-2, ST-6)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-53
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`). The owner's specification does not mention head-to-head, but the BA lists it as Must (ST-2); it is not in the first statistics release (STATISTIC_RANKING_DELTA section 4, question 5), so it is filed as its own ticket.

Read at request time from the player's history pointers (the latest 500 games, resolved by id from `session_records`) and the `teams` counters of `user_sport_stats`: for two players, as opponents (who won how many games) and as partners (games and wins together); a player's most frequent and best partners and the opponent they lose to most. A cached opponent map inside the blob is a later option if the read is too slow (measure at pickup). Group scope for group members, personal otherwise; visibility follows SESSION-74 when it exists. Client pair: CLIENT-SESSION-56.

**Tests:** Spock against a worked example; an integration test for the visibility.
