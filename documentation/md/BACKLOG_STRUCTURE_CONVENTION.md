# Backlog File Structure Convention

**Status:** Active convention, applies to every `BACKLOG_<VERSION>.md` in this repo
**Established:** 2026-08-18, retrofitted onto `client/docs/BACKLOG_MVP.md` as the reference case
**Applies to:** `client/docs/`, `infra/documentation/`, `services/chat/docs/`, and every
`modules/<domain>/docs/` or `modules/<domain>/<submodule>-impl/docs/`

---

## The problem this solves

A `BACKLOG_<VERSION>.md` that keeps every ticket's full write-up inline — design, what was built,
key decisions, deltas for later tickets — grows without bound as a module ships more tickets, and
nothing ever leaves the file (a `DONE` ticket's detail sticks around forever). `client/docs/BACKLOG_MVP.md`
hit this for real: by ticket #69 it was ~3,260 lines / ~100K tokens, past this tool's 25K-token
per-read cap — finding or updating a single ticket during pickup required a truncated read plus
follow-up greps just to locate the right section, on every single `/workon` invocation.

The fix isn't "write shorter tickets" — full detail is genuinely useful history. It's **separating
the index (small, changes rarely in shape) from the detail (large, append-only)** so a normal read
of the index costs a few hundred lines, not several thousand.

---

## Target shape

For a module with backlog file `<root>/docs/BACKLOG_<VERSION>.md`:

```
<root>/docs/
  BACKLOG_<VERSION>.md          # thin index — front matter, "How to use", cross-cutting notes,
                                 # Open table, Done table
  <VERSION>/                    # one file per ticket, full detail
    <TICKET-ID>_<SLUG>.md
    <TICKET-ID>_<SLUG>.md
    ...
```

Concretely, today: `client/docs/BACKLOG_MVP.md` + `client/docs/MVP/*.md`. The same shape applies to
`modules/notification/docs/BACKLOG_MVP.md` + `modules/notification/docs/MVP/*.md`,
`infra/documentation/BACKLOG_MVP.md` + `infra/documentation/MVP/*.md`, and so on — `<root>` is
whichever path `/workon`'s Phase 0b already derives for that module type (`client/docs/`,
`infra/documentation/`, `services/chat/docs/`, or `modules/<domain>/docs/`).

### The index file (`BACKLOG_<VERSION>.md`)

Keeps:
- Front matter (Version, Module, Last updated)
- "How to use this file"
- Any cross-cutting prose that isn't one ticket's story — a "Reality check" section, a
  "Dependencies" writeup explaining queue-ordering decisions across multiple tickets, a "Backend
  blockers" tracking table, an epic-doc pointer. This content stays here because it doesn't belong
  to a single ticket file.
- Two tables, **not** phase-grouped anymore (a phase grouping is itself something that belongs in
  ticket-detail history, not the live index):

  **Open (TODO / IN PROGRESS)** — curated dependency/priority order, exactly the same "pick the
  first row" mechanic `/workon` has always used. New tickets get inserted at the position that
  respects their real dependencies when filed — this section's *order* is still a human decision,
  it just isn't accompanied by the ticket's full text anymore.

  **Done** — sorted by completion date, most recent first. This is a changelog, not a queue; nothing
  reads it top-to-bottom to decide what to pick up next, so recency-first is the more useful read.

  Both tables: `| # | Ticket | Title | Status |`, where **Ticket** is a markdown link to the
  ticket's file in `<VERSION>/`.

### The ticket files (`<VERSION>/<TICKET-ID>_<SLUG>.md`)

One file per ticket — everything that used to be the inline `### TICKET-ID · Title` section:
Status/Type/Dependency/Filed line, Design, What was built, Key decisions, Out of scope,
Verification, and any "Deltas for later tickets" notes.

**Filename has no status in it — this is the one hard rule.** `TICKET-ID_SLUG.md`, stable for the
ticket's entire life. Two reasons:
1. **Every status change (TODO → IN PROGRESS → DONE) would otherwise mean a rename.** That churns
   git history and breaks every link into that file — the index row, `PROGRESS.md`, any other
   ticket that references it — unless every consumer re-derives the filename by globbing instead of
   using a fixed path.
