# Statistics and ranking: what the BA document should change

> **Revised 2026-11-25 (SESSION-53 rework).** For the BA: a sport now has an on/off switch for statistics and ranking, and counts only the statistics its scoreboard lists (the same list the app's scoreboard shows; a sport that lists none counts nothing, there are no defaults); a pair's statistics belong to each player (partner counters are personal data); and a group keeps the head-to-head record of its pairs (latest 5,000 matchups). Where sections below say otherwise they describe the plan of 2026-11-23. Details: `STATISTICS_CONFIG_PAIRS_AND_H2H_DESIGN_DRAFT.md`.

**Status:** Draft for the BA, 2026-11-23. Kept up to date as each ticket of the chain is built (section 5); when the chain is finished it goes back to the BA for the final app behaviour, the same way `BA_GAME_LOGGING_DELTA.md` did for game logging.
**Compares:** the statistics, leaderboard, season, KPI, adjustment, guest, sharing and non-functional text of `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards (revised 2026-11-23).md` against the owner's specification `GROUP_AND_REGION_STATISTIC_RANKING.md` and the design `STATISTIC_RANKING_DESIGN.md` (decisions of 2026-11-23).
**Tickets:** SESSION-72, SESSION-53, SESSION-73, SESSION-54 (server), CLIENT-SESSION-54, 41, 42 (client), prerequisite LOC-5; later SESSION-52, 55, 56 and CLIENT-SESSION-40, 43, 44, 48; follow-ups SESSION-74 to 77, CLIENT-SESSION-55, 56.
**Built so far: LOC-5 and SESSION-72 (section 5).** Every other "as designed" below is a plan until section 5 says otherwise.

How to read it: **Server** and **Client** say where the decision is enforced. "Update BA" is a suggested change to the BA text; "Confirm" needs a BA answer.

---

## 1. New concepts the BA document does not have

| New concept | Meaning | Where | Update BA |
|---|---|---|---|
| **Normal game** and **ranking game** | Every valid logged record is a normal game. A record with a complete score that **every player named in it has confirmed** is a ranking game. Only ranking games feed region and country boards | Server, Client | Add both terms and the verification flow (GL section) |
| **Proposal** | A `JOINED` participant of the session proposes a record as a ranking game, from the moment the session is scheduled (a game can be set up before the start, even with no score yet) until 24 hours after it ended; the other players are notified, and notified again when a proposed game is changed. No region is needed on anyone's profile | Both | Add requirement rows GL-17 to GL-19 (below) |
| **Verification** | Confirmation by each player named in the record, once the score is complete; editing a record makes the confirmations stale (everyone confirms the new result again); it must happen inside the same 24-hour window as any change | Server | Add; **Confirm** the window (section 4, question 1) |
| **Region and country leaderboards** | Boards across all groups and standalone sessions, ranking games only, for the region and the country **of the venue where the game was played**, singles and pairs. A player from another region who plays at a venue in region B is counted on region B's board. Visible to every signed-in user | Server, Client | Add to the Leaderboards section; the BA's LB-1 speaks only of group boards |
| **Venue region** | A venue has a country and a region, found from its coordinates when it is created (LOC-5); a venue without coordinates, in open water or in a country that is not set up (only Vietnam is) has none, and its games feed no regional board. The player's own region is not used | Server | Add; **Confirm** (section 4, question 3) |
| **Generic across sports** | The same engine serves every sport. A sport differs only by its schema and by the reader of its record type (a head-to-head match now; a per-player result such as running later). Adding a sport of an existing type is configuration | Server | Add to the template section: the template now also declares metrics, formulas, team-combination size and ranking order |
| **Draws** | The engine counts draws as a fourth universal counter; they arrive with the draw rule (SESSION-59) | Server | Keep "draws deferred"; note the counter exists |
| **Statistics appear after the 24-hour guard** | The server counts a session once its 24-hour change window has closed. The session's own scoreboard stays live | Server | State it in ST (section 2) and NF |
| **Ranking is a scheduled calculation** | Ranks are calculated nightly (00:05 Vietnam time) and a group owner or admin can refresh the group board by hand, at most once an hour per sport | Server, Client | Add NF rows |
| **History of counted games** | Each session's contribution (which games were counted, which ignored and why) is kept permanently, and each player keeps their latest 500 games as a list shown newest first; a future recalculation reads the kept contributions and the games themselves | Server | Replace NF-4/ST-5 wording (section 2); say that a player's list shows the latest 500 games |
| **Profile statistics visibility** (low priority) | A player can show or hide personal and pair statistics from others (default visible); someone can ask for access | Both | Add as Should, later |

## 2. Statistics, leaderboards and the rest: BA text against the design

| BA item | What the BA says | Design decision | Where | Update BA |
|---|---|---|---|---|
| **ST-1** per player: games, wins, losses, win rate, net points | Fixed set | **Sport-configured (generic engine)**: games, wins, losses and draws are universal; everything else (score for and against, goals, assists, distance, best time) is a metric the sport's schema declares with how it adds up (sum, best, worst), and win rate, net points or pace are formulas the schema declares; badminton: games, wins, losses, win rate, wins minus losses (net points), score for and against when scores exist. Personal statistics are shown as **all games** and **ranking games**, so normal = all minus ranking | Server | Reword: "configured per sport"; add the normal / ranking split |
| **ST-2** head-to-head (opponents and partners) | Must | **Not in this iteration.** The history keeps every game with its players and sides, so it is possible later (SESSION-76, CLIENT-SESSION-56). **Confirm** (section 4, question 5) | Server | Move to a later release or accept |
| **ST-3** pair stats | Must | Built as **groupings** (`groupBy`, 2026-11-24): `TEAM` with the size the sport's schema says (badminton: 2, the pair) and `PARTNER` (counters per teammate); a sport with no `groupBy` has none, and the default is none (a sport asks for them in its schema, so badminton's stored schema must declare `groupBy`); personal, group, region and country scopes | Server | Reword: "pairs, or groups of the size the sport defines" |
| **ST-4** scope: all-time, a season or one session | Must | All-time now. A session's own scoreboard is the client's (GL-6). Seasons later (SESSION-55) read the history's local play date | Server | Say seasons come with SE |
| **ST-5** statistics are calculated from stored games, never kept as editable totals | Proposed | They are kept as **derived counters** (updated by the server when a session is counted, never edited by hand) and every counted game is stored, so they can be rebuilt from the permanent record of what each session contributed (SESSION-77). Stored per player and sport, and per group member, as one record each, with a small ranking table next to it that is the only thing sorted | Server | Reword: "derived, rebuildable, not editable" |
| **ST-6** best partners, most-lost-to opponent | Should | Later, from the pair counters and the history (SESSION-76) | Server | Keep as Should |
| **ST-7** head-to-head opens in under 2 seconds | Should | Reads hit indexed counters and the player's history index; not measured yet | Server | Keep; measured at SESSION-73 |
| **LB-1** boards per sport; Single always, Pair where two per side | Group boards | Same, plus the **region and country boards** (singles and pairs) | Server | Add the two scopes |
| **LB-2** +1 win, -1 loss; the template can change it | Points rule | Not a stored points rule: the board order uses the sport's sort keys (default: wins minus losses, then win rate, then games). A different points rule is not built | Server | Reword: "ordered by the sport's configured keys" |
| **LB-3** every board shows all stats as columns | Must | Same; the columns follow the sport's schema | Both | Keep |
| **LB-4** the group admin chooses primary sort and tiebreaker | Decided | **Deferred.** The group uses the sport's order; a group's own order is a later ticket | Server | Change to "sport-configured now, group-configured later" (owner, 2026-11-23) |
| **LB-5** default all-time, any season | Must | All-time now; season with SE | Server | Keep |
| **LB-6** minimum games to appear | Should | In the sport's schema (`minGames`, single and pair); an entry below it is shown in statistics but not ranked | Server | Keep as sport-configured |
| **LB-7** no tiers | Must | Unchanged | | Keep |
| **LB-8** players can read both boards | Must | Group board: members. Region and country: every signed-in user | Server | Say who sees which board |
| **LB-9** standalone sessions show only a scoreboard | Proposed | **Replaced.** A standalone session still has its own scoreboard, and its games now also count in the player's personal statistics and, when verified, in region and country boards. They never count toward a group board | Server | Replace (the 2026-11-17 group-only decision is superseded by the 2026-11-23 one) |
| **SE-1 to SE-3** seasons | Group only | Unchanged in intent; not in this iteration; will filter the history by local date | Server | Keep |
| **KP-1 to KP-3** KPI and recap | Group only | Not in this iteration | | Keep |
| **AD-1 to AD-4** adjustments | Group admin | Not in this iteration; will add to the group board's counters, never to the history | | Keep |
| **GU-1 to GU-4** guests | Host adds guests | Not in this iteration. A game with a guest cannot be proposed as a ranking game and is not counted in any counter by default | | Add the sentence |
| **SH-1, SH-2** sharing cards | Should | Later; region and country boards show names only | | Keep |
| **NF-4** recalculation, no migration | Proposed | Holds through the stored history, not by recomputing on every read | | Reword with ST-5 |
| **NF-6** visibility | Proposed | Group statistics and board: members only. Region and country boards: every signed-in user. Personal and pair statistics: visible by default, a player can hide them (low priority). Deactivated players are dropped from boards, their name stays in history | | Replace |
| **Roles table** | No role rows for statistics | Propose: any player allowed to log. Confirm: a player named in the record. Refresh group board: owner or admin. View a board: see above | | Add the three rows |

