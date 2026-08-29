You are applying a CI-regenerated set of Playwright visual-regression baselines to the repo.
Arguments: $ARGUMENTS — the path to the `visual-baselines` artifact downloaded from the
`client-ci` workflow's `update-baselines` manual dispatch. It may be the `.zip` itself or an
already-extracted directory. If no path is given, ask for one before doing anything.

Background: `pnpm test:visual` cannot produce a valid baseline on a Windows dev host (the
documented font-rendering noise floor — see CLIENT-NOTIF-3 / HF-12..HF-20). The only correct
baseline is the one CI renders on Linux via `pnpm test:visual --update-snapshots` and uploads as
the `visual-baselines` artifact (whole `client/e2e/visual/__screenshots__/` directory). This
command takes that artifact, proves **only the expected baselines changed**, applies just those,
commits, pushes, updates the ticket's paperwork, and deletes the artifact.

Work through the phases in order. The only gate is Phase 3 — everything else runs straight
through once Phase 3 is clean.

---

## Phase 0 — Branch check

1. `git branch --show-current`.
2. Regenerated baselines belong with the ticket that changed the rendered surface. If the current
   branch is `master`: **stop** — ask which feature/`docs` branch this artifact is for and switch
   to it. If it is any other branch: assume it is the right one (it almost always is — you just
   built the ticket on it), but say which branch you are on in your first report line so the user
   can catch a wrong one.
3. `git status --porcelain` — if `client/e2e/visual/__screenshots__/` already has staged or
   unstaged changes, stop and show them; don't stack a second baseline change on top of an
   unresolved one.

---

## Phase 1 — Resolve and extract the artifact

1. Resolve `$ARGUMENTS` to an absolute path. Error out if it doesn't exist.
2. If it's a directory: use it directly as `ART_DIR`.
   If it's a `.zip`: extract to a fresh temp dir (the scratchpad dir, not `/tmp`) —
   `unzip -o "<zip>" -d "<ART_DIR>"`, or if `unzip` is unavailable,
   PowerShell `Expand-Archive -Path "<zip>" -DestinationPath "<ART_DIR>" -Force`.
3. Sanity-check `ART_DIR`: it must contain `*.png` files named like the committed set
   (`<surface>-<state>-<width>.png`), directly at its root (the workflow uploads the folder's
   contents, not a nested folder — if the PNGs are one level down, point `ART_DIR` at that level).
   If it contains no PNGs, or names that look nothing like `client/e2e/visual/__screenshots__/`'s,
   stop — wrong artifact.

---

## Phase 2 — Classify every baseline (SHA-256, not eyeballing)

Let `DEST = client/e2e/visual/__screenshots__/`. For every `.png` name present in `ART_DIR` ∪
`DEST`, compare `sha256sum` of the two files and bucket it:

| Bucket | Meaning |
|---|---|
| **CHANGED** | in both, hashes differ |
| **IDENTICAL** | in both, hashes equal |
| **NEW** | in `ART_DIR` only (a baseline this ticket adds — e.g. a new spec/state) |
| **MISSING** | in `DEST` only (absent from the artifact) |

Print a table: every CHANGED and NEW row by name, plus counts for IDENTICAL and MISSING.

**MISSING is always an error.** CI regenerates the whole directory, so a committed baseline
absent from the artifact means the artifact is stale/partial or a spec was deleted without its
baseline. Stop and report; never delete a committed baseline here.

---

## Phase 3 — Expectation check (the gate)

Work out which baselines *should* have changed, independent of the table above:

1. Read the current ticket's summary doc (the one `/workon` Phase 6 wrote — find it from the
   branch name / most recent `client/docs/**/<TICKET>*.md`). Its **"Visual-regression
   expectation"** line names the expected-changed baselines and the reason. If that line is
   missing, derive the expected set from `git diff master...HEAD -- client/` (which components /
   fixtures / MSW rows changed → which `<surface>` baselines they feed) and say you had to derive
   it.
