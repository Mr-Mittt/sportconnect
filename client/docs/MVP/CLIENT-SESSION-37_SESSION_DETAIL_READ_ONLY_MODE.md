# CLIENT-SESSION-37 · Session detail read-only mode: one "Session information" section and a collapsed "Players" section; clearer auto-cancel line; upper-case status

**Status:** `DONE` (2026-11-12)
**Type:** Enhancement · **Depends on:** CLIENT-SESSION-34 (merged, #432) ·
**Filed:** 2026-11-12, owner request after CLIENT-SESSION-34: the detail modal now has sections in create and host-edit mode, and the view for everyone else repeats the same six sections, which is long to read.

## What

`SessionDetailModal` gets a third mode next to create and edit: **read-only**, for every case that is neither creation nor editable, i.e. the viewer is not the host, or the session is not `PREPARING` (editable = host and `PREPARING`). Create and host-edit mode do not change.

In read-only mode the body is two collapsible sections, both **collapsed by default**:

1. **Session information**: Overview, When, Where, Who, Cost and the sport's Session detail merged into one section. Collapsed, it shows a one-line summary in the same style as the summary line of a section in the other modes. Expanded, it lists every field as its own row (label and value in separate columns, as the other modes do when expanded), with no sub-groups and no per-section headings.
2. **Players** (the name stays "Players"): collapsed, it shows `Players: <the participants' avatars>`, the row the current Players section already shows; expanded, the participant list as it is today.

An expanded section uses the same bordered card as the sections in the other modes. Everything else in the modal is untouched: the header, the status, the `PREPARING` warning banner, the approval queue, the discussion and the Join / Leave / Cancel buttons.

## Two small changes that ride with it

- **Auto-cancel line.** A session that the system cancelled (no canceller, `cancelledBy = null`; SESSION-24's job for a `PREPARING` session that was never scheduled) reads **"Auto-cancelled on <time>"** instead of "Cancelled by unknown on <time>". The reason shown for it must be client copy keyed on that case, not the backend's English sentence (no server prose on screen, client i18n rule). A session cancelled by a person keeps "Cancelled by <name> on <time>" and its reason.
- **Status in upper case.** The session status label is drawn in upper case wherever it appears (the session card and the detail modal; census at pickup), by CSS, so the strings and the English-pinned tests do not change.

## Inputs and outputs, edge cases

No backend change: every field is already on `SessionResponse` and in the participants hook. A host viewing a `SCHEDULED`, `ONGOING`, `COMPLETED` or `CANCELLED` session sees the read-only mode, like any other viewer. The mode is chosen by the editable rule above, so a `PREPARING` session seen by a non-host is also read-only (with the banner). Loading and error states of the participants stay as they are. Auto-cancel and a cancel by a user who was later removed both have no name; they are told apart by the missing canceller id, which is to be confirmed at pickup against the `SessionResponse` fields the client has.

**i18n:** en and vi keys for the two section titles, the collapsed summary and the Players collapsed line, and the auto-cancel line and reason; no raw server text.

**Consumer census (at pickup):** `SessionDetailModal`, `SessionDetailSections`, `SessionAttributesSummary`, the session card, every spec and story that expects the old read sections or the status text (`session-detail-*` e2e and visual, `matches-journey`).

**Out of scope:** create mode and host edit mode; the approval queue and discussion; any new session field or backend change; the auto-cancel notification (NOTIF-7).

**Tests:** Vitest for the mode rule (every status and viewer combination, the host on a `SCHEDULED` session included), both sections collapsed by default and their summaries, the expanded rows, the auto-cancel line versus a named cancel, and the upper-case status; Storybook stories for read-only collapsed and expanded and for auto-cancelled; the existing detail e2e specs updated; the scoped `session-detail` e2e run. **Visual:** the `session-detail-*` baselines change again; add a row to the open `BASELINE-UPDATE-<n>` ticket (BASELINE-UPDATE-1 now), do not regenerate here.

## Implementation summary (2026-11-12)

**Design as approved.** The mode is `!canEdit` in `SessionDetailSections` (`canEdit` is host and `PREPARING`), and `readOnly` in `SessionDetailModal` is the same rule, so no new prop was needed. Pickup found that the old read view was six *static* blocks (`SessionFormSection collapsible={false}`: title and summary, no body), so "collapsed by default" is new behaviour, not a restyle.

**Built.**
- `InformationSection` (in `SessionDetailSections.tsx`): one collapsible `SessionFormSection`, closed by default. Collapsed: the flat `field: value` summary of all thirteen fixed fields plus the sport's session attributes. Expanded: one `ViewRow` per field, no sub-headings; the Location row keeps Get Directions and the address; the session attributes are flat rows from `buildAttributeSummary` (so a sport's attribute sub-groups, headings and chips are not shown in this mode, as asked: "just field"). One amber "Missing: ..." chip on the section.
- Players in read-only mode: the same `SessionFormSection`, closed by default; collapsed shows the capacity meter and `Players: <avatars>`, expanded the roster. The meter, status lines, avatar stack and roster were pulled out into small components used by both modes; the host's edit-mode Players section is unchanged.
- Auto-cancel: `cancelledBy === null && cancelledAt !== null` reads "Auto-cancelled on {{time}}", and its reason is client copy (`detail.autoCancelledReason`), never the server's English sentence. A person's cancel is unchanged.
- Status: `uppercase` class on the modal header span and the `SessionCard` span; strings and tests are unchanged.
- The static branch and the `collapsible` prop of `SessionFormSection` were deleted (nothing used them any more), with their tests.
- i18n (en and vi): `detail.information.title`, `detail.players.summaryLabel`, `detail.autoCancelledOn`, `detail.autoCancelledReason`.

**Deltas.** A `SCHEDULED` session's creator is a read-only viewer now (matches-journey step 3 was updated: the roster shows after opening Players). The `Cancelled` story needed `cancelledBy`, otherwise it reads as an auto-cancel.

**Tests.** `SessionDetailModal.test.tsx` 80 and the 24 files in `src/features/session/components` (375 tests) pass; `tsc -b` and eslint are clean. Five requirement mutations were killed (auto-cancel detection off, no `uppercase`, `readOnly` always false, Players open by default, Session information open by default). Stories: `ReadOnlyExpanded`, `AutoCancelled`; `Cancelled` fixed.

**E2E.** Scoped runs of `matches-journey`, `session-form-layout`, `home-feed-journey`, `notification-bell`, `session-errors`. First parallel runs had three timeouts or failures (`matches-journey` step 10c-2 near its 60 s limit; `notification-bell:76`; `session-errors:77`); each passed on rerun in isolation, and the two smaller specs also passed together a second time. Treated as load flakes, not regressions. The full `e2e` project was not run (scoped runs only, by repo rule). `E2E_OVERVIEW.md` step 3 updated.

**Visual-regression expectation.** Baselines `session-detail-{not-joined, already-joined, invited, requested, approval-queue, discussion, cancelled, preparing}-*` change (read-only layout and upper-case status; `preparing` only the status word), and the pages that show a session card probably change (upper-case status), recorded in `BASELINE-UPDATE-1`; every other baseline must come back byte-identical. Visual regression was not run here.
