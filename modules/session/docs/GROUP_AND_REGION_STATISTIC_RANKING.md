# Statistic
- What is it? Base on the result of session, we collect and calculate the statistic of user.
- What statistics? Sport configurable, e.g. 
  - badminton: we collect games, wins, lost and calculate win-rate (personal and pair)
  - running: we collect run times, total distance and paces average ...
  - football: we collect games, win, lost, goals, assists and calculate win-rate .... 
- What source? all sessions result, category into 2 group, normal and ranking 
  - ranking game: only game/record that are verified, will be counted
  - normal game: the rest logged games/records
- Group also have its member statistic
    ## What verified game
    - when all game participant click verify
    - game must include score
    - user can add proposal game, and other game participant verify it, result update later (24h guard still apply)
# Ranking (leaderboard)
- What is it? Group ranking, region ranking, country ranking
- What source? 
  - Group: all group statistic
  - region: ranking game statistic, but only if player region match with location region
  - country: same with region ranking, but country match

 

> **Decision change (owner, 2026-11-23, SESSION-72 pickup):** the line "region: ranking game statistic, but only if player region match with location region" no longer holds. A ranking game counts on the board of the **venue's** region and country for every player in it, wherever the player lives (a player from region A who plays at a venue in region B is counted on region B's board). See `STATISTIC_RANKING_DESIGN.md`, decision 8.
