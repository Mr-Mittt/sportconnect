# ADMIN-3 · Replace the attribute-schema textarea with a real JSON editor

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** `ADMIN-2` (`DONE`, 2026-08-21) ·
**Filed:** 2026-08-21 — asked directly during ADMIN-2's wrap-up whether an existing JSON editor
component could be used instead of the plain textarea. **None exists**: the client has no JSON
editor, no code editor, no syntax highlighter and no form library, so this is a dependency decision
rather than a component swap. ADMIN-2 named this upgrade in its "Why a textarea, deliberately"
section and deferred it; this is that follow-up.

Upgrade the attribute-schema editor on `/admin/sports/:sportId` from a plain `<textarea>` to a real
JSON editing surface, for an Admin editing a sport's A9 attribute schema. Input and output are
unchanged — the same document in, the same `PUT /api/sports/{sportId}/attribute-schema` out.

**What the textarea already does, so this ticket does not "add validation".** It parses with
`JSON.parse` locally and blocks submit *without firing a request* on failure, and it renders A9's
server-side validation messages verbatim. What it lacks is editing affordance: syntax highlighting,
bracket matching, auto-formatting, and error *positioning*. Today a malformed document yields
`Unexpected token } in JSON at position 214` — accurate and nearly useless, because nothing points
at line 12. That gap is the reason to do this, and it is the thing to measure the result against.

**Recommended: CodeMirror 6** (`@uiw/react-codemirror` + `@codemirror/lang-json`), ~150KB
minified — modular enough to pull only the JSON language, themeable to this app's design tokens,
with inline lint markers on the offending line. Alternatives weighed: **`vanilla-jsoneditor`**
(~400KB) offers a tree view and repair-on-paste but ships its own visual language that fights
shadcn/Tailwind, and is a Svelte component wrapped for React; **Monaco** (`@monaco-editor/react`,
~2MB+) is excellent and wildly oversized for one admin screen, with known web-worker friction under
Vite. Confirm the choice at pickup rather than treating the recommendation as settled.

**The bundle is the real constraint, and it makes this bigger than a swap.** `pnpm build` currently
emits a **single** 1,263.40 kB chunk (gzip 364.15 kB) and Vite already warns that it exceeds 500 kB.
There is **no code splitting anywhere in the client today** — no `React.lazy`, no dynamic `import()`,
no `manualChunks`. Loading an editor eagerly would push that weight onto every member for an
admin-only route none of them can reach. This ticket therefore has to lazy-load the editor behind
`/admin`, which means introducing the app's first route-level code splitting — a deliberate
architectural decision that deserves its own scrutiny, not an incidental side effect. Splitting the
`/admin` route as a whole (rather than just the editor component) is probably the better shape,
since the whole area is admin-only, but that is a pickup decision.

**This is a stack change and must be recorded as one.** `client/CLAUDE.md` fixes the stack and says a
genuine misfit is "a conversation, not a per-page exception". Adding an editor dependency needs a
line in that file explaining what it is for and why the textarea was insufficient, so the next person
doesn't read it as drift.

**Out of scope:**

- **The structured field-by-field builder** — add/remove/reorder groups and attributes with per-field
  forms, and no JSON editing at all. That is a genuinely different product direction, needs **zero**
  new dependencies, and is the version an admin unfamiliar with the schema format could actually
  use. ADMIN-2 also flags it as the natural follow-up. Still unfiled; filing it does not depend on
  this ticket, and doing this one does not commit to it.
- Any change to A9's validation rules or messages — the server stays the authority on document
  validity (ADMIN-2's standing constraint; reimplementing those rules client-side would drift).
- The member-facing renderer (`SPORT-2`), which renders fields from the schema and never edits JSON.
- The sport-fields half of the same panel, which is ordinary inputs and unaffected.

**Tests:** ADMIN-2's existing coverage must keep passing **unchanged** — specifically that invalid
JSON blocks submit and fires no request, that a server rejection renders verbatim, and the
`admin-sports.spec.ts` e2e cases. This is the ticket's main safety property: the swap changes
affordance, not behavior, so a test needing a rewrite is a signal something regressed. Selecting and
typing into the new editor will need different test-driving than `userEvent.paste` on a textarea, so
expect the *mechanics* of those tests to change even where the assertions do not. Add a check that
the admin bundle is genuinely split — an assertion or a documented build-output number — otherwise
the lazy-loading silently regresses the first time someone imports the editor at module scope.
