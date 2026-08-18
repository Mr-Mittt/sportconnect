You are filing a new TODO ticket into a module's versioned backlog. Arguments: $ARGUMENTS (format:
"<module> <version> <short overview>", e.g. "session mvp add a reminder push notification 1 hour
before a session starts" — module and version can also be asked for interactively if omitted or
ambiguous).

This is heavier than `/draftidea` (which just captures an idea fast, no scoping) and lighter than
`/feature`/`/workon`'s Phase 1-4 (no codebase exploration, no implementation design — that happens
later, at pickup). This command's job is: clarify the requirement enough to write a real ticket, pick
a real ticket ID, and get it correctly filed — nothing more.

Work through the steps below in order. Gate on explicit user confirmation at every "Gate" — do not
skip ahead or write anything to disk before its gate is cleared.

---

## Step 1 — Parse input

Parse $ARGUMENTS into `module`, `version`, and `overview`. Ask for whatever is missing:
- No `module` → ask which module/service.
- No `version` → ask which version; if the module has exactly one `BACKLOG_<VERSION>.md`, suggest it
  as a default rather than making the user repeat something derivable.
- No `overview`, or an overview too thin to scope from (e.g. a two-word fragment) → ask for at least
  a sentence before continuing. Don't proceed on a vague overview the way `/draftidea` allows — this
  command produces a real ticket, not a placeholder.

## Step 2 — Resolve the backlog file and its shape

Same resolution `/workon` uses (Phase 0b) — keep this in sync if that logic ever changes there:

- `module` is `client` → `client/docs/BACKLOG_<VERSION>.md`
- `module` is `infra` → `infra/documentation/BACKLOG_<VERSION>.md`
- `module` is `chat` → `services/chat/docs/BACKLOG_<VERSION>.md`
- Otherwise, check both and use whichever exists:
  a. `modules/<module>/docs/BACKLOG_<VERSION>.md`
  b. `modules/*/<module>-impl/docs/BACKLOG_<VERSION>.md` (glob across domains, e.g. "group" →
     `modules/social/group-impl/docs/BACKLOG_MVP.md`)

If neither resolves to a real file, stop and ask the user to confirm the module name rather than
guessing a new path.

Read the backlog file in full. Determine its shape per
`documentation/md/BACKLOG_STRUCTURE_CONVENTION.md`:
- **Restructured** — a `<VERSION>/` subfolder sits next to the backlog file; the file itself is a
  thin index (**Open** table + **Done** table).
- **Flat** — one `## Tickets` section holding every ticket's full write-up inline, with an
  **Implementation Order** table above it.

Note every existing ticket ID and title in the file (both tables/sections, Open and Done) — needed
for Step 4's ID assignment and Step 3's duplicate check. If a sibling `BACKLOG_V1.md` (or other
version) exists for this module, skim its ticket IDs and titles too, just enough to catch a ticket
that's already filed there under a different version.

## Step 3 — Duplicate / overlap check

Compare the overview against every existing ticket you just read (any status, any version file) —
same spirit as `/draftidea` Step 3. Classify: **duplicate**, **overlap** (related but not identical —
a variant, subset, or natural extension), **conflict** (contradicts an existing ticket), or **none**.
Also check `documentation/md/DRAFT_FUNCTIONALITY_IDEAS.md` for a matching entry — if this ticket is
effectively promoting a draft idea, say so and ask whether to update that idea's status.

Present the finding plainly, quoting the specific existing ticket ID/title if it's not "none." Don't
skip this even if you're confident — show the evidence.

**Gate:** ask how to proceed based on the finding (file anyway as a distinct ticket / fold into the
existing one instead / skip). Do not continue to Step 4 without an explicit answer.

## Step 4 — Clarify the requirement

Ask the user questions until you have unambiguous answers to all of the following (same core
questions `/feature` Phase 1 and `/workon` Phase 1 use — reuse the answers directly if the user
already covered them in the overview, don't re-ask what's already unambiguous):

- **What** does this ticket do? (one-sentence summary)
- **Who** uses it? (Normal User / Group Owner / Vendor / Admin / dev-team-CI for infra)
- **Entry point** — where does this get triggered? (UI page, API call, background job, CI trigger)
- **Inputs and outputs**
- **Edge cases and error states**
- **Explicitly out of scope** for this ticket
- **Type** — Bug Fix / Enhancement / Enhancement (Security) / Enhancement (Architecture) / New
  Feature / Testing — match the vocabulary already used by other tickets in this same backlog file
  rather than inventing a new label
- **Depends on** — any other ticket (this module or cross-module) that must land first, or "none"
- **Why now / origin** — what prompted filing this (a bug found while working on X, a follow-up the
  user flagged, a design session, etc.) — this becomes the ticket's **Filed:** line, same as every
  existing ticket in this repo records why it exists, not just what

Apply the same standing cross-cutting checks the other planning commands apply, and fold the answers
into the ticket text rather than leaving them implicit:

