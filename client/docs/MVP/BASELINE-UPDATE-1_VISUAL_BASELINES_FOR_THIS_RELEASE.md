# BASELINE-UPDATE-1 · Update the visual baselines for this release

**Status:** `TODO`
**Type:** Testing · **Depends on:** CLIENT-SESSION-34 (merged, #432), SESSION-49 (open PR, its client part) ·
**Filed:** 2026-11-12 as CLIENT-SESSION-36, renamed BASELINE-UPDATE-1 the same day. Origin: the CLIENT-SESSION-34 CI fix; that ticket's own visual-regression expectation says these baselines change and wait for a regenerate (a Windows host cannot render a valid baseline).

## What this ticket is (standing ticket)

Visual regression no longer runs per PR: it is the manual workflow `client-visual` (the diff left `client-ci` on 2026-11-12). So a client ticket that changes a baselined surface does **not** regenerate anything; it adds the baselines it expects to change to the table below, with its ticket id and the reason. This ticket stays open while the release is built. **Before the release:** the owner runs `client-visual` with `update-baselines=true` (Actions, client-visual, Run workflow, pick the branch), downloads the `visual-baselines` artifact, and Claude applies it with `/updatebaseline`, which classifies every file by SHA-256 and shows the owner the set before anything is written. Then this ticket is closed (an Executed note, HF-20 style) and **`BASELINE-UPDATE-2` is filed for the next release**.

## Expected changes (add a row per ticket)

| Baselines | Ticket | Change |
|---|---|---|
| `create-session-default-*`, `create-session-location-chosen-*`, `create-session-session-detail-ref-*` at 375, 768, 1280 | CLIENT-SESSION-34 | changed: five collapsible sections, new fields, the "Create session" footer |
| the same three sets | SESSION-49 (client part, `94b854c`) | changed again: the title is required, so the field is pre-filled with the default "{first name}'s session" (`create.titleField.default`) and has the required mark and an error line (`create.validation.title`); the Overview summary shows it |
| `create-session-no-sport-profiles-*` | CLIENT-SESSION-34, SESSION-49 | probably unchanged: the compact "add a sport first" view has no title field; confirm |
| `session-detail-{not-joined, already-joined, invited, requested, approval-queue, discussion, cancelled, preparing}-*` at 375, 768, 1280 | CLIENT-SESSION-34 | changed: collapsed sections with a `field: value` summary; `preparing` also gains the warning banner |
| `session-detail-*` (any whose fixture has no title) | SESSION-49 | probably unchanged: the fixtures have titles; confirm |
| `app-discover-panel` baselines | CLIENT-SESSION-34 | only if one contains a session card (cards now show game mood and the gender split); not listed by the ticket, check |
| `session-detail-{not-joined, already-joined, invited, requested, approval-queue, discussion, cancelled}-*` at 375, 768, 1280 | CLIENT-SESSION-37 | changed again: read-only mode (everything but the host of a `PREPARING` session) is one collapsed "Session information" section plus a collapsed "Players" section instead of six static blocks and an open roster; the status word is upper case |
| `session-detail-preparing-*` | CLIENT-SESSION-37 | changed: only the status word (upper case); the host edit mode is untouched |
| `home-feed-*`, `discover-modal-{default, time-popover, location-popover}-*`, `discover-panel-{default, multi-date, load-more}-*`, `discover-requested-*`, `discover-panel-*-popover-*` | CLIENT-SESSION-37 | probably changed: the session card's status word is upper case; only the ones whose page shows a session card (confirm: `discover-panel-empty-*`, `discover-modal-empty-*` and a home feed without sessions are unchanged) |
| none | CLIENT-NOTIF-6 | no change: the sockets and the shared refresh draw nothing (no component or string changed) |
| every other baseline | all | byte-identical; a diff there is a regression, not an update |

The SESSION-49 row comes from its diff (locale strings, the pre-filled title, the MSW handlers), not from a rendered comparison: nothing was rendered for it. `/updatebaseline` Phase 3 derives the real set from `git diff master...HEAD -- client/` and shows it to the owner.

## Edge cases

An unexpected extra changed file stops the run and is reported, not applied. The artifact must come from a run on the final branch state, after the last ticket of the release is in.

## Acceptance

Exactly the expected files changed or new; the `client-visual` diff run passes against the committed baselines; the "baselines pending" note in each listed ticket's summary becomes an Executed note and the clause is dropped from its backlog row and from `E2E_OVERVIEW.md` if it appears there; `BASELINE-UPDATE-2` is filed.

**Out of scope:** regenerating on Windows; changing any spec; a new visual state (a scrolled or collapsed-section state is its own ticket).

**Tests:** none to write; the `client-visual` run is the check.
