You are picking up and completing the next ticket from a module's versioned backlog. Arguments: $ARGUMENTS (format: "<module> [version]", e.g. "group MVP" — `version` is optional and falls back to the current app version, see Phase 0b step 1).

Work through the phases below in order. Gate on user input between phases — do not skip ahead.

Some phases branch on whether `module` is `client` (the React app), `infra` (repo-level infrastructure: CI/CD, environments, deployment), `chat` (the Go chat service under `services/chat/`), or a backend module. For client tickets, `client/CLAUDE.md` is the source of truth for every convention — if this command and that file ever disagree, `client/CLAUDE.md` wins. For infra tickets, `infra/documentation/INFRASTRUCTURE_LAYOUT_AND_CICD.md` plays the same role. For chat tickets, `services/chat/CLAUDE.md` plays the same role.

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

1. Parse $ARGUMENTS to extract `module` and `version`. `version` is optional — if it is missing,
   resolve it with the ladder in `documentation/md/BACKLOG_STRUCTURE_CONVENTION.md` §
   **Version resolution**: an explicit argument wins; otherwise the current app version declared in
   `CLAUDE.md` § Current App Version **if that backlog file exists for this module**; otherwise the
   module's only `BACKLOG_<VERSION>.md` if it has exactly one; otherwise ask. Resolving the
   version needs the module's docs folder, so apply step 2's path rules to find that folder first,
   then check which `BACKLOG_<VERSION>.md` files actually exist in it. Never assume the
   declared version exists for a module without checking — that check is the whole point of the
   ladder. When the version was resolved rather than typed, say so in one line before acting on it
   (`No version given — using current app version MVP (<resolved path>)`); this command flips ticket
   status and writes code, so working against the wrong backlog is expensive to unwind.
2. Derive the backlog file path:
   - If `module` is `client` → `client/docs/BACKLOG_<VERSION>.md`
   - If `module` is `infra` → `infra/documentation/BACKLOG_<VERSION>.md`
   - If `module` is `chat` → `services/chat/docs/BACKLOG_<VERSION>.md`
   - Otherwise, check both of these and use whichever exists:
     a. `modules/<module>/docs/BACKLOG_<VERSION>.md` — domain-level backlog (e.g. "auth MVP" → `modules/auth/docs/BACKLOG_MVP.md`)
     b. `modules/*/<module>-impl/docs/BACKLOG_<VERSION>.md` — glob across domains for a `<module>-impl` submodule (e.g. "group MVP" → `modules/social/group-impl/docs/BACKLOG_MVP.md`, "sport MVP" → `modules/sport/sport-impl/docs/BACKLOG_MVP.md`)
3. Read the backlog file. Two possible shapes — check which one this module uses before assuming:
   - **Restructured** (per `documentation/md/BACKLOG_STRUCTURE_CONVENTION.md`): a `<VERSION>/`
     subfolder sits next to the backlog file (e.g. `client/docs/MVP/`). The backlog file itself is
     just a thin index — an **Open (TODO / IN PROGRESS)** table (curated order) and a **Done** table
     (sorted by completion date). Each row links to that ticket's full detail in `<VERSION>/`.
   - **Flat** (the older, not-yet-retrofitted shape — still the common case for smaller module
     backlogs): one `## Tickets` section holding every ticket's full write-up inline, ordered
     top-to-bottom as the pick-up queue.
4. Find the ticket to work on:
   - If any ticket is `IN PROGRESS` → resume that one (restructured: top of the Open table; flat:
     scan the Implementation Order table)
   - Otherwise → pick the first `TODO` ticket in the implementation order (restructured: first row
     of the Open table; flat: first `TODO` row in the Implementation Order table)
   - Restructured shape only: open that row's linked file in `<VERSION>/` for the ticket's actual
     spec/deltas — the index row itself is just a title + status, not the ticket.
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