## 3. Requirements to add to the BA document

| ID (suggested) | Requirement | Priority |
|---|---|---|
| GL-17 | A participant who joined the session can propose a record as a ranking game while the session is scheduled, ongoing, or completed (within 24 hours of its end). A game can be proposed before it has a score. The other players are notified | Must |
| GL-18 | A player named in the record confirms it once the score is complete (the first team ahead). When every player has confirmed its current content, the record is a ranking game. If the proposer is a player, their own confirmation is given with the proposal | Must |
| GL-19 | Changing a record (its players or content) makes the confirmations stale: the proposal stays and every player confirms the changed game again, and is told to. A record not confirmed by every player when the 24-hour window closes counts as a normal game | Must |
| ST-8 | Statistics are counted per session once its 24-hour window has closed; invalid records are ignored and the ignored ones are kept with a reason for the operator | Must |
| ST-9 | Personal statistics cover all the player's games in every session; the group statistics cover that group's sessions and are counted once more per group | Must |
| LB-10 | Region and country boards use ranking games only, counted for the region and country of the venue where the game was played, singles and pairs, for every player in the game wherever they live, visible to every signed-in user | Must |
| LB-11 | Ranks are calculated nightly and the board shows when. The group owner or admin can refresh the group board by hand, at most once an hour per sport; the app shows the countdown | Must |
| LB-12 | A board shows a player only while their account is active; a player who left a group is not on its board | Must |
| NF-9 | Statistics appear up to 24 hours after a session ends, plus up to a minute for the next scheduled pass | Proposed |
| NF-10 | What each session contributed to the statistics is kept permanently, so they can be recalculated if a rule changes; a player's own list of counted games shows the latest 500 | Proposed |