2. **Status already lives in two places** (the index row, and the file's own `**Status:**` line) —
   putting it in the filename too makes three sources of truth for one fact, which is one more place
   for drift than necessary. Keep it at two.

---

## Version resolution

Backlog files are versioned (`BACKLOG_MVP.md`, `BACKLOG_V1.md`), so every command that touches one
takes a `<version>` argument. Typing it on every invocation is noise when the whole app is working
out of one version, so the version may be omitted and resolved instead.

**The declared current app version lives in `CLAUDE.md` § Current App Version** — one line, one
value, git-versioned, and already in context at the start of every session (so resolving it costs no
extra file read). That file is the single source of truth; this section owns the *rules*, not the
value. Do not duplicate the value here, in a command file, or in `.claude/settings.json` — a copy in
`settings.local.json` in particular would be per-machine, and "which version is this project on" is
a project-wide fact, not a per-developer one.

### The ladder

A command that takes a `<version>` resolves it in this order, stopping at the first step that
produces a real `BACKLOG_<VERSION>.md` for the already-resolved scope:

1. **An explicit `<version>` argument wins.** Always — the declared current version never overrides
   something the user typed.
2. **The declared current app version**, *if that backlog file exists for this scope.* The existence
   check is not optional (see below).
3. **The scope's only backlog**, if it has exactly one `BACKLOG_<VERSION>.md`.
4. **Ask.** Do not guess a neighbouring version, and do not invent a backlog file.

### Why step 2 is conditional

A flat "fall back to the current version" rule is correct only while every scope carries that
version. Today it does — all 12 backlogs have an `MVP` — but versions diverge as soon as modules
start finishing a version at different times. Flip the declared version to `V1` while
`modules/sport/sport-impl` still only has `BACKLOG_MVP.md`, and an unconditional fallback sends
`/workon sport` at a file that does not exist. Steps 3 and 4 are what make the divergence period
survivable, and they are the reason this is a ladder rather than a default.

### Announce the resolution

When a version was resolved rather than typed, say so in one line before acting on it:

```
No version given — using current app version MVP (modules/sport/sport-impl/docs/BACKLOG_MVP.md)
```

`/workon` writes code and flips ticket status and `/ticket` writes a new file; silently working
against the wrong backlog is expensive to unwind, and the resolved path is the cheapest possible
thing to show.

### Where the ladder applies

| Command | Version omitted |
|---|---|
| `/workon` | Ladder — it acts on exactly one backlog |
| `/ticket` | Ladder — it writes into exactly one backlog |
| `/list` | **Not the ladder** — keeps its own "report every version found, each as its own group" default |

`/list` is the deliberate exception. It is a read-only survey, listing more versions costs nothing,
and applying the ladder would *narrow* `/list client` from MVP + V1 down to MVP — losing information
in the one command whose entire job is to show you what is there.

---

## When to apply this

- **New module, new backlog file:** just start this way from ticket #1. There's no migration to do,
  and it costs nothing extra — `BACKLOG_MVP.md` stays a short index, `MVP/` gets its first file
  alongside the first ticket's close-out.
- **Existing flat-file backlog:** don't wait until it's 3,000 lines. A rough trigger: once a backlog
  is deep enough that you're scrolling past a lot of `DONE` history to find the open rows (rule of
  thumb, not a hard number — for reference, `client/docs/BACKLOG_MVP.md` had ~69 tickets before this
  became a real cost), retrofit it. Most modules' backlogs are nowhere near that yet
  (`modules/notification/docs/BACKLOG_MVP.md` is 4 tickets — leave it alone until it's actually a
  problem).

---

## Retrofitting an existing flat-file backlog

This is a mechanical split-and-relocate, not a rewrite — the goal is byte-for-byte preservation of
every ticket's existing text, just relocated. Do this with a script (Node, whatever's on hand), not
by hand-retyping a few thousand lines — retyping risks silently dropping or paraphrasing content,
and reading the whole file into an LLM's context first just to "rewrite" it defeats the point of the
exercise (that read is the exact cost this convention exists to avoid).