For backend module tickets: if a field in scope overlaps a concept another domain already treats as first-class (e.g. `sportId`, `groupId`, `userId`), don't answer scoping/validation questions from this domain's own fields alone — do Phase 2's cross-domain concept precedent check (below) *before* locking in the answer, not after. (Concrete miss this rule exists to prevent: a "favorite locations, filter by sport" ticket was scoped with a bare `sportId` filter, with no connection to the fact that "sport" already means "a sport the user holds an active `UserSportProfile` for" everywhere else it's used as a gate — e.g. `GroupServiceImpl.createGroup`'s `hasProfileForSport` check. The precedent existed in the codebase the whole time; it just wasn't checked before proposing scope.)

For backend module tickets, also apply the **account lifecycle check** (CLAUDE.md's Account
lifecycle rule): if this ticket adds any new authenticated endpoint, background job, or
user-triggered cross-domain call, the edge-cases answer must explicitly cover what happens when
the caller is a deactivated (`isActive = false`) user. Don't assume the JWT filter or
`SecurityConfig` already blocks them — today it doesn't (see CLAUDE.md and
`modules/user/user-impl/docs/BACKLOG_MVP.md`'s U12 for the current known gaps). If the ticket is
security-sensitive, plan an explicit `isActive` check via `UserService` rather than inheriting the
existing gap.

**Client-visible enum or event type check** (CLIENT-NOTIF-4), for tickets in any module: if this
ticket adds or extends something the client branches on — a new notification routing key, a new
value in an enum the client mirrors (`commentType`, `postType`, a status), a new event type — then
the client's case belongs in this change or in a ticket filed alongside it. Decide which and say so;
don't leave it unstated. The client hand-mirrors ~15 backend enums and nothing structurally links
them, so a backend-only change ships a silent display gap. Two shipped this way before anyone
noticed: CLIENT-NOTIF-3 (`session.status.started` / `session.participant.left` rendering the generic
"You have a new notification" from launch) and CLIENT-SESSION-13 (system comments rendering as if
the session creator had typed them). `post-impl` B7, `group-impl` B21 and `user-impl` U13 will each
introduce more.

Note the client's own compile-time guard covers only half of this: `NotificationType` is an
exhaustive union, so adding a member without a `getNotificationText` case fails the build — but
nothing forces anyone to add the member in the first place. That gap is what this check exists for.

### Scope-change gate — always ask before Phase 2

A ticket's scope can shift between when it was filed and when it's picked up — a new requirement
gets realized, or something originally in scope turns out not to belong. So once the questions
above are answered, **always ask the user explicitly, in these words:**

> **"Do you want to add or remove anything to this ticket before we move to Phase 2?"**

If the user adds or removes anything:

1. **Write the change into the ticket itself first** — its `<VERSION>/` file (restructured) or its
   inline section (flat). Add/edit the affected requirement, acceptance criterion, or
   **Out of scope** bullet, and mark it as a scope change with the date and a one-line why (same
   spirit as a **Delta**). Don't leave the change living only in this conversation — the ticket is
   the record.
2. **Re-run Phase 1 against the revised scope** — every question above (What / Who / Entry point /
   Inputs & outputs / Edge cases / Out of scope), *plus* the cross-domain concept-precedent check,
   the account-lifecycle check, and the client-visible enum/event-type check. A late addition can
   newly trip any of them even if the original scope didn't.
3. **Ask the add/remove question again.** Repeat this loop until the user answers that there's
   nothing more to change.

Only once the user explicitly confirms there is nothing to add or remove is the scope locked.

Do not proceed to Phase 2 until the user confirms the scope.

---

## Phase 2 — Explore the codebase

**Backend module:** explore to find:

