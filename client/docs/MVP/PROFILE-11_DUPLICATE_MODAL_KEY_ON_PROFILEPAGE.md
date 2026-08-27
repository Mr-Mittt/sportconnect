# PROFILE-11 · Duplicate React key on `ProfilePage`'s `EditProfileModal`/`AddSportModal`

**Status:** `DONE` (2026-08-28) · **Type:** Bug fix · **Depends on:** none ·
**Filed:** 2026-08-27, found during `PROFILE-9`'s live browser QA pass

## What ships

`ProfilePage.tsx` keys `EditProfileModal` with `editProfileOpenCount` (line 263) and `AddSportModal`
with `addSportOpenCount` (line 296) — both siblings under the same parent, both counters declared as
`useState(0)` (lines 97/99). Until either modal has been opened once this session, both elements share
the literal key `"0"`, firing a real, reproducible React console warning on every `/profile` load:

```
Warning: Encountered two children with the same key, `0`. Keys should be unique so that components
maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or
omitted — the behavior is unsupported and could change in a future version.
  at main
  at ProfilePage (...)
```

This is the exact same bug class `FEED-9`'s QA pass already found and fixed in
`GroupsPage.tsx` (`CreateGroupModal`/`AddSportModal` both keyed from a counter starting at `0`) —
functionally harmless (React still reconciles the two different component types correctly; confirmed
via `read_page`'s accessibility-tree snapshot showing no actual duplicated DOM), but a genuine,
reproducible dev-console warning that should be namespaced the same way `GroupsPage.tsx` was fixed:
`` `edit-profile-${editProfileOpenCount}` `` / `` `add-sport-${addSportOpenCount}` ``.

## Explicitly out of scope

Any other console warning already flagged and deferred elsewhere in this backlog (e.g.
`DialogOverlay`'s `React.forwardRef` warning, pre-existing since `FEED-2`) — this ticket is scoped to
the one new collision found this session.

## Tests

Vitest: a targeted case (or extend an existing `ProfilePage.test.tsx` case) asserting no
"duplicate key" console warning fires on initial mount, mirroring however `GroupsPage`'s own fix was
verified.

---

## Implementation summary (2026-08-28)

**Fixed as specced** — `ProfilePage.tsx`'s `EditProfileModal`/`AddSportModal` keys namespaced:

```diff
- key={editProfileOpenCount}
+ key={`edit-profile-${editProfileOpenCount}`}
```
```diff
- key={addSportOpenCount}
+ key={`add-sport-${addSportOpenCount}`}
```

**Delta from the ticket's own "Tests" section — a committed Vitest console-spy case was tried and
abandoned, not shipped.** A test was written spying on `console.error` and asserting no "duplicate
key" warning after mount. Rigor check before trusting it: temporarily reverted the fix (bare
`useState` counters as keys) and re-ran the test in isolation (`-t` filtered to just that case, so no
other test in the file rendered `ProfilePage` first) — **it still passed with the bug present**,
meaning the assertion wasn't actually exercising the failure path in this test environment (jsdom via
Vitest). The real, reliable evidence instead came from a live browser re-verification: loaded
`/profile` in a real Chrome tab (real backend, both `EditProfileModal` and the auto-opened
`AddSportModal` mounted together, same conditions that reproduced the warning during `PROFILE-9`'s
original QA pass) and confirmed via `read_console_messages` that the "Encountered two children with
the same key" warning no longer appears — only the pre-existing, already-flagged `DialogOverlay`
ref-forwarding warning remains. Reproduced this clean result across two separate page loads. No
automated regression test exists for this specific fix as a result — the same gap `FEED-9`'s own
analogous fix left (it was also verified via a live before/after capture, not a committed test).

**Verification:** `tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings in
`SessionStartTimePicker.tsx`), full Vitest suite green (153 files, 1029 tests, no regressions — net
unchanged from `PROFILE-9`'s baseline since the attempted regression test was added and then removed
in the same session), live browser re-verification as described above.
