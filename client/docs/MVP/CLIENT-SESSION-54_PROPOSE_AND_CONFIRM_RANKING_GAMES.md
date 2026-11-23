# CLIENT-SESSION-54 · Propose a game as a ranking game, confirm it, and the "Add region" dialog

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-72
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`).

In the session's Result section and the record dialog: each record shows its ranking state (normal, proposed, verified, with who has confirmed), a **Propose as ranking game** action on a record with a complete score (when the sport has a score slot), and a **Confirm** action for a player named in a proposed record. A user without a region who taps Confirm gets the **Add region** dialog (country and region from the reference data, saved through the existing profile endpoint, then the confirmation is retried); proposing needs no region. The other players get a notification: new `NotificationType` `session.record.verification.requested` with its text and the route to the session (en and vi, CLIENT-NOTIF-4 rule). Editing a record clears the state and the screen says so. Coded errors from SESSION-72 get en and vi copy and an I18N-4 row.

**Out of scope:** statistics screens (CLIENT-SESSION-41), a refusal action (not designed).

**Tests:** Vitest for the state display, the actions, the dialog and the notification text; mutation check; a scoped e2e with MSW. Visual baselines: derive at pickup (the Result section and record dialog).