2. Compare **expected set** vs the **CHANGED ∪ NEW** set from Phase 2:
   - **Exact match** → proceed to Phase 4 automatically.
   - **CHANGED contains extras** not in the expected set → **stop.** Those are either a real
     unintended visual regression that CI caught, or the artifact is from the wrong branch/run.
     Show the extras and ask the user whether to abort or proceed anyway.
   - **Expected baseline did NOT change** (still IDENTICAL) → **stop and ask.** Either the change
     didn't actually affect that render, or the artifact predates the code change.
   - Couldn't determine the expected set at all → show the CHANGED/NEW table and ask the user to
     confirm it's what they expect before continuing.

Every non-CHANGED baseline that was expected to stay put and did (IDENTICAL) is a good result —
it confirms the local Windows diffs on those were pure noise floor, exactly as HF-20 verified.

---

## Phase 4 — Eyeball the changes

`Read` (renders images) a representative CHANGED/NEW PNG per distinct `<surface>` — one breakpoint
is enough per surface. Confirm the intended change is visible (the new row / button / text /
dimension) and nothing unrelated drifted. Note what you saw. If a changed image looks wrong, stop.

---

## Phase 5 — Apply only what changed

Copy **only** the CHANGED and (user-approved) NEW PNGs from `ART_DIR` over `DEST` — never bulk-copy
the IDENTICAL ones (keeps the diff and the commit honest). Then `git add` those exact file paths
by name (not `git add -A`, not the whole directory).

`git status --porcelain client/e2e/visual/__screenshots__/` — the staged set must be exactly the
CHANGED+NEW list from Phase 2. If git shows more or fewer, stop and reconcile.

---

## Phase 6 — Commit and push

Commit the staged baselines only:

```
test(client): regenerate visual baselines for <TICKET-ID> (<N> files)

<one line: what rendered change caused these — e.g. "notification bell dropdown
grew from 5 to 7 rows (CLIENT-NOTIF-5)">

- <baseline-name-1>
- <baseline-name-2>
  …

SHA-256 verified against the committed set: exactly these <N> changed; the other
<M> baselines came back byte-identical (local Windows noise floor only).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: <this session URL>
```

Then `git push`. If the branch has no upstream yet, `git push -u origin <branch>`.

---

## Phase 7 — Close the paperwork

1. In the ticket's summary doc, replace the "visual baselines pending the `update-baselines`
   dispatch" caveat with an **Executed** note, HF-20 style: dispatch run, artifact applied,
   SHA-256 confirmed exactly the predicted N files changed, the rest byte-identical, plus the
   one-line human visual-check result from Phase 4.
2. If the backlog index row (`client/docs/BACKLOG_MVP.md`) mentions baselines pending, drop that
   clause from the row.
3. If `client/docs/E2E_OVERVIEW.md` carries a "still Windows-rendered, pending a dispatch" caveat
   for one of these surfaces, and Phase 2 proved it byte-identical, note it's now current.
4. One-line `PROGRESS.md` touch only if the ticket's entry explicitly flagged the baselines as a
   remaining step — flip it to done.

Stage and commit these doc edits (can be the same commit as Phase 6 if you haven't pushed yet, or
a follow-up `docs(client): …` commit) and push.

---

## Phase 8 — Clean up

Delete the input artifact — the `.zip` given in `$ARGUMENTS` **and** the temp `ART_DIR` you
extracted (skip the delete only if `$ARGUMENTS` was a directory the user clearly wants to keep).
Confirm both are gone.

---

## Report

- Branch, and the commit SHA(s) pushed.
- The CHANGED/NEW table (final), and the IDENTICAL/MISSING counts.
- Whether the changed set matched the ticket's stated expectation (and, if you had to derive the
  expectation, that you did).
- What the Phase 4 eyeball check showed.
- Confirmation the artifact + temp dir were deleted.
