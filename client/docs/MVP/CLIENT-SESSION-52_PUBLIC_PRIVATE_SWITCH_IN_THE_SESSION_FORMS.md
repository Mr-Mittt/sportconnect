# CLIENT-SESSION-52 · The public / private switch in the create form and the Who section

**Status:** `DONE` (2026-11-18)
**Type:** New Feature · **Depends on:** SESSION-69
**Filed:** 2026-11-18, owner request (pair of SESSION-69).

**Create form.** A switch at the **left of the footer** (the "Create session" button stays on the right), **on by default** (public). A hint beside it, by state: on = "Everyone can see and ask to join your session"; off = "Except for your invitee, everyone cannot find and ask to join your session". When off, a warning line shows in the footer (amber, the text carries the meaning): "Only you and invited friends can see this session; everyone else won't be able to find it and join." It sends `isPublic`; flipping it counts as an entry for the "Leave without saving?" guard.

**Editing.** While the session is `PREPARING`, the host gets the same switch, hint and warning in the **Who** section's edit mode (placement proposed, next to "Who can join"), and the collapsed summary shows `Visibility: Public / Private`; `PUT` sends `isPublic` only when it changed. Not shown to anyone else, nor after `PREPARING`.

**Follows from SESSION-69:** the Share button is hidden for a private session (`session.isPublic === false`), as for a group one; `Session`, `CreateSessionPayload`, `UpdateSessionPayload` and every MSW session fixture gain `isPublic`; the `SESSION_VISIBILITY_CHANGED` system comment gets its en/vi text (`systemEntryText.ts`, the CLIENT-SESSION-51 pattern); the 403 `SESSION_FORBIDDEN` a stranger gets already has its copy. en/vi for every string; an I18N-4 census row.

**Out of scope:** a "Private" badge on cards or in the header, inviting after creation, anything for group sessions.

**Tests:** Vitest (default on, hint and warning per state, the payload, the edit only for the `PREPARING` host, Share hidden when private), a scoped e2e (create a private session and see the payload), stories. Baselines `create-session-{default, location-chosen, session-detail-ref}-*` (the footer) and `session-detail-preparing-*` (the Who summary) go into `BASELINE-UPDATE-1`.

---

## Implementation summary (2026-11-18)

**Design as approved** ("go ahead", 2026-11-18); the owner's wording is used for the two hints and the warning. Built as designed, with the points below.

