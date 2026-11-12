# CLIENT-SESSION-36 · Update the visual baselines for the session form sections

**Status:** `TODO`
**Type:** Testing · **Depends on:** CLIENT-SESSION-34 (pushed; its fixes up to `aa6e23d` are in) ·
**Filed:** 2026-11-12, at the CLIENT-SESSION-34 CI fix. **Standing ticket:** it stays open and collects the baselines each client ticket expects to change (add rows to the table below, with the ticket id); it is run and closed before the release, and a new baseline ticket is filed for the next one. Reason for filing: the ticket's own visual-regression expectation says these baselines change and wait for the `update-baselines` dispatch (a Windows host cannot render a valid baseline).

Apply the baselines CI regenerates for the surfaces CLIENT-SESSION-34 changed, in one pass, the way AUTH-19 did for its topic. The owner runs `client-visual` with `update-baselines=true` (Actions, client-visual, Run workflow; the visual diff left `client-ci` on 2026-11-12) on the branch after `aa6e23d`, downloads the `visual-baselines` artifact, and Claude applies it with `/updatebaseline`, which classifies every file by SHA-256 and shows the owner the set before anything is written.

Expected set (from the CLIENT-SESSION-34 expectation line and its spec files; verify at pickup against `git diff master...HEAD -- client/`):

| Baselines | Change |
|---|---|
| `create-session-default-*`, `create-session-location-chosen-*`, `create-session-session-detail-ref-*` at 375, 768, 1280 | changed: five collapsible sections, new fields, the "Create session" footer |
| `create-session-no-sport-profiles-*` | probably unchanged: the compact "add a sport first" view; confirm |
| `session-detail-{not-joined, already-joined, invited, requested, approval-queue, discussion, cancelled, preparing}-*` at 375, 768, 1280 | changed: collapsed sections with a `field: value` summary; `preparing` also gains the warning banner |
| `app-discover-panel` baselines | only if one contains a session card (cards now show game mood and the gender split); not listed by the ticket, check |
| every other baseline | byte-identical; a diff there is a regression, not an update |

**Edge cases:** an unexpected extra changed file stops the run and is reported, not applied. The artifact must come from a run after the last CLIENT-SESSION-34 commit, so it shows the final form (the untouched form closes without asking, and seeded defaults do not change what is drawn).

**Acceptance:** exactly the expected files changed or new; the `visual-regression` project of `client-ci` passes against the committed baselines; the "baselines pending" note in CLIENT-SESSION-34's summary becomes an Executed note and the clause is dropped from its backlog row and from `E2E_OVERVIEW.md` if it appears there.

**Out of scope:** regenerating on Windows; changing any spec; any new visual state (a scrolled or collapsed-section state is its own ticket).

**Tests:** none to write; the `visual-regression` run is the check.
