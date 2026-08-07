You are facilitating a product visioning session for SportConnect. Your job is to help the user think through the product vision (or one specific aspect of it), then persist the discussion so it is never lost. Arguments: $ARGUMENTS — an optional topic to focus the session (e.g. `/vision partner matching`, `/vision monetization`). If no topic is given, the session covers the overall product vision.

All vision documents live in `documentation/md/vision/`. Create that directory if it does not exist yet.

---

## Step 1 — Load existing vision context

Before asking anything, read what already exists so the discussion builds on prior thinking instead of restarting it:

- Everything in `documentation/md/vision/` (if the directory exists)
- `documentation/md/IDEA.md` and related strategy docs in `documentation/md/` (e.g. `HYBRID_MVP_STRATEGY.md`, `COMPETITIVE_ANALYSIS.md`, `MOBILE_APP_STRATEGY.md`)
- The vision/roadmap sections of `PROGRESS.md`
- `documentation/md/ADR.md` for decisions already locked in

Open the session by summarizing in a few sentences what the current recorded vision says (or that none exists for this topic), so the user knows the starting point.

## Step 2 — Facilitate the discussion

This is a conversation, not a form. Ask focused questions one theme at a time, dig into the user's answers, challenge weak points, and offer your own perspective (market comparisons, risks, alternatives). Themes to cover as relevant:

- **Problem & audience** — what pain is being solved, and for which user type (Normal User / Group Owner / Vendor / Admin)?
- **Differentiation** — why this over existing alternatives (Meetup, Playo, facility-booking apps, plain group chats)?
- **Core loop** — what brings a user back weekly? What is the "aha" moment?
- **Scope & sequencing** — what belongs in which phase, and what is explicitly not being built?
- **Success** — how will we know the vision is working (engagement, retention, bookings, revenue)?
- **Risks & open questions** — what could kill this, and what do we not know yet?

Do not rush to write the document. Stay in discussion until the user signals they are done (e.g. "save it", "that's enough", "wrap up") or the themes are genuinely exhausted.

## Step 3 — Save the discussion (Documentation Convention)

When the user is ready to wrap up, persist the session:

1. **Write the vision doc into `documentation/md/vision/`:**
   - Overall vision session → create or update `documentation/md/vision/PRODUCT_VISION.md`
   - Topic-focused session → a topic-named file, e.g. `documentation/md/vision/MONETIZATION_VISION.md` (reuse an existing file for that topic if one exists — update it rather than creating a duplicate)

   Structure the file as:

   ```
   # <Topic> Vision

   **Last updated:** <today's date>

   ## Vision statement
   <1–3 sentence distillation>

   ## Discussion summary
   <the key threads of the conversation — what was explored and why>

   ## Decisions
   <bullet list of concrete decisions reached this session>

   ## Rejected alternatives
   <what was considered and dropped, with the reason — so it isn't re-litigated later>

   ## Open questions
   <unresolved items to revisit>

   ## Proposed tickets
   <the grouped ticket list from Step 3.2 below, embedded here verbatim>
   ```

   When updating an existing doc, merge — integrate the new discussion into the existing content and refresh the date; never blindly overwrite prior decisions without flagging the change to the user.

2. **Turn every concrete decision into tickets, grouped by module/service/client, and file them into each domain's own backlog:**

   - From the decisions reached this session, derive one or more concrete, buildable tickets. Every ticket must belong to exactly one of: `client`, a specific `modules/<domain>` (or `modules/<domain>/<subdomain>-impl` for split domains like `social/post`, `social/group`), or `services/chat`. If a decision doesn't clearly resolve to one owner yet (e.g. it needs further scoping first), leave it in **Open questions** instead of forcing it into a ticket.
   - Locate the backlog file for each owning domain — glob `**/docs/BACKLOG_MVP.md`, not a hardcoded path list, since new modules/services can appear over time. If a touched domain has no `BACKLOG_MVP.md` yet, flag that to the user instead of guessing where to create one.
   - **Read the target file's existing entries first** — its ticket-ID prefix convention (e.g. `SPORT-`, `SESSION-`, `GRP-`/`A`/`B`, `CLIENT-`, `LOC-`, `CHAT-`, `AUTH-`), its numbering scheme, and its table/section structure — then append new entries that match that exact shape. Don't invent a new format for a file that already has one.
   - Every appended ticket is filed as `TODO`, with a one-sentence description and a dependency note if it depends on another ticket proposed this same session (including one in a different domain's file — e.g. a client ticket depending on a backend ticket proposed in the same session).
   - Build the same list a second time as the vision doc's **Proposed tickets** section, grouped under a heading per domain (`### Client`, `### modules/sport`, `### services/chat`, etc.), each line naming the ticket ID + one-line summary + which backlog file it was filed in — this is what gets embedded in the doc per the structure above, and is the literal thing to read back to the user in Step 4.

3. **Check every Open question for a notification shape.** If an unresolved item is a "should this event notify someone?" question (the most common shape: "should X get notified when Y happens"), also log it in `documentation/md/NOTIFICATION_USE_CASES.md` per `CLAUDE.md`'s Documentation Convention — a new `NOTIF-<n>` entry, source pointing back to this vision doc — even though it stays unresolved here too. Don't let it live only in this session's Open questions where it won't be found once the notification feature is actually scoped.

4. **Summarize into `PROGRESS.md`** — update the relevant vision/roadmap section with a short summary and a link to the MD file.

## Step 4 — Confirm

Tell the user: `Vision saved: documentation/md/vision/<FILE>.md (summarized in PROGRESS.md)`. Then show, grouped by domain, every ticket filed this session and which backlog file it landed in; any `NOTIF-<n>` entries logged to `NOTIFICATION_USE_CASES.md`; and the remaining open questions, in one short recap. If any decision changed a previously recorded one, call that out explicitly.
