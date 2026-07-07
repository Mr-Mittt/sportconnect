You are implementing an approved feature plan for SportConnect. Work through the phases below in order. Do not skip steps or reopen design decisions — those were settled in `/feature`.

---

## Phase 0 — Branch check

Before touching any files:

1. Run `git branch --show-current`.
2. If the current branch is `master`: create and check out a new branch for this feature (e.g.
   `feature/<short-slug>` — match the naming already used in this repo's merged PRs).
3. If the current branch is anything else: **stop and ask the user which branch to work on.**
   Don't assume the current branch is the right one to build on, and don't silently create a new
   branch either — let the user decide (stay on this branch, branch off it, or switch elsewhere)
   before proceeding to Phase 1.

---

## Phase 1 — Confirm the plan

Ask the user to paste or summarize the approved plan from `/feature` if it is not already in context.

Before writing any code, restate:
- **What** is being built
- **Which files/modules** will be touched
- **What is explicitly out of scope**

Wait for the user to confirm before proceeding.

---

## Phase 2 — Implement

Execute in this order to keep the codebase in a compilable state at every step:

1. **Liquibase migration** (`server/src/main/resources/db/changelog/changes/`) — schema first; register the new file in `db.changelog-master.xml`
2. **Entity** — in the relevant `*-impl` module under `domain/entity/`
3. **Repository** — interface extending `JpaRepository`, in `*-impl`
4. **Service interface + DTOs** — in `*-api` (this is the cross-domain contract)
5. **Service implementation** — in `*-impl`, implementing the `-api` interface
6. **Controller** — in `*-impl`; all responses wrapped in `ApiResponse<T>` from `modules/common`
7. **Security config** — add new public/protected endpoint mappings in `auth-impl` if needed
8. **Frontend** — API call in `client/src/utils/api.js` or a dedicated service file → state/context update → component or page
9. **Spock tests** — `src/test/groovy/` in the relevant `*-impl` module; use `Mock()` for dependencies, `@Subject` on the class under test

Enforce these constraints at every step — do not let them slip:
- Never import a concrete class from another domain's `-impl`
- Cross-domain references are IDs only — no JPA `@ManyToOne` across domain boundaries
- DB tables are domain-scoped — no cross-domain foreign keys at the DB level
- Always depend on the `-api` interface, not the `-impl` class

---

## Phase 3 — Verify

After implementation:

1. Check for N+1 queries: scan any new/changed mapper or response-building method for a repository/service
   call inside a `.map()` over a `Page`/`List` or inside a `for` loop. If found, batch it (e.g. collect ids
   up front, call a `getXByIds(List<UUID>)`-style method once, then resolve each item from the returned map)
   before moving on.
2. Run the backend and confirm the new endpoint responds correctly:
   ```
   ./gradlew :server:bootRun
   ```
3. Run the affected module's tests:
   ```
   ./gradlew :<module>:<module>-impl:test
   ```
4. If frontend was changed, start the dev server and walk the happy path manually:
   ```
   cd client && npm start
   ```

Report what was tested and whether it passed. Flag any failures before moving on.

---

## Phase 4 — Document

Per the project's documentation convention (required, not optional):

1. Write/update the Javadoc for every new or changed public method, in both `-api` interfaces and `-impl` classes. Cover: purpose (what it does, one line), flow (the steps it takes, especially any cross-domain calls or batching), and highlight anything non-obvious (exception vs. fallback behavior, nullability, ordering guarantees, why it exists). Skip private helpers unless the logic is genuinely surprising.
2. Write a module-scoped implementation summary at `modules/<domain>/docs/<FEATURE_NAME>.md` covering the approved design (restated, not just a link back to chat), what was built, key decisions, and any non-obvious constraints. If what was built diverged from the approved design, say so explicitly rather than silently updating the design to match the outcome
3. Add a one-line summary to `PROGRESS.md` under the relevant section
