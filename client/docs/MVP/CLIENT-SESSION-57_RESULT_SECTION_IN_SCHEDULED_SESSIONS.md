# CLIENT-SESSION-57 · The Result section and dialog in a `SCHEDULED` session (games without a score before the start)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-72 (the server accepts records in a `SCHEDULED` session)
**Filed:** 2026-11-23, from the SESSION-72 pickup: the owner wants participants to be able to set up (and propose as ranking games) the games of a session before it starts.

Today the Result section is shown only for an `ONGOING` or `COMPLETED` session (`resultAccess.ts`, CLIENT-GL-38), and the dialog expects a score. After SESSION-72 the server also accepts records in a `SCHEDULED` session (status rule: `SCHEDULED`, `ONGOING`, or `COMPLETED` until `scheduledEndAt + 24h`; `PREPARING` stays closed).

- `getResultAccess` shows the section for `SCHEDULED` too (and keeps `PREPARING` hidden); the 24-hour window still ends at `scheduledEndAt + 24h`, so a scheduled session is editable from now until then.
- A game can be saved **without a score** in a `SCHEDULED` or `ONGOING` session (the teams only): the dialog's "a score is needed to save" rule, if any, is relaxed for those statuses, while the existing rule "a started score must be complete" stays. A game with no score is shown as planned (no winner mark: "the first team wins" is meaningless before play) and is not counted by the session scoreboard until a score is entered.
- The proposing action itself is CLIENT-SESSION-54; this ticket only opens the section and the no-score save in `SCHEDULED`.
- en and vi copy for every new string (the planned-game label and any status hint); the `SESSION_RECORD_NOT_LOGGABLE` copy ("only in an ongoing or completed session") is updated to the new rule in both languages.

**Out of scope:** the ranking actions and badges (CLIENT-SESSION-54), statistics (CLIENT-SESSION-41), what the server counts.

**Tests:** Vitest for `getResultAccess` per status and the no-score save; the `SessionResultSection` and dialog tests; mutation check; scoped e2e with MSW (a scheduled session shows the section and saves a game with no score); update `client/docs/E2E_OVERVIEW.md`. Visual baselines: derive at pickup (the Result section appears in a state it did not before).
