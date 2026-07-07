You are picking up and completing the next ticket from a module's versioned backlog. Arguments: $ARGUMENTS (format: "<module> <version>", e.g. "group MVP").

Work through the phases below in order. Gate on user input between phases — do not skip ahead.

Some phases branch on whether `module` is `client` (the React app), `infra` (repo-level infrastructure: CI/CD, environments, deployment), or a backend module. For client tickets, `client/CLAUDE.md` is the source of truth for every convention — if this command and that file ever disagree, `client/CLAUDE.md` wins. For infra tickets, `infra/documentation/INFRASTRUCTURE_LAYOUT_AND_CICD.md` plays the same role.

---

## Phase 0 — Branch check

Before touching any files — including the backlog status edit in the next phase:

1. Run `git branch --show-current`.
2. If the current branch is `master`: create and check out a new branch for this ticket (e.g.
   `feature/<ticket-id>-<short-slug>` for code, `docs/<slug>` for doc-only work — match the naming
   already used in this repo's merged PRs).
3. If the current branch is anything else: **stop and ask the user which branch to work on.**
   Don't assume the current branch is the right one to build on, and don't silently create a new
   branch either — let the user decide (stay on this branch, branch off it, or switch elsewhere)
   before proceeding to Phase 0b.

---

## Phase 0b — Load the ticket

1. Parse $ARGUMENTS to extract `module` and `version`
2. Derive the backlog file path:
   - If `module` is `client` → `client/docs/BACKLOG_<VERSION>.md`
   - If `module` is `infra` → `infra/documentation/BACKLOG_<VERSION>.md`
   - Otherwise, check both of these and use whichever exists:
     a. `modules/<module>/docs/BACKLOG_<VERSION>.md` — domain-level backlog (e.g. "auth MVP" → `modules/auth/docs/BACKLOG_MVP.md`)
     b. `modules/*/<module>-impl/docs/BACKLOG_<VERSION>.md` — glob across domains for a `<module>-impl` submodule (e.g. "group MVP" → `modules/social/group-impl/docs/BACKLOG_MVP.md`, "sport MVP" → `modules/sport/sport-impl/docs/BACKLOG_MVP.md`)
3. Read the backlog file
4. Find the ticket to work on:
   - If any ticket is `IN PROGRESS` → resume that one
   - Otherwise → pick the first `TODO` ticket in the implementation order
5. If `module` is `client`: the backlog entry is a summary + queue position, not the spec. Read the full spec section in the epic doc the entry points to (`client/docs/sporthub-home-feed-tickets.md` or `client/docs/sporthub-auth-feed-integration-tickets.md`), **plus** any "Delta"/correction noted on the backlog entry itself and the backlog's "Reality check" section — where the epic doc and the backlog disagree, the backlog wins (it was verified against the backend later). Check the ticket's dependencies row too: some client tickets are hard-blocked on backend tickets (e.g. AUTH-3/AUTH-5 on auth backlog A2) — if the blocker hasn't shipped, stop and tell the user instead of building against a contract that's about to change.
6. Update that ticket's status from `TODO` to `IN PROGRESS` in the backlog file
7. State clearly: **"Working on: \<ticket-id\> · \<ticket-title\>"**

---

## Phase 1 — Clarify requirements

Ask the user questions until you have unambiguous answers to all of the following:

- **What** does this ticket do? (one-sentence summary)
- **Who** uses it? (Normal User / Group Owner / Vendor / Admin)
- **Entry point** — where does the user trigger this?
- **Inputs and outputs** — what data goes in, what comes out?
- **Edge cases and error states** — what can go wrong?
- **Explicitly out of scope** — what will NOT be built in this ticket?

For client tickets the epic spec usually already answers most of these (component API, behavior, acceptance criteria) — confirm the spec is still what the user wants and surface its listed open questions, rather than re-deriving from scratch.

For infra tickets, adapt the questions: "who" is the dev team/CI, "entry point" is the trigger (PR paths, manual dispatch, compose command), "inputs/outputs" are triggers → artifacts/checks/running services. The backlog entry + `INFRASTRUCTURE_LAYOUT_AND_CICD.md` are the spec; surface any blocked-on decisions (e.g. INFRA-3's hosting decision) and stop if unresolved rather than building on assumptions.

Do not proceed to Phase 2 until the user confirms the scope.

---

## Phase 2 — Explore the codebase

**Backend module:** explore to find:

- Existing services, repositories, and utilities to reuse in the relevant `*-api` and `*-impl` modules
- Which modules/domains this ticket touches
- Existing patterns for similar features
- Any cross-domain concerns — flag immediately if the ticket would require importing from another domain's `-impl` or creating a JPA relationship across domain boundaries

**Client:** explore to find:

- Re-read `client/CLAUDE.md` (conventions) and the relevant `design-reference-*.html` if the ticket has a visual surface
- What already exists in `src/shared/` and `src/features/` — reuse shared components (TopBar, NavTabs, SportSwitcher, shadcn primitives, stores, `apiClient`) instead of rebuilding per feature
- Whether the backend already serves this feature for real — check the actual controllers under `modules/`, not just docs; don't default to mock data for something with a real endpoint
- The exact backend DTO shapes for any endpoint this ticket calls (field names come from the Java DTOs, verified — never guessed)
- Existing Tailwind theme tokens — if the design needs a color/spacing that has no token yet, adding the token comes first

**Infra:** explore to find:

- Re-read `infra/documentation/INFRASTRUCTURE_LAYOUT_AND_CICD.md` (layout rules + platform decisions) and what already exists in `.github/workflows/` and `infra/`
- Verify against the real repo, not assumptions: what the Gradle/pnpm builds actually run, what the tests actually require (e.g. grep the Spock tests for real DB/Redis usage before adding service containers), actual ports/credentials/database names from `application-dev.yml` — never guess a config value a file already defines
- Placement check: artifact-scoped files belong in `client/`/`server/`, environment-scoped in `infra/`, workflows only in `.github/workflows/` (thin YAML, logic in `infra/scripts/`)

Surface findings as a short summary before designing. Confirm no surprises.

---

## Phase 3 — Design

**Backend module — monolith-first, microservice-ready. Non-negotiable constraints:**

- **Cross-domain calls through `-api` interfaces only** — never import from another domain's `-impl`
- **Cross-domain references are IDs only** — no JPA `@ManyToOne` across domain boundaries
- **No shared mutable state between domains**
- **Domain-scoped DB tables** — no cross-domain foreign keys
- **Service interfaces as contracts** — future network transport is a drop-in swap

Produce a concrete plan:
1. **Backend** — migrations, entities, DTOs, repository methods, service interface methods, service impl, controller endpoints, security config changes
2. **Cross-cutting** — changes to `common`, shared utilities
3. **Client impact** — if the change alters an API contract the client consumes, note which client ticket/hook is affected

**Client — non-negotiable constraints (from `client/CLAUDE.md`):**

- **Design tokens only** — never hardcode a hex value or arbitrary Tailwind color; add the token to the theme first
- **All data access through a `use<Feature>Data()` hook** — no direct `mockData.ts` imports, no `fetch`/axios in components; hooks return `{ data, isLoading, isError }`
- **Zustand owns client/UI state, TanStack Query owns server state** — never fetched data in Zustand, never loading/error flags outside the query
- **Components are presentational and controlled** — page components own shared state; build on shadcn/ui primitives restyled via tokens
- **Auth:** access token in memory only, refresh token in httpOnly cookie — never any token in `localStorage`/`sessionStorage`
- **A11y baseline:** keyboard reachable, visible focus, `aria-label` on icon-only buttons, color never the only state signal
- **No second styling system, test runner, or icon set** — the stack is fixed; a genuine misfit is a conversation, not a per-page exception

Produce a concrete plan:
1. **Types** — TS models, typed 1:1 against the real backend DTOs where a real endpoint exists
2. **Data layer** — hook(s), TanStack Query vs mock internals, MSW handlers if E2E touches this feature
3. **Components** — component APIs (props), which shadcn primitives, which visual states (each becomes a Storybook story)
4. **Page/state wiring** — what state lives where (page-local vs Zustand)
5. **Tests** — unit/component (Vitest+RTL), Storybook stories, E2E/visual-regression impact

**Infra — non-negotiable constraints (from `INFRASTRUCTURE_LAYOUT_AND_CICD.md`):**

- **GitHub Actions only** — no Jenkins, no second CI/CD system; GHCR for images
- **Placement rule** — artifact-scoped in `client/`/`server/`, environment-scoped in `infra/`, workflows in `.github/workflows/` with logic in `infra/scripts/`
- **No secrets in the repo** — GitHub secrets/environments/OIDC only; no long-lived cloud credentials anywhere
- **Don't add infrastructure the code doesn't need** (e.g. service containers for tests that mock everything)

Produce a concrete plan: workflow/compose file structure, triggers, steps, what can be verified locally vs only on GitHub (the latter becomes a documented conditional, HF-12-style), and doc updates.

Wait for explicit plan approval before proceeding to Phase 4.

---

## Phase 4 — Implement

**Backend module** — execute in this order to keep the codebase compilable at every step:

1. **Liquibase migration** — schema first; register in `db.changelog-master.xml`
2. **Entity** — in `*-impl`
3. **Repository** — in `*-impl`
4. **Service interface + DTOs** — in `*-api`
5. **Service implementation** — in `*-impl`
6. **Controller** — in `*-impl`; all responses wrapped in `ApiResponse<T>`
7. **Security config** — update endpoint mappings in `auth-impl` if needed
8. **Spock tests** — `src/test/groovy/` in `*-impl`; use `Mock()`, `@Subject`

**Client** — execute in this order:

1. **Types** — `src/features/<feature>/types.ts` (or shared types), strict mode
2. **Data layer** — the `use<Feature>Data()` hook; mock data or TanStack Query internals; MSW handlers under `e2e/mocks/` if in scope
3. **Components** — in `src/features/<feature>/components/` (or `src/shared/` for cross-page pieces), each with its `.stories.tsx` (one story per visual state) and `.test.tsx` alongside
4. **Page/state wiring** — `<Feature>Page.tsx`, Zustand store changes
5. **E2E / visual-regression specs** — under `e2e/flows/` / `e2e/visual/` if the ticket calls for them

Follow the folder structure in `client/CLAUDE.md` exactly — files named after their export, hooks `use`-prefixed.

**Infra** — execute in this order:

1. **Scripts** — anything nontrivial goes in `infra/scripts/`, not inline YAML
2. **Workflow / compose files** — `.github/workflows/` or `infra/` per the placement rule
3. **Docs** — usage instructions in `infra/documentation/`, referenced from the root README/CLAUDE.md where devs will look

---

## Phase 5 — Verify

**Backend module:**

1. Check for N+1 queries: scan any new/changed mapper or response-building method for a repository/service
   call inside a `.map()` over a `Page`/`List` or inside a `for` loop. If found, batch it (e.g. collect ids
   up front, call a `getXByIds(List<UUID>)`-style method once, then resolve each item from the returned map)
   before moving on.
2. Run the backend: `./gradlew :server:bootRun`
3. Run the module's tests: `./gradlew :<module>:<module>-impl:test`

**Client:**

The exact script names are defined by HF-00 and documented in the client `README.md` — read it (or `package.json` scripts) rather than assuming; the old CRA commands (`npm start`, CRA's `npm test`) are gone. Then:

1. Typecheck + unit/component tests (Vitest) — must pass
2. If components changed: open Storybook and confirm every new/changed visual state has a story and looks right against the reference HTML
3. If the ticket has E2E or visual-regression scope: run the relevant Playwright project (`e2e` and/or `visual-regression`)
4. Start the Vite dev server and walk the ticket's happy path in a browser
5. If the hook hits a real backend endpoint, verify once against the actually running backend (`./gradlew :server:bootRun`) — MSW passing is not proof the real contract matches

If HF-00 hasn't landed yet (no `package.json` in `client/`), the only valid ticket is HF-00 itself — flag it if anything else was picked.

**Infra:**

1. Verify everything that CAN be verified locally: compose files via `docker compose config` (and `up` if Docker is available), workflow YAML by careful review (or actionlint if installed), any referenced pnpm/gradle commands by actually running them locally
2. What can only be verified on GitHub (a workflow actually executing, required-check settings) is NOT a pass — record it explicitly as a conditional with the exact remaining steps, and keep or create the follow-up ticket (HF-12 pattern)

Report what was tested and whether it passed. Fix failures before moving on.

---

## Phase 6 — Document + close ticket

1. Document the code:
   - **Backend:** write/update the Javadoc for every new or changed public method, in both `-api` interfaces and `-impl` classes. Cover: purpose (what it does, one line), flow (the steps it takes, especially any cross-domain calls or batching), and highlight anything non-obvious (exception vs. fallback behavior, nullability, ordering guarantees, why it exists). Skip private helpers unless the logic is genuinely surprising.
   - **Client:** exported hooks and non-obvious component props get a short TSDoc comment (what it's for, anything surprising); don't Javadoc-style-document every prop the types already explain.
2. Write an implementation summary covering the Phase 3 design (the approved plan, restated — not just a link back to chat), what was built, key decisions, and non-obvious constraints. If what was built diverged from the approved design (e.g. a test premise broke, an edge case forced a different approach), say so explicitly rather than silently updating the design to match the outcome:
   - If `module` is `client` → `client/docs/<TICKET_ID>_<TICKET_TITLE>.md`
   - If `module` is `infra` → `infra/documentation/<TICKET_ID>_<TICKET_TITLE>.md`
   - Otherwise → `modules/<domain>/docs/<TICKET_ID>_<TICKET_TITLE>.md`
3. Add a one-line summary to `PROGRESS.md` under the relevant section
4. Update the ticket's status to `DONE` in the backlog file (`BACKLOG_<VERSION>.md`). For client tickets, if implementation revealed a correction to the epic spec (changed contract, resolved open question), note it on the backlog entry as a **Delta** so the next ticket doesn't trip on the stale spec.
