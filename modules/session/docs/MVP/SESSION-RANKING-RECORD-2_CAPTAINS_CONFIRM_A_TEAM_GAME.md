# SESSION-RANKING-RECORD-2 · Team games: only the two captains confirm a ranking game (after the chain, badminton first)

**Status:** `TODO`
**Type:** Enhancement (extends SESSION-72) · **Depends on:** SESSION-72 (done). **Timing (owner, 2026-11-23): it waits until the whole statistic and ranking chain is finished** (SESSION-53, 73, 54 and the client tickets); the chain is built for badminton first, whose games every player confirms, so this is not needed for it
**Filed:** 2026-11-23, owner question at the end of SESSION-72: for a team sport with a captain per team, a game between two teams should need only the two captains to confirm, not every player.

Today (SESSION-72) `RecordFacts.players` is both the roster and the list of players who must confirm, so a ranking game is VERIFIED only when **every** player named in it has confirmed its current content. This ticket separates the two.

## What

- **`RecordFacts` gets `confirmers`**: the players whose confirmation is required. `players` stays the full roster (the statistics, SESSION-53, still count every player of a verified game).
- **The reader decides the confirmers.** The sport's schema gains a verification mode in `record.data`: `verification: "ALL_PLAYERS"` (the default, today's behaviour, so existing sports are unchanged) or `"CAPTAINS"`. For `CAPTAINS` each team of the record names its captain (`teams[].captain`, a user id). `CompetitiveRecordReader` validates it: the captain must be one of that team's players (a new invalid reason, for example `CAPTAIN_NOT_IN_TEAM`, and `CAPTAIN_MISSING` when the mode needs one); the confirmers are the two captains.
- **Four small edits where `players` is used as "who confirms"** (`SessionRecordServiceImpl`, `RecordRankingSupport`): VERIFIED means every confirmer has a confirmation at the current revision; the `session.record.verification_requested` notification goes to the other confirmers (the other players are not asked); the confirm endpoint's "named player" check becomes "named confirmer" (403 `SESSION_RECORD_VERIFY_NOT_A_PLAYER` keeps its code, the text and the docs say confirmer); the proposer is auto-confirmed when they are a confirmer and the game is rankable.
- **`ranking` DTO (additive):** gains `confirmers` (the expected user ids), so the client can show "1 of 2 captains confirmed"; `confirmedBy` keeps its meaning.
- **Unchanged:** the tables (no migration), `revision` and stale confirmations, the notification routing key, who may propose (a `JOINED` participant), the 24-hour window, the statistics.
- **Record schema contract** (`documentation/md/RECORD_SCHEMA_CONTRACT.md`) and the client's `recordSchema.ts` parser gain `verification` and `teams[].captain`; the client's own record dialog (a captain picker) is a client ticket, filed at this ticket's pickup together with the badge text ("captains confirm").

## Decide at pickup

- **Where the captain lives.** Proposed: a field on each team of the record (no new entity). A persistent team (a table of teams, members and a fixed captain, team leaderboards) is a much larger feature; if wanted it is its own design, not this ticket.
- **A captain who is not a player** is refused (the captain must be one of the team's players).
- **A captain who leaves the session** after being named: the game would have no confirmer on that side; proposed handling: the statistics ignore a game naming someone no longer `JOINED` (the SESSION-53 rule already planned), and a captain change is an ordinary edit (revision rises, confirmations stale).
- **The other players cannot dispute** (no refusal state is designed). If the BA wants one, it is a separate ticket.
- A sport with `CAPTAINS` and only one player a side: the captain is that player.

**Account lifecycle:** no new endpoint; the existing ones stay behind the per-request active gate and the notification still skips a deactivated confirmer. A deactivated captain makes the game unconfirmable, so it never becomes a ranking game (it counts as a normal game after the guard).

**Out of scope:** persistent teams, team leaderboards, a refusal state, the client picker and badge.

**Tests:** Spock for the reader (captain rules, the mode default, invalid shapes) and for the four edits; an integration test through the real endpoints (two captains confirm gives VERIFIED while the other players never confirm, a non-captain gets 403, a captain edit makes confirmations stale and asks the new captains, `ALL_PLAYERS` sports behave exactly as before); mutation check per rule; the shared fixture of valid and invalid records run by the client's Vitest and the server's Spock.
