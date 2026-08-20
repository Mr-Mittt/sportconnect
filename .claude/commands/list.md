You are listing the open `TODO` tickets across SportConnect's versioned backlogs. Arguments:
$ARGUMENTS (format: `<module|service|client|all> <version>`, e.g. "session mvp", "client v1",
"all mvp" — both arguments are optional, see Step 1 for the defaults).

This command is **read-only and non-interactive**. It never writes a file, never asks a gate
question, and never reads an individual ticket's detail file — it reports what the backlog index
tables already say. Unlike `/ticket` (files a ticket) and `/workon` (picks one up and builds it),
nothing here changes state, so run it straight through and report.

---

## Step 1 — Parse input

Parse $ARGUMENTS into `scope` and `version`. Neither is required — both have a defined default, so
do **not** stop and ask for a missing argument:

- No `scope`, or `scope` is `all` → every backlog in the repo (Step 2's full discovery list).
- No `version` → **every version found for the selected scope**, each reported as its own group.
  `/list` shows the open TODOs from all versions; `/list client` reports client MVP *and* client V1,
  and a bare `/list` reports every version of every backlog in the repo.

`/list` is the one exception to the version-resolution ladder that `/workon` and `/ticket` follow
(`documentation/md/BACKLOG_STRUCTURE_CONVENTION.md` § **Version resolution**, which records this).
Those two act on exactly one backlog, so falling back to the current app version saves typing
without hiding anything. This command is a read-only survey, so an omitted version means *more*, not
less — falling back to the current app version here would drop real rows from the one command whose
whole job is showing you what is open.

Match `version` case-insensitively against the filename suffix (`mvp` → `BACKLOG_MVP.md`, `v1` →
`BACKLOG_V1.md`).

## Step 2 — Resolve the backlog files

Discover backlog files by glob rather than a hardcoded module list, so a newly added module shows up
without editing this command:

```
client/docs/BACKLOG_*.md
infra/documentation/BACKLOG_*.md
services/*/docs/BACKLOG_*.md
modules/*/docs/BACKLOG_*.md
modules/*/*-impl/docs/BACKLOG_*.md
```

(`documentation/md/BACKLOG_STRUCTURE_CONVENTION.md` is the convention doc, not a backlog — it is
outside every glob above; keep it that way if you ever widen them.)

When `scope` names a single module/service, resolve it the same way `/ticket` Step 2 and `/workon`
Phase 0b do — keep all three in sync if this logic ever changes:

- `client` → `client/docs/`
- `infra` → `infra/documentation/`
- `chat` → `services/chat/docs/`
- otherwise, whichever of these exists:
  a. `modules/<scope>/docs/`
  b. `modules/*/<scope>-impl/docs/` (glob across domains — e.g. `group` →
     `modules/social/group-impl/docs/`, `user` → `modules/user/user-impl/docs/`)

If a named scope resolves to nothing, don't guess a neighbouring path — report the name as unknown
and list the module names that *did* resolve, so the user can see the valid set. Note that some
domain folders hold no backlog of their own (`modules/social/docs/` has none — its backlogs live
under `group-impl` and `post-impl`), so the valid names are whatever the globs actually found.

## Step 3 — Extract the TODO rows

Read each resolved backlog file and pull the ticket rows out of its index table. Two shapes exist
(per `documentation/md/BACKLOG_STRUCTURE_CONVENTION.md`); handle both:

- **Restructured** — a `<VERSION>/` subfolder sits next to the file. Rows live under an
  **Open (TODO / IN PROGRESS)** table; ignore the **Done** table entirely. Two header variants are
  in use — a top-level `## Open (TODO / IN PROGRESS)` (most modules) and an `### Open (TODO / IN
  PROGRESS)` nested under `## Implementation Order` (`client/docs/BACKLOG_MVP.md`) — so match on the
  "Open" heading text, not on the heading level.
- **Flat** — one `## Implementation Order` table holding every ticket regardless of status, with the
  full write-ups inline under `## Tickets`. Filter by the table's own Status column here; there is no
  separate Open table to lean on.

From each row take: the `#` (queue position), the ticket ID, the title, the status, and the link
target if the Ticket cell is a markdown link (flat backlogs use a bare ID with no link — that's
expected, just omit the link for those).

Keep the Open table's existing row order. That order is a curated human dependency/priority decision
and is exactly what `/workon` consumes — re-sorting it (alphabetically, by ID number, by age) would
misrepresent which ticket is actually next.

Read only the index file. Do not open the per-ticket files in `<VERSION>/` to enrich rows with
Type/Depends-on/Filed — that is precisely the per-read cost the backlog-structure convention exists
to avoid, and it turns a cheap listing into dozens of reads.

## Step 4 — Report

Group by backlog file (module + version), in this order: the explicitly requested scope first if one
was named, otherwise modules with open TODOs first, then empty ones. Within a group, preserve the
table order from Step 3.

```
## TODO tickets — <scope>, <version>

### <module> · <VERSION>   (<n> TODO)
| # | Ticket | Title |
|---|---|---|
| 1 | [<ID>](<path/to/ticket.md>) | <title> |
...
```

Rules for the report:

- **The title line's `<version>` must say `all versions` when none was given** — that is the default
  case, and leaving it blank or guessing a single version misreports a listing that actually spans
  MVP and V1. Same for `<scope>`: `all backlogs` when no scope was named.
- **`IN PROGRESS` rows are not TODO rows.** They share the Open table but they aren't pickup
  candidates. List them under the group in a short separate line (`In progress: <ID> · <title>`)
  rather than folding them into the TODO table or dropping them silently — a half-built ticket is
  the single most useful thing to surface next to the queue.
- **Empty groups still get a line** (`<module> · <VERSION> — no open TODOs`). "This module has
  nothing open" is a real answer and is invisible if the group is omitted.
- **Titles in this repo's tables are sometimes long**, carrying inline bold rationale about queue
  position. Reproduce the title verbatim — don't paraphrase or truncate it; that rationale is often
  the reason a row sits where it does.
- **Close with a one-line total** (`<N> TODO tickets across <M> backlogs`), and the pointer that
  `/workon <module>` picks up the first row of a module's queue and `/ticket <module> <overview>`
  files a new one (both take an optional `<version>`; without one they use the current app version).

If a resolved backlog file has no recognizable index table at all (neither shape from Step 3), say so
for that file explicitly instead of reporting it as empty — an unparsed file and an empty queue look
identical in the output otherwise, and only one of them is fine.