## 4. Decisions needing a BA answer

1. Is 24 hours the right window for verification (the same as editing), given statistics appear after it?
2. Should a record the players disagree on (one refuses) show that refusal, or is "not confirmed" enough? (The design has no refusal.)
3. A game counts on the board of the region and country of its venue, not of the player's. A player from another region who plays there is on that board. Right? (This also means a group of friends can appear on any region's board by playing there; see question 4.)
4. Region and country boards accept friends confirming each other's games, so they can be farmed. Is a later rule (a minimum number of different opponents) needed before the boards are public?
5. Head-to-head (ST-2) is not in the first statistics release. Acceptable?
6. A player's personal statistics are visible to others by default (low priority setting). Should the default be hidden?
7. Statistics for sessions finished before the release are counted when the feature starts (a one-off backlog). Wanted?
8. Does a player who left a group keep their statistics in it, hidden from its board?

## 5. Implementation log

Kept up to date as each ticket of the chain is built; each entry says what was built and what the BA text should now say.

*(Written 2026-11-23 at design approval; entries below, newest first.)*

**SESSION-53, the statistics engine (built 2026-11-23, session).** Once a session is completed and 24 hours have passed since it ended, the server counts its games on its own, checking every 5 minutes, so for a player the statistics appear a little more than a day after the session. For each player and sport it keeps the games, wins, losses and draws, the points scored and conceded (or whatever the sport counts), and the same numbers for each pair of partners; a player's own list of counted games holds the latest 500, newest first; and for a group session the group keeps the same numbers for each member over the games of its sessions. A **ranking game** (proposed and confirmed by every player) also counts at the **venue's** region and country for every player in it, wherever they live; a normal game counts for the players and the group only. Left out, with the reason kept for the session: a game with no score, a game the first team did not win (there are no draws yet, SESSION-59), a game that is not valid for the sport (a player twice, too many players on a side, a score outside the sport's rule), and a game naming a player who is no longer a joined participant. A session whose counting fails is tried again after 15 minutes, four times, then every 6 hours. The ranking itself (who is first) is not computed here: each board entry gets its sort values and its board is marked for the nightly ranking (SESSION-54). Nothing is visible in the app yet (SESSION-73 reads the numbers, CLIENT-SESSION-41 shows them). A sport's schema may now say which numbers it counts (SUM, MAX or MIN), its derived columns (win rate, win difference), whether partners get their own counters and how the ranking is sorted (at most three keys); a sport that says nothing gets the badminton defaults.

What the BA text should now say: ST-5 holds as written in section 3 (derived counters, never edited by hand; every counted game kept per session); NF-10 is met (what each session contributed is kept permanently, the player's list shows the latest 500); the latency is "a little over a day after the session" (the 24-hour guard plus at most a few minutes), not "after the nightly job"; a game the first team did not win is not counted until draws exist (SESSION-59), which the BA's "tie" rows should say.

**SESSION-72, ranking games: propose and confirm (built 2026-11-23, session).** A participant who joined a session can propose one of its games as a ranking game, and every player named in the game confirms it; when all have, it is a ranking game. The other players are notified when a game is proposed and again when a proposed game is changed. A confirmation covers the game as it was when confirmed: changing the game (its players or its score) makes everyone confirm it again, and the app shows how many have confirmed. A game can be set up from the moment the session is scheduled, even with no score yet (a *planned game*), and proposed then; confirming needs the score to be complete, with the first team ahead, so players confirm after the score is in. If the proposer is one of the players, proposing counts as their own confirmation. A game is open for proposing and changing until 24 hours after the session ends. No region is needed on anyone's profile to propose or confirm. Games can now be logged in a scheduled session (before, only ongoing or completed).

What the BA text should now say: GL-17 to GL-19 as updated in section 3 (a joined participant proposes; planned games before the start; confirmations go stale on a change). The statistics later ignore a game with no complete score, count a game with a score and no full confirmation as a normal game, and count a verified one on the board of its venue's region and country. **Confirm:** (a) a player's tap confirms the game as it is when the request runs, so a player can confirm a change made a moment earlier that they had not yet seen; the planned fix (confirm the version the player saw) is SESSION-RANKING-RECORD-1, is that acceptable until then? (b) a player who leaves the session after being named in a game: the statistics will ignore a game naming someone no longer in the session (to be built in SESSION-53), is that right?

**LOC-5, a venue knows its country and region (built 2026-11-23, location).** A venue gets a country and a region from its coordinates when it is created, and venues that already existed are linked once when the server first starts. It uses the offline boundary data (the same lookup the sign-up form uses), so no network call and no one types it. A venue with no coordinates, in open water, or in a country that is not set up yet (today only Vietnam is, and regions exist only for Vietnam) has none. A failed lookup never stops a venue from being saved.

What the BA text should now say: a game counts toward a region or country board only when its **venue** has that region or country, so a venue without coordinates, or outside Vietnam for now, never feeds those boards (the game still counts for the player and the group). The borders are simplified, so a venue within a few kilometres of a provincial border can land in the neighbouring province; the venue's region cannot be corrected by anyone yet. Confirm: is that acceptable for the first release, or must a venue's region be correctable (an admin tool) before the boards are public? Related decision 4 (section 4), farming, is unchanged.
