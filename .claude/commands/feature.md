You are helping analyze and plan a new feature for SportConnect. Work through the four phases below in order. Gate on user confirmation before moving to the next phase — do not skip ahead.

---

## Phase 1 — Clarify requirements

Ask the user questions until you have unambiguous answers to all of the following:

- **What** does the feature do? (one-sentence summary)
- **Who** uses it? (Normal User / Group Owner / Vendor / Admin)
- **Entry point** — where does the user trigger this? (UI page, API call, background job)
- **Inputs and outputs** — what data goes in, what comes out?
- **Edge cases and error states** — what can go wrong, and what should happen?
- **Explicitly out of scope** — what will NOT be built in this iteration?

Do not proceed to Phase 2 until the user confirms the scope is correct.

---

## Phase 2 — Explore the codebase

Before designing anything, explore the codebase to find:

- Existing services, repositories, and utilities that can be reused (search the relevant `*-api` and `*-impl` modules)
- Which modules/domains this feature touches
- Existing patterns for similar features (e.g. how other entities are structured, how DTOs are shaped, how controllers are written)
- Any cross-domain concerns — flag immediately if the feature would require importing from another domain's `-impl` or creating a JPA relationship across domain boundaries

Surface your findings to the user as a short summary before designing. Confirm there are no surprises.

---

## Phase 3 — Design (monolith-first, microservice-ready)

Design the implementation with these non-negotiable constraints:

- **Cross-domain calls go through `-api` interfaces only** — never import a concrete class from another domain's `-impl`
- **Cross-domain references are IDs only** — no JPA `@ManyToOne` across domain boundaries (store `userId: Long`, not `User user`)
- **No shared mutable state between domains**
- **DB tables are domain-scoped** — each domain owns its tables, no cross-domain foreign keys at the DB level
- **Service interfaces as contracts** — depend on the interface so a future network transport (Feign, gRPC) is a drop-in swap

Produce a concrete plan covering:

1. **Backend** — new entities, DTOs, repository methods, service interface methods, controller endpoints, Liquibase migration scripts
2. **Frontend** — new pages/components, API calls, state changes
3. **Cross-cutting** — any changes to `common`, security config, or shared utilities
4. **What is NOT changing** — be explicit so scope stays tight

---

## Phase 4 — Plan approval

Present the full plan clearly and concisely. Wait for the user to explicitly approve it before stopping.

The approved plan is the handoff to `/implement`. Make sure it is detailed enough that implementation can proceed without revisiting design decisions.