1. **Parse the ticket headers.** Every ticket section starts at `### TICKET-ID · Title` and runs to
   the line before the next `### ` header (or end of file for the last one). Watch for CRLF line
   endings (`\r`) breaking naive `^...$` regexes if the repo is checked out with Windows line
   endings — anchor around `\r?$`, not `$`.
2. **Find each ticket's status + completion date** from its own `**Status:**` line, for sorting the
   Done table later. The line's shape varies ticket to ticket (bare status, status + date, status +
   date + an inline file path in the same parens) — parse the status token and scan the rest of the
   line for a `YYYY-MM-DD` pattern separately, rather than assuming one rigid shape.
3. **Find existing per-ticket docs.** Many tickets already have a separate summary doc
   (`<root>/docs/<TICKET-ID>_<SLUG>.md`, per `/workon`'s Phase 6) sitting next to the backlog file —
   check for one by filename prefix before assuming a ticket needs a brand-new file.
4. **Write the ticket files:**
   - Ticket **with** an existing summary doc: move that doc into `<VERSION>/` (`git mv` or
     read+write+delete so history/blame follow it), then append the ticket's extracted backlog-index
     text to the end of it (verbatim, under a `---` separator) — don't try to intelligently merge
     the two write-ups into one narrative; a `---`-separated appendix is safe and lossless, editing
     it prettier later is a separate, non-urgent, zero-data-loss follow-up.
   - Ticket **without** one: the extracted text becomes the whole new file, with a synthesized
     `# TICKET-ID · Title` heading on top.
5. **Rebuild the index table** from the *original* Implementation Order table (not from the ticket
   sections) — the table's own wording is the human-curated version of each ticket's one-line
   summary; keep it verbatim, just drop the old phase-separator rows and the old `#` column, add the
   two-group split, and link each Ticket cell to its new file.
6. **Fix cross-references repo-wide.** Every file that pointed at the old flat path
   (`<root>/docs/<TICKET-ID>_<SLUG>.md`) needs the `<VERSION>/` segment inserted — `PROGRESS.md` is
   usually the biggest offender (one line per ticket close-out), but check module backlogs, session
   logs, and source-code comments too. This is a safe literal string substitution per moved
   filename (`<root>/docs/<file>` → `<root>/docs/<VERSION>/<file>`) — each filename is unique enough
   not to collide with anything else, so a straight find-and-replace across every tracked `.md`/code
   file is fine. Verify afterward with a repo-wide grep for the old pattern; it should come back
   empty.
7. **Verify nothing was lost:** every original `### ` header should map to exactly one file in
   `<VERSION>/`; every index-table link should resolve to a real file; the new index file's row
   count should equal the original ticket count.

---

## Known gap — closed

`.claude/commands/workon.md`'s Phase 6 (steps 2 and 4) and Phase 0b now branch on whichever shape a
module's backlog is actually in (a `<VERSION>/` subfolder next to the backlog file means
restructured; its absence means flat) — a fresh `/workon` run writes a restructured module's ticket
summary into `<root>/docs/<VERSION>/<TICKET_ID>_<TICKET_TITLE>.md` and moves its Open row into Done
sorted by completion date, rather than falling back to the old flat path. Closed in the same commit
that introduced this convention doc — this section is kept only as a pointer for anyone who reads an
older copy of this file and wonders whether the gap is still live.

---

## Reference implementation

Every module/service backlog in this repo is retrofitted onto this convention as of 2026-08-18:
`client/docs/BACKLOG_MVP.md` (`client/docs/MVP/`, 74 tickets — the original reference case), plus
`services/chat`, `infra/documentation`, and every `modules/<domain>/docs/` or
`modules/<domain>/<submodule>-impl/docs/` backlog (`modules/common`, `modules/location`,
`modules/notification`, `modules/auth`, `modules/sport/sport-impl`, `modules/user/user-impl`,
`modules/session`, `modules/social/post-impl`, `modules/social/group-impl`) — 11 backlogs total,
zero content loss, verified via link-resolution and header-count checks on every one. New backlogs
should start in this shape from ticket #1 (see "When to apply this" above) — there should be no flat
`BACKLOG_<VERSION>.md` left to retrofit going forward.