- **Cross-domain concept precedent** — if a field in scope overlaps a concept another domain already
  treats as first-class (`sportId`, `groupId`, `userId`, etc.), don't scope it from this ticket's own
  fields alone. Grep how that concept is already gated elsewhere (e.g. `sport-api`'s
  `hasProfileForSport`) and note the precedent in the ticket, or explicitly note it still needs
  checking at pickup if you can't resolve it now.
- **Account lifecycle** (CLAUDE.md) — if this ticket adds a new authenticated endpoint, background
  job, or user-triggered cross-domain call, the edge-cases answer must cover a deactivated
  (`isActive = false`) caller explicitly. Don't assume the JWT filter already blocks them — it
  mostly doesn't yet (see CLAUDE.md, `modules/user/user-impl/docs/BACKLOG_MVP.md`'s U12).
- **Notification use case** (CLAUDE.md) — if clarifying this ticket surfaces a "should this event
  notify someone?" question that isn't resolved on the spot, it must be logged in
  `documentation/md/NOTIFICATION_USE_CASES.md` in addition to whatever this ticket does with it —
  don't leave it as a throwaway remark in conversation.

**Gate:** confirm the scope is correct before moving on.

## Step 5 — Assign the ticket ID

Determine the module's ID scheme from the existing tickets you read in Step 2 — don't assume a
scheme, derive it:
- A single consistent prefix (`LOC-`, `NTF-`, `SESSION-`, `CHAT-`, `INFRA-`, bare `U`, bare `C`, …) →
  next id = prefix + (highest existing number + 1).
- A dual `A`/`B` series (seen in `auth`, `sport`, `post-impl`, `group-impl`) where `A` tends to mean
  bug fix/enhancement and `B` tends to mean new feature → match this ticket's **Type** (from Step 4)
  to whichever series that split actually reflects in this file's own tickets, and take that series'
  highest number + 1. If only one series exists so far in this file, don't invent the other one
  without asking — continuing the existing series is the safer default.
- Anything else (a one-off id like `GROUP-RECUR-1`) → treat as module-specific noise, not a pattern
  to extend; fall back to the dominant scheme.

**Gate:** state the proposed ticket ID and the one-line reasoning for it, and get explicit
confirmation before using it — this avoids a collision with a ticket someone else is filing
concurrently, and the scheme-detection above is a heuristic, not guaranteed correct.

## Step 6 — Draft the ticket

Draft the full ticket file content. Match the shape already used by other filed-but-not-yet-built
tickets in this backlog (e.g. read one such existing `TODO` ticket in this same file/folder as a
style reference before drafting — field names and section headers vary slightly module to module,
follow local convention over a rigid template):

```
# <ID> · <Title>

**Status:** `TODO`
**Type:** <from Step 4>
**Depends on:** <ticket id(s), or "none">
**Filed:** <today's date>, <why now / origin, from Step 4>

<1-3 paragraphs: what it does, who uses it, entry point, inputs/outputs — the Step 4 answers written
as prose, not a Q&A transcript>

**Out of scope:** <from Step 4>

**Tests:** <expected coverage, if discussed — otherwise omit rather than pad>
```

Also draft the exact backlog-file edit:
- **Restructured** — the new row for the **Open** table (`| # | [<ID>](<VERSION>/<ID>_<SLUG>.md) |
  <Title> | \`TODO\` |`). Ask where in the Open queue it belongs (default: append at the end, unless
  Step 4's dependency answer justifies an earlier position) — Open order is a curated human decision,
  don't silently decide it. Renumber the `#` column if inserting mid-table.
- **Flat** — the new row for the **Implementation Order** table (same position question), plus the
  new `### <ID> · <Title>` section to append after the last existing ticket section in `## Tickets`
  (before any `## Removed / Deferred` section, if one exists).

**Gate:** show the user the exact ticket file content and the exact backlog diff (both, verbatim) and
get explicit confirmation before touching any file — same two-gate discipline `/draftidea` uses:
Step 3's gate confirmed the *decision* to file, this one confirms the *exact content*.

## Step 7 — Write

1. **Restructured** → create `<root>/docs/<VERSION>/<ID>_<SLUG>.md` with the drafted content; insert
   the new row into the Open table at the confirmed position, renumbering `#` as needed.
2. **Flat** → insert the new row into the Implementation Order table at the confirmed position,
   renumbering `#` as needed; append the new `### <ID> · Title` section per Step 6.
3. Do **not** touch `PROGRESS.md` — this ticket isn't built yet, so it doesn't belong there any more
   than a draft idea does (same reasoning as `/draftidea` Step 7). It gets a `PROGRESS.md` line when
   `/workon` or `/implement` closes it out, not now.
4. If Step 4 surfaced an unresolved notification use case, confirm it was actually appended to
   `documentation/md/NOTIFICATION_USE_CASES.md` before reporting done — don't let it silently drop.

Report: `Filed: <ID> · <Title> → <backlog file path>` (and the new ticket file path, if restructured).
Mention that `/workon <module> <version>` is how this ticket gets picked up and built later.