**Built.**
- **`components/SessionVisibility.tsx`:** `SessionVisibilitySwitch` (the existing `Switch` with its `aria-label` "Public session", on = public, the whole row is the label, and the one-line hint follows the state) and `SessionVisibilityWarning` (amber, a `role="status"` line).
- **Create form (`CreateSessionModal`):** the footer is now a column: the warning (only while off) spans it, and below it a row with the switch and its hint at the **left** and "Create session" at the right. On by default; `isPublic` is always in the payload; flipping it counts as an entry for "Leave without saving?"; a sport change resets it with the rest of the form.
- **Who section (`SessionDetailSections`, `WhoFields`):** the same switch, hint and warning under the auto approve checkbox in the editor, only for a **standalone** session (a group session has none); the state lives in `useSessionWhoFields` (`isPublic`, `setIsPublic`), whose update payload carries `isPublic` **only when it changed**. The Who summary and the read-only "Session information" summary / rows show `Visibility: Public / Private` for a standalone session (added beyond the ticket's text, so a participant of a private session can see it is one).
- **Share button:** hidden when `session.isPublic` is false (`SessionDetailModal`).
- **Types and thread:** `Session.isPublic` (required), `isPublic?` on the create and update payloads, `SESSION_VISIBILITY_CHANGED` in `fieldChangeEntry.ts` (the labels read `Public` / `Private`; en/vi sentence "Alex changed the visibility from "Public" to "Private""), `enums.json` labels, 23 test and story `Session` literals got `isPublic: true`.
- **en/vi:** `session:create.visibility.*`, `session:detail.summary.{visibility,public,private}`, `enums:sessionVisibility`, the field label; I18N-4 census row.
- **MSW:** fixtures carry `isPublic` (true for the standalone ones, false for group ones); create and `PUT` keep it (a group session ignores it); the share handler refuses a private session; Discover omits a private one.

**Divergences and non-obvious points.**
- The warning spans the **footer** above the switch row, not beside the switch, so the long Vietnamese text never competes with the Create button for width.
- The visibility state is in `useSessionWhoFields` although the create form shows it in the footer: one hook for both forms, and a sport change resets it.
- A private session's 403 on open, join and the player list arrives through the existing session error dialog (CLIENT-ERR-7: `SESSION_FORBIDDEN` is a close-the-modal code); no new client copy was needed.

**Tests.**
- **Vitest:** new `SessionVisibility.test.tsx` (5), 8 cases in `CreateSessionModal.test.tsx` (default on, footer position, off shows the hint and warning, payload true/false, the leave guard, a sport change resets it, not in the Who section), 5 in `SessionDetailModal.test.tsx` (public to private saves `isPublic: false`, private to public, an untouched switch sends nothing, a group session has no switch, the summaries), 1 in `SessionDetailModalShare.test.tsx` (hidden when private), `useSessionWhoFields` (2), `fieldChangeEntry` (3, and the code count is 14). Wide scoped run (`src/features/session`, `notifications`, `shared`, `friends`, `home-feed`): **206 files, 2399 tests, all passed**. `tsc` clean for the app, the e2e project and the Keycloak theme; ESLint clean on all 42 changed and new files.
- **Mutation check: 14 of 14 mutants killed** against a passing baseline (the payload dropping it, the warning never shown, starting private, the leave guard, the sport-change reset, the update payload always or never sending it, the switch for a group session, the summary lines, the Share button for a private session, the hint not following the switch, the switch not reporting, the private label in the thread).
- **Storybook:** `SessionVisibility.stories.tsx` (public, private, warning, interactive), `CreateSessionModal` `PrivateSession`, `SessionDetailModal` `PrivateSession` and `PreparingWhoEditPrivate`. Not opened in a browser here.
- **E2E: `e2e` project, 39 tests in 9 spec files (the new `session-visibility.spec.ts` with 3, plus `session-share`, `session-errors`, `matches-journey`, `session-form-layout`, `session-results`, `session-thread-tags`, `home-feed-journey`, `notification-bell`): 31 passed, 8 failed.** Seven failures were 30-second timeouts inside the sign-in helper in `home-feed-journey` under the parallel load, and one was `matches-journey` step 8c (the Discover filters, never opens the session modal). An isolated re-run of `home-feed-journey` and `matches-journey` passed **11 of 11**, so they are parallel-load flakes, not regressions. **`matches-journey` 8c has now failed in both large runs of this session** (also in CLIENT-SESSION-49's) and passes alone: folded into HF-22 (owner decision, no new ticket). `E2E_OVERVIEW.md` has the new spec's section.
- **Visual-regression expectation (derived from the final diff, not run):** baselines `create-session-{default, location-chosen, session-detail-ref}-*` change (the footer) and `session-detail-{not-joined, discussion, cancelled, preparing}-*` and `session-results-section-*` change again (a `Visibility: Public` line in the summary; they already change for CLIENT-SESSION-49) at 375, 768 and 1280; the group-session states (`already-joined`, `invited`, `requested`, `approval-queue`), `create-session-no-sport-profiles-*` and every other baseline must come back byte-identical. Recorded in `BASELINE-UPDATE-1`; nothing was regenerated.
- **Not run:** a live check against a running server (the switch only through MSW; the server side through its integration tests), the full Vitest and e2e suites, the visual workflow.

**Release notes.** `CLIENT.md` Unreleased (the change, and a Depends on line: the server first or together).