- Existing services, repositories, and utilities to reuse in the relevant `*-api` and `*-impl` modules
- Which modules/domains this ticket touches
- Existing patterns for similar features
- Any cross-domain concerns — flag immediately if the ticket would require importing from another domain's `-impl` or creating a JPA relationship across domain boundaries
- **Cross-domain concept precedent** — if this ticket's fields overlap a concept another domain already treats as first-class (`sportId`, `groupId`, `userId`, etc.), grep for that concept's existing `-api` interface usages across every module (e.g. `sport-api`'s `hasProfileForSport`, `getSportsByIds`) to find established validation/business-rule precedent, not just structural import violations — a new consumer of an existing concept should match how existing consumers already gate/validate it unless there's a real reason to diverge
- **Account lifecycle** — check whether the endpoint(s)/service method(s) this ticket adds need an explicit `isActive` check (via `UserService`), rather than assuming the existing JWT filter or `SecurityConfig` already excludes deactivated users — confirm against `JwtAuthenticationFilter` (auth-impl) directly, don't assume it re-checks active status just because it validates the token
- **Consumer census (CLAUDE.md § API Change Discipline)** — if this ticket changes anything about an *existing* contract (a REST endpoint's path/params/body/status/**auth**, a cross-module `-api` method signature *or its documented semantics like "active-only"*, a shared DTO field, a DB column/constraint), enumerate every consumer **before** designing: `grep` all backend modules for callers, check `client/src` + `client/e2e/mocks` (MSW) + `*.test.tsx` for the path and any mirrored type, and for a DB change check entities/repositories/JPQL. List each consumer as **compatible as-is** / **updated in this change** / **deferred with a filed ticket** — never "probably fine". Re-run this if the scope grows in Phase 1's gate. (A20's `getUserProfiles(UUID)` census is why `SessionServiceImpl.discoverSessions` and `GroupServiceImpl.getGroupIdsBySportProfiles` weren't silently broken by adding an inactive-including overload.)

**Client:** explore to find:

- Re-read `client/CLAUDE.md` (conventions) and the relevant `design-reference-*.html` if the ticket has a visual surface
- What already exists in `src/shared/` and `src/features/` — reuse shared components (TopBar, NavTabs, SportSwitcher, shadcn primitives, stores, `apiClient`) instead of rebuilding per feature
- Whether the backend already serves this feature for real — check the actual controllers under `modules/`, not just docs; don't default to mock data for something with a real endpoint
- The exact backend DTO shapes for any endpoint this ticket calls (field names come from the Java DTOs, verified — never guessed)
- Existing Tailwind theme tokens — if the design needs a color/spacing that has no token yet, adding the token comes first
- **Consumer census (CLAUDE.md § API Change Discipline)** — if this ticket changes a shared type, a hook's public shape, or a store slice other features read, `grep` `src/` for every importer and list each as compatible / updated-here / deferred before redesigning it

**Infra:** explore to find:

- Re-read `infra/documentation/INFRASTRUCTURE_LAYOUT_AND_CICD.md` (layout rules + platform decisions) and what already exists in `.github/workflows/` and `infra/`
- Verify against the real repo, not assumptions: what the Gradle/pnpm builds actually run, what the tests actually require (e.g. grep the Spock tests for real DB/Redis usage before adding service containers), actual ports/credentials/database names from `application-dev.yml` — never guess a config value a file already defines
- Placement check: artifact-scoped files belong in `client/`/`server/`, environment-scoped in `infra/`, workflows only in `.github/workflows/` (thin YAML, logic in `infra/scripts/`)

**Chat service (Go):** explore to find:

- Re-read `services/chat/CLAUDE.md` (conventions) and `services/chat/docs/SYNC_DESIGN.md` (the sync contract with the monolith) if the ticket touches cross-service data
- What already exists under `internal/` — reuse existing packages (`conversation`, `message`, `sync`, `ws`, `api`) rather than adding a new one for something that fits an existing domain concern
- Whether the ticket needs new data from the monolith — if so, it needs a new event type + publish site (Java side) and a cache table, not a synchronous call at request time (see `SYNC_DESIGN.md`)

Surface findings as a short summary before designing. Confirm no surprises.

---

## Phase 3 — Design

**Backend module — monolith-first, microservice-ready. Non-negotiable constraints:**

- **Cross-domain calls through `-api` interfaces only** — never import from another domain's `-impl`
- **Cross-domain references are IDs only** — no JPA `@ManyToOne` across domain boundaries
- **No shared mutable state between domains**
- **Domain-scoped DB tables** — no cross-domain foreign keys
- **Service interfaces as contracts** — future network transport is a drop-in swap
- **Deactivated users get no further interaction** — any new authenticated endpoint or service method must explicitly reject a caller whose `isActive` is `false`, unless it's read-only data already public without auth (see CLAUDE.md's Account lifecycle rule)

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

**Chat service — non-negotiable constraints (from `services/chat/CLAUDE.md`):**

- **Client reaches this service directly** — never route a new endpoint through Spring as a gateway
- **Authorization reads the local sync cache only** (`group_members_cache`/`friendships_cache`/`user_profiles_cache`) — never a live call to the monolith at request time; new data needs a new event + publish site instead (see `docs/SYNC_DESIGN.md`)
- **Packages by domain concern, not technical layer** — extend an existing `internal/` package before adding a new one
- **No web framework, ORM, or DI container** — stdlib `net/http` + `pgx` + plain constructor wiring in `cmd/chat/main.go`; a real need for one is a conversation, not a per-ticket exception

Produce a concrete plan: which package(s) change, new/changed HTTP or WS endpoints, any new event type + Java-side publish site + cache table needed, migration if the schema changes.

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

**Chat service** — execute in this order:

1. **Migration** — `services/chat/migrations/`, next sequential number, `golang-migrate` up/down pair
2. **Domain/repository code** — under the relevant `internal/<package>/`
3. **API handler + route registration** — `internal/api/`
4. **Tests** — co-located `_test.go`, `testify` assertions

---

## Phase 5 — Verify

**Backend module:**

1. Check for N+1 queries: scan any new/changed mapper or response-building method for a repository/service
   call inside a `.map()` over a `Page`/`List` or inside a `for` loop. If found, batch it (e.g. collect ids
   up front, call a `getXByIds(List<UUID>)`-style method once, then resolve each item from the returned map)
   before moving on.
2. Run the backend: `./gradlew :server:bootRun`
3. Run the module's tests: `./gradlew :<module>:<module>-impl:test`
4. **Always run `./gradlew :server:test` too — never skip this, even if step 3 is green.**
   Module-level Spock specs mock every dependency (repositories, cross-domain services), so they
   can't catch things only a real `@SpringBootTest` context surfaces: a missing table in the test
   profile's H2 `schema.sql`, a Spring wiring/bean issue from a new constructor dependency, a
   real MockMvc request/response mismatch. If any `*IntegrationTest`/`*IT` class touches the
   module you changed, treat a passing `:server:test` as mandatory evidence, not optional
   extra credit — a green module-test run alone is not sufficient to call Phase 5 done.

**Client:**

The exact script names are defined by HF-00 and documented in the client `README.md` — read it (or `package.json` scripts) rather than assuming; the old CRA commands (`npm start`, CRA's `npm test`) are gone. Then:

1. Typecheck + unit/component tests (Vitest) — must pass
2. If components changed: open Storybook and confirm every new/changed visual state has a story and looks right against the reference HTML
3. If the ticket has E2E or visual-regression scope: run the relevant Playwright project (`e2e` and/or `visual-regression`). **If any spec file was added, removed, or had a test added/removed/materially changed, update `client/docs/E2E_OVERVIEW.md`'s catalog to match before calling this ticket done** — this doc is the living reference for every e2e test case, and it silently rotting out of date defeats its purpose. This includes the directory listing (§3) and the per-file test table (§6); cross-reference the ticket's own summary doc from the "Related docs" line if it's the origin of a new spec file.
   - **The `visual-regression` project fails wholesale on a non-CI (Windows) host** — the documented font-rendering noise floor (see CLIENT-NOTIF-3's write-up). A failing run is only informative once signal is separated from noise: `git stash` the ticket's changes and re-run one spec that renders nothing this ticket touched — a byte-identical failure confirms the noise floor, a *different* diff is a real regression. Decide, and be ready to state in the Phase 6 summary, **whether a visual-regression failure is expected for this ticket**: either "no baselined surface touched, so any failure is pure noise floor" or "baselines `<names>` legitimately change (reason), so those are expected to fail until the `update-baselines` GitHub dispatch regenerates exactly those files — everything else must stay byte-identical." Baselines cannot be regenerated on a Windows host.
4. Start the Vite dev server and walk the ticket's happy path in a browser
5. If the hook hits a real backend endpoint, verify once against the actually running backend (`./gradlew :server:bootRun`) — MSW passing is not proof the real contract matches

If HF-00 hasn't landed yet (no `package.json` in `client/`), the only valid ticket is HF-00 itself — flag it if anything else was picked.

**Infra:**

1. Verify everything that CAN be verified locally: compose files via `docker compose config` (and `up` if Docker is available), workflow YAML by careful review (or actionlint if installed), any referenced pnpm/gradle commands by actually running them locally
2. What can only be verified on GitHub (a workflow actually executing, required-check settings) is NOT a pass — record it explicitly as a conditional with the exact remaining steps, and keep or create the follow-up ticket (HF-12 pattern)

**Chat service:**

1. `go build ./...`, `go vet ./...`, and `go test ./...` from `services/chat/` — all three, not just the one that happens to be green
2. If the migration changed: run it against a real Postgres (the dev compose stack's `sportconnect_chat_dev` database) and confirm it applies cleanly
3. If the ticket touches the sync path: verify against a real Redis Stream (`redis-cli XRANGE sportconnect:domain-events - +`), not just a unit test with a fake event

Report what was tested and whether it passed. Fix failures before moving on.

---

## Phase 6 — Document + close ticket

1. Document the code:
   - **Backend:** write/update the Javadoc for every new or changed public method, in both `-api` interfaces and `-impl` classes. Cover: purpose (what it does, one line), flow (the steps it takes, especially any cross-domain calls or batching), and highlight anything non-obvious (exception vs. fallback behavior, nullability, ordering guarantees, why it exists). Skip private helpers unless the logic is genuinely surprising.
   - **Client:** exported hooks and non-obvious component props get a short TSDoc comment (what it's for, anything surprising); don't Javadoc-style-document every prop the types already explain.
2. Write an implementation summary covering the Phase 3 design (the approved plan, restated — not just a link back to chat), what was built, key decisions, and non-obvious constraints. If what was built diverged from the approved design (e.g. a test premise broke, an edge case forced a different approach), say so explicitly rather than silently updating the design to match the outcome.
   - **Client tickets: the summary MUST carry a "Visual-regression expectation" line** — one of: (a) "no baselined surface touched — no baseline change expected; a failing `visual-regression` run is the Windows noise floor, not a regression", or (b) "baselines `<file names>` legitimately change (`<reason>`) — expected to fail until the `update-baselines` GitHub dispatch regenerates exactly those files; every other baseline must come back byte-identical". If a `visual-regression` run was actually done, state whether its failures matched that expectation and how you checked (the Phase 5 stash-and-rerun proof). Never leave "visual-regression failed" in a summary without saying whether that was expected.
   Path depends on whether this module has been restructured per
   `documentation/md/BACKLOG_STRUCTURE_CONVENTION.md` (a `<VERSION>/` subfolder exists next to its
   backlog file — check before picking a path):
   - **Restructured** → `<root>/docs/<VERSION>/<TICKET_ID>_<TICKET_TITLE>.md` (e.g.
     `client/docs/MVP/<TICKET_ID>_<TICKET_TITLE>.md`) — same filename convention as every other file
     already in that folder, no status in the name.
   - **Flat** (not yet restructured) → same as before:
     - If `module` is `client` → `client/docs/<TICKET_ID>_<TICKET_TITLE>.md`
     - If `module` is `infra` → `infra/documentation/<TICKET_ID>_<TICKET_TITLE>.md`
     - If `module` is `chat` → `services/chat/docs/<TICKET_ID>_<TICKET_TITLE>.md`
     - Otherwise → `modules/<domain>/docs/<TICKET_ID>_<TICKET_TITLE>.md`
3. Add a one-line summary to `PROGRESS.md` under the relevant section
4. Update the ticket's status in the backlog file (`BACKLOG_<VERSION>.md`):
   - **Restructured** → move the ticket's row from the **Open** table into the **Done** table,
     inserted at the position that keeps Done sorted by completion date descending (newest first) —
     don't just flip the status word in place and leave it under Open.
   - **Flat** → flip the status to `DONE` in place, same as before.
   For client tickets, if implementation revealed a correction to the epic spec (changed contract,
   resolved open question), note it on the ticket's own entry (its file, if restructured; its inline
   section, if flat) as a **Delta** so the next ticket doesn't trip on the stale spec.
