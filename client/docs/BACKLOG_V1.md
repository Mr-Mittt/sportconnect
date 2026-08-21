# Client — V1 Feature Backlog

**Version:** V1
**Module:** `client`
**Last updated:** 2026-08-21
**Prerequisite:** MVP backlog (`client/docs/BACKLOG_MVP.md`) should be closed, or at least the ticket
that filed an entry here, before picking anything up.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon client v1` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | ANON-1 | Decide and scope anonymous/logged-out post viewing | `TODO` |
| 2 | I18N-1 | Introduce i18n / multi-language UI text support | `TODO` |
| 3 | ADMIN-3 | Replace the attribute-schema textarea with a real JSON editor — **deferred out of MVP 2026-08-21** mid-pickup; the tree-vs-text product question outranks the dependency choice | `TODO` |

**Chat (CHAT-2, CHAT-4) archived 2026-07-26** (user decision) — moved to
`documentation/md/archive/chat/CHAT-2_CHAT-4_CLIENT_TICKETS.md` pending a fresh chat re-plan.
`GroupChatTab.tsx` keeps shipping as GRP-1's local-state-only mock in the meantime.

---

## Tickets

### ANON-1 · Decide and scope anonymous/logged-out post viewing
**Status:** `TODO` · **Type:** Product decision (spans backend + client) · **Filed:** 2026-07-17,
during client ticket FEED-12

#### Origin

FEED-12 (`client/docs/BACKLOG_MVP.md`) adds a URL-addressable post route, `/posts/:postId`, so a
comment thread can be shared as a direct link. Today **every** route in this app sits behind
`ProtectedRoute` — there is no concept of public/anonymous viewing anywhere. An anonymous visitor
clicking a shared `/posts/:postId` link gets the same already-built behavior every other protected
deep link gets: redirected to `/login?redirect=/posts/123`, then bounced back after authenticating
(AUTH-8's step 7 already covers this exact mechanism generically). That's the correct MVP behavior —
`GET /api/posts/{postId}` requires a Bearer JWT today and isn't in `CLAUDE.md`'s public-endpoint
allowlist (`/api/auth/**`, `/api/sports/**`, `GET /api/users/**`) — but whether a shared post should
be viewable **without ever logging in**, the way Twitter/X or Instagram permalinks work, is a genuine
product question nobody has decided yet. This ticket exists to make that decision and scope the
resulting work — **it does not implement anything itself.**

#### Questions to resolve when picked up

1. Should any post be viewable without authentication at all? If yes, gated to `visibility: 'public'`
   only — `'friends'`/`'private'` posts must 404 (not 403) to an anonymous caller, so existence isn't
   leaked. (Note: `visibility: 'friends'` isn't actually enforced anywhere yet per `post-impl`'s own
   `CLAUDE.md` gotcha — "behaves like private" — so in practice this reduces to "public only" until
   that's built.)
2. Read-only (view post + comments, no like/comment controls) or a visible-but-disabled composer with
   a "log in to comment" prompt?
3. Scoped narrowly to single-post permalinks (this ticket's literal trigger), or does the same
   decision extend to public group pages / public profile pages? Recommend scoping narrowly first
   unless there's a clear reason to decide all three at once.
4. Rate-limiting / scraping exposure for a genuinely public, unauthenticated, user-generated-content
   endpoint — no precedent in this codebase; the only public endpoints today are auth, the sport
   catalog, and the user directory, none of which serve per-user content.

#### If the decision is "yes, allow it" — scope of the resulting work

**Backend:**
- A new unauthenticated-safe read path for `GET /api/posts/{postId}` and its `/comments` sibling (or
  relax the existing ones to `permitAll` with an explicit visibility filter inside the service layer —
  don't just flip the security config without the filter, that would leak private/friends posts).
- Update `auth-impl`'s `SecurityConfig` public-endpoint list and `CLAUDE.md`'s own documented list to
  match, so the next person reading either doesn't have to rediscover this.

**Client:**
- `/posts/:postId` needs to stop being unconditionally behind `ProtectedRoute` — likely a route-level
  variant that renders for both authenticated and anonymous callers, rather than a hard redirect.
- `CommentSection`/the composer need a distinct logged-out rendering (hide interactive controls, or a
  disabled state with a "log in to comment" CTA) — today every code path assumes an authenticated
  caller.
- `usePost`/`useComments` (FEED-12) need to tolerate an anonymous caller gracefully (no 401 spray) —
  worth designing FEED-12's version of these hooks with this in mind even before this ticket is
  scheduled, so it isn't a rework later.

#### Out of scope for this filing

- Any actual implementation — this ticket is the decision + scoping pass, not the build.
- Public group/profile pages — only in scope if the decision above explicitly extends there.

#### Tests

Not applicable yet — write these when the ticket is actually scoped into an implementation ticket.

---

### I18N-1 · Introduce i18n / multi-language UI text support
**Status:** `TODO` · **Type:** Infrastructure (Foundation) · **Filed:** 2026-07-21, raised during
GRP-2 scoping then deliberately deferred out of it — GRP-2 is scoped narrowly (Settings tab data
set), and app-wide i18n is a cross-cutting foundation change, not a per-tab feature.

#### Origin

Raised mid-GRP-2 as a "let's add localization" idea, then explicitly deferred by the user to its
own V1 ticket rather than bundled in. Nothing about *which* languages, *how much* of the app, or
*which library* was discussed yet — this ticket is unscoped and needs a proper Phase 1/2/3 pass
(same as any other ticket) when picked up, not just "add react-i18next."

#### Questions to resolve when picked up

1. Which language(s) beyond English, and is there a priority order (drives whether this is a
   single extra locale or a general N-locale framework from day one)?
2. Scope: whole app at once, or one page/feature first (e.g. Settings tab, since that's what
   prompted this) with the rest following incrementally?
3. Library choice — `react-i18next` is the common React default, but confirm against this repo's
   "no second [library category] without a conversation" convention (`client/CLAUDE.md`) before
   adding a new dependency category.
4. Where do translated strings live — JSON files per locale, a translation-management service, or
   something else? Who owns keeping them in sync as new UI copy ships?
5. Does this affect `client/CLAUDE.md`'s testing conventions (Vitest/RTL assertions currently match
   on literal English strings in many places) — a locale switch could break a lot of existing
   tests if not scoped carefully (e.g. test against `data-testid`/roles instead of text where i18n
   lands, or keep tests locale-pinned to English).
6. Any backend-side implication (e.g. does any user-facing string currently originate server-side,
   like validation messages surfaced verbatim) that also needs translation, or is this purely a
   client-rendered-text concern?

#### Out of scope for this filing

- Any actual implementation, library choice, or locale list — this ticket is unscoped, filed only
  to not lose the idea; scoping happens at pickup.

#### Tests

Not applicable yet — write these when the ticket is actually scoped into an implementation ticket.

---

### ADMIN-3 · Replace the attribute-schema textarea with a real JSON editor
**Status:** `TODO` · **Type:** Enhancement (dependency + code-splitting decision) ·
**Depends on:** `ADMIN-2` (`DONE`, 2026-08-21) · **Filed:** 2026-08-21 (client MVP) ·
**Deferred to V1:** 2026-08-21 — user decision, taken *during* the ticket's own `/workon` pickup
after the Phase 1 dependency comparison, before any code was written. Nothing was implemented.

#### Origin

Asked during ADMIN-2's wrap-up whether an existing JSON editor component could be used instead of
the plain textarea. **None exists** — the client has no JSON editor, no code editor, no syntax
highlighter and no form library, so this is a dependency decision rather than a component swap.
ADMIN-2 named this upgrade in its "Why a textarea, deliberately" section and deferred it.

Upgrade the attribute-schema editor on `/admin/sports/:sportId` from a plain `<textarea>` to a real
JSON editing surface, for an Admin editing a sport's A9 attribute schema. Input and output are
unchanged — the same document in, the same `PUT /api/sports/{sportId}/attribute-schema` out.

**What the textarea already does, so this ticket does not "add validation".** It parses with
`JSON.parse` locally and blocks submit *without firing a request* on failure, and it renders A9's
server-side validation messages verbatim. What it lacks is editing affordance: syntax highlighting,
bracket matching, auto-formatting, and error *positioning*. Today a malformed document yields
`Unexpected token } in JSON at position 214` — accurate and nearly useless, because nothing points
at line 12. That gap is the reason to do this, and it is the thing to measure the result against.

#### Why this was deferred rather than built

The pickup ran Phase 1 and stopped there. The blocking realisation: **the dependency choice is
downstream of an undecided product question** — who actually edits these schemas?

- An admin who **knows** the schema format wants line-positioned errors on a text surface. That is
  the ticket as written, and CodeMirror 6 answers it.
- An admin who **doesn't** know the format wants to see the structure and fill in blanks. That is
  the **structured field-by-field builder** — a different product direction, needing **zero** new
  dependencies, still unfiled.

Session 077's own open-questions list flagged exactly this ("ADMIN-3 vs the structured builder —
worth deciding *before* someone starts ADMIN-3"). Picking a dependency first would have quietly
answered the product question by implication. Deferred to decide it properly.

#### Dependency research already done (2026-08-21) — don't redo this

Verified against the npm registry and each project's own docs on 2026-08-21. Re-check versions at
pickup; the *reasoning* should still hold.

**CodeMirror 6** (`@uiw/react-codemirror` + `@codemirror/lang-json` + `@codemirror/lint`), ~150KB.

- Text surface. Fixes error positioning directly: `linter(jsonParseLinter())` + `lintGutter()` put a
  marker on the offending line instead of reporting a character offset.
- `foldGutter()` is included in `basicSetup` (verified in the `codemirror` package source), so
  structure-aware collapsing of objects/arrays comes free — **folding, not a tree view**. It covers
  *navigating* a large document; it does not cover *authoring without knowing the format*.
- Best design-system fit: theming is a JS object (`EditorView.theme({...})`) that takes our token
  values directly, and it ships no buttons/panels/menus to restyle.
- Best test-drivability under jsdom + RTL (needs `Range`/`getClientRects` polyfills in
  `src/test/setup.ts`), and maps cleanly onto the existing controlled `value`/`onChange` shape.

**vanilla-jsoneditor** (`josdejong/svelte-jsoneditor`) — **3.13.0, stable**, released 2026-07-24.

- Three modes: **tree · text · table**. Its text mode is *itself built on CodeMirror 6*, so this is
  not a rival to the option above — it is that option plus a tree view, `jsonrepair`, a Svelte
  runtime and its own CSS system.
- **Because text mode survives, choosing this does not delete the invalid-JSON path.** ADMIN-2's
  "blocks submit, fires no request" test stays meaningful and the paste-a-whole-schema workflow
  stays intact. This was the single most decisive finding of the comparison.
- Full editing maturity: cut/copy/paste, undo/redo, search/replace, keyboard navigation.
- `jsonrepair` built in — auto-repairs invalid JSON on load, accepted via `.acceptAutoRepair()`.
  Directly serves ADMIN-2's stated premise that the admin "expects to paste schemas around".
- Theming via `--jse-*` CSS variables plus a shipped dark theme (`jse-theme-dark.css`). This is the
  real cost: its own visual language, mapped onto our tokens through an adapter that can drift.
- ~400KB runtime (the 10.3MB npm `unpackedSize` is builds + sourcemaps, not what reaches the
  browser — measure the real gzipped cost after install rather than trusting either number).
- React usage is a functional wrapper around a class API — imperative, so the re-seed-on-query-
  resolve logic in `AttributeSchemaEditor` gets fiddlier than the current controlled shape.

**`@uiw/react-json-view`** — evaluated and **not recommended**, for two hard reasons:

- Its `latest` dist-tag resolves to **`2.0.0-alpha.43`**. v2 `alpha.1` shipped 2023-09-14 and
  alpha.43 on 2026-05-21 — ~2y8m and 43 alphas without promotion to stable. It is actively
  maintained, so this reads as maintainer release habit rather than instability, but `pnpm add`
  installing an alpha as the *sole authoring surface* for sport schemas is the wrong risk posture.
- Its own npm description is "**JSON viewer** for react", and the repo describes editing as still
  being added in v2.
- Takes a **JavaScript object**, not text — so a syntactically-invalid document is unreachable.
  Unlike vanilla-jsoneditor there is no text mode to fall back to, which means the parse-error UI
  and its two tests would be **deleted**, not kept. That makes it a scope change, not a swap.
- Would be a genuinely good *read-only inspector* alongside a text editor. That is two dependencies
  for one admin screen, and nobody has asked for it.

**Monaco** (`@monaco-editor/react`, ~2MB+) — excellent, wildly oversized for one admin screen, with
known web-worker friction under Vite. Not seriously considered.

#### The bundle constraint, and why this is bigger than a swap

`pnpm build` currently emits a **single** 1,263.40 kB chunk (gzip 364.15 kB) and Vite already warns
it exceeds 500 kB. There is **no code splitting anywhere in the client today** — verified at pickup:
no `React.lazy`, no dynamic `import()`, no `manualChunks` in `vite.config.ts`, and `src/router.tsx`
imports every page eagerly. Loading an editor eagerly would push that weight onto every member for
an admin-only route none of them can reach.

This ticket therefore has to lazy-load behind `/admin`, introducing the app's **first route-level
code splitting** — a deliberate architectural decision deserving its own scrutiny, not an incidental
side effect. Splitting the `/admin` route as a whole (rather than just the editor component) is
probably the better shape, since the whole area is admin-only, but that stays a pickup decision.

Note that once splitting exists, the 150KB-vs-400KB difference lands only on admins who open the
page — so bundle weight is a **weak** discriminator between the two real candidates, weaker than the
original filing implied. Design-system fit, test-drivability and scope discipline are the strong
axes.

#### Questions to resolve when picked up

1. **Which admin are we building for?** — the format-literate one (text editor) or the
   format-naive one (structured builder). Everything else follows from this. If the answer is the
   latter, file the builder and close this ticket rather than approximating it with a dependency.
2. Editor choice, if the answer to (1) keeps this ticket alive. On the research above,
   **vanilla-jsoneditor** is the recommendation *if* a tree view is wanted (it is both options at
   once), **CodeMirror 6** if a text surface is sufficient (lighter, better design-system fit).
3. Code-splitting shape — whole `/admin` route, just the editor component, or both layers nested.
4. How the "admin bundle is genuinely split" check is enforced — an automated post-build assertion
   that fails if the editor lands in the entry chunk, or a documented build-output number. The
   ticket's warning stands: lazy-loading silently regresses the first time someone imports the
   editor at module scope.
5. Whether to add a **Format** button (re-indent valid JSON via
   `JSON.stringify(JSON.parse(text), null, 2)`) — closes the named auto-formatting gap with zero new
   dependencies, and is worth doing *even if this ticket is otherwise dropped*.
6. If vanilla-jsoneditor is chosen: which mode the panel opens in by default, and confirm **table
   mode is disabled** (a schema document isn't tabular) and the **`ajv` validator stays unwired** —
   ADMIN-2's standing constraint is that A9's server is the authority on document validity, and
   reimplementing those rules client-side would drift.

#### This is a stack change and must be recorded as one

`client/CLAUDE.md` fixes the stack and says a genuine misfit is "a conversation, not a per-page
exception". Adding an editor dependency needs a line in that file explaining what it is for and why
the textarea was insufficient, so the next person doesn't read it as drift.

#### Out of scope

- **The structured field-by-field builder** — add/remove/reorder groups and attributes with per-field
  forms, and no JSON editing at all. Needs **zero** new dependencies. Still unfiled; filing it does
  not depend on this ticket, and doing this one does not commit to it. See question (1) above — the
  two are now explicitly in tension and should be decided together.
- Any change to A9's validation rules or messages — the server stays the authority on document
  validity (ADMIN-2's standing constraint).
- The member-facing renderer (`SPORT-2`), which renders fields from the schema and never edits JSON.
- The sport-fields half of the same panel, which is ordinary inputs and unaffected.

#### Tests

ADMIN-2's existing coverage must keep passing **unchanged** — specifically that invalid JSON blocks
submit and fires no request, that a server rejection renders verbatim, and the `admin-sports.spec.ts`
e2e cases. This is the ticket's main safety property: the swap changes affordance, not behavior, so a
test needing a rewrite is a signal something regressed.

Expect the *mechanics* of those tests to change even where the assertions do not. Note the current
unit tests drive the textarea with `userEvent.paste`, not `userEvent.type`, because `type` reads `{`
and `[` as key descriptors — whatever replaces the textarea needs its own equivalent workaround.

Add a check that the admin bundle is genuinely split — an assertion or a documented build-output
number — otherwise the lazy-loading silently regresses.

**Caveat carried from the research above:** this "assertions survive unchanged" property holds for
CodeMirror and for vanilla-jsoneditor (text mode keeps the invalid state reachable). It does **not**
hold for any object-based tree-only editor, where those tests must be deleted instead. If a future
pickup chooses one, that is a scope change and should be re-filed as such.
