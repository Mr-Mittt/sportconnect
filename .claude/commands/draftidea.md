You are logging a new draft functionality idea for SportConnect into the running idea list. Arguments: $ARGUMENTS — an optional description of the idea. If no arguments are given, ask the user to describe it before continuing.

This is deliberately lower-ceremony than `/feature` — the goal is to capture an idea fast without losing it, not to scope it. Do not design, plan, or estimate the idea here; that's `/feature`'s job once an idea is promoted.

The list lives at `documentation/md/DRAFT_FUNCTIONALITY_IDEAS.md`. Create it (using the template already in that file, if it exists) only if it's genuinely missing.

---

## Step 1 — Read the existing list

Read `documentation/md/DRAFT_FUNCTIONALITY_IDEAS.md` in full. Note every existing `IDEA-<n>` entry's title, description, and status — you need all of them to check the new idea against, not just the most recent few.

## Step 2 — Get the idea

Use $ARGUMENTS if provided. Otherwise, ask the user to describe the idea in a sentence or two. Don't proceed past this step with a vague description — ask a follow-up if it's too thin to compare against existing entries meaningfully (e.g. one fragment word).

## Step 3 — Check for duplicates and conflicts

Compare the new idea against every existing entry (regardless of status — a `REJECTED` idea being re-proposed is exactly the kind of thing this check exists to catch). Look for:

- **Duplicate** — same idea, already logged (any status).
- **Overlap** — meaningfully related to an existing idea but not identical (e.g. a variant, a subset, or a natural extension).
- **Conflict** — contradicts or can't coexist with an existing idea as currently described.
- **None** — genuinely new, no relationship to anything logged.

Present this comparison to the user plainly before doing anything else: which case it is, and if it's not "none," quote the specific existing entry (`IDEA-<n>` and its title) so the user can see exactly what it's being compared against. Do not skip this even if you're confident it's a duplicate — show the evidence, let the user confirm the call.

## Step 4 — First confirmation gate

Ask the user how to proceed, based on Step 3's finding:
- **None found** → confirm they want to log it as a new entry.
- **Duplicate found** → confirm whether to skip logging (it's already there) or log it anyway as a distinct entry (their call, not yours — maybe it's deliberately a second angle on the same problem).
- **Overlap found** → confirm whether to log as a new entry, or fold it into the existing entry as an update instead.
- **Conflict found** → confirm whether to log it anyway (flagging the conflict explicitly in the entry text), update the conflicting entry, or drop it.

Do not proceed to Step 5 without an explicit answer here.

## Step 5 — Draft the entry

Based on Step 4's outcome, draft the exact text to add or change. New-entry format (append under `## Ideas`, replacing the `_(none logged yet)_` placeholder if that's still there):

```
### IDEA-<n> · <Short Title>
**Date added:** <today's date>
**Status:** `DRAFT`

<1–3 sentence description of the idea — what it is, not why it's good>

**Related entries:** <"None" — or "See IDEA-<m> (<relationship: duplicate/overlap/conflict/etc.>)">
```

`<n>` is one past the highest existing `IDEA-<n>` in the file (never reuse a number, even for a dropped idea). If Step 4 resulted in updating an existing entry instead of a new one, draft that diff instead — show the before/after, not just the after.

## Step 6 — Second confirmation gate

Show the user the **exact** text you're about to write (the full entry block, verbatim) and ask for explicit confirmation before touching the file. This is a separate, deliberate second gate from Step 4 — Step 4 confirmed the *decision* (log it / skip it / fold it), this confirms the *exact content*. Do not combine these into one prompt.

## Step 7 — Write and confirm

Append (or edit, if folding into an existing entry) `documentation/md/DRAFT_FUNCTIONALITY_IDEAS.md`. Tell the user: `Logged: IDEA-<n> · <Title> → documentation/md/DRAFT_FUNCTIONALITY_IDEAS.md`. Do not touch `PROGRESS.md` or any backlog file — a draft idea isn't decided work yet, so it doesn't belong in either until it's promoted via `/feature`.
