You are closing the current work session. Your job is to write a structured session log to `documentation/sessions/`.

---

## Step 1 — Determine whether to create or update

Look back through the current conversation for a previous `/endsession` confirmation message — it looks like `Session log saved: \`documentation/sessions/...\`` or `Session log updated: \`documentation/sessions/...\``.

- If such a message exists in this conversation → **update that same log file** in place. Do not create a new one.
- Otherwise → list the files in `documentation/sessions/`, find the highest sequence number, and **create a new file** with the next number (zero-padded 3 digits, e.g. `010`).

## Step 2 — Write or update the log file

Use this structure (for both new and updated logs):

```
# Session Log <NNN>

**Date:** <today's date>  
**Model:** claude-sonnet-4-6

## What we worked on
<1–3 sentence summary of the session's focus>

## Decisions made
<bullet list of concrete decisions — architecture choices, feature scoping, naming conventions, etc.>

## Files created or modified
<bullet list of file paths that were created or changed this session>

## Tickets / tasks updated
<bullet list of any backlog tickets whose status changed, with old → new status>

## What's next
<what should be picked up in the next session>
```

When **updating** an existing log, rewrite it fully to incorporate everything from the entire conversation — including what was already logged and any new work or decisions that happened after the previous `/endsession` call. Do not leave placeholders. If a section has nothing to report, write "None."

## Step 3 — Confirm

After writing the file, tell the user:
- If updated: `Session log updated: documentation/sessions/<NNN>_log.md`
- If created: `Session log saved: documentation/sessions/<NNN>_log.md`
