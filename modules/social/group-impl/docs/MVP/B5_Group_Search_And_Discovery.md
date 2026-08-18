# B5 · Group Search & Discovery

**Date:** 2026-06-29  
**Status:** DONE

## What was built

Extended `GET /api/groups/public` to support keyword search and an improved response shape:

| Param | Type | Description |
|---|---|---|
| `keyword` | `String` (optional) | ILIKE match on `groupName` |
| `sportId` | `Long` (optional) | Filter by sport |
| `page` / `size` | (Spring Pageable) | Standard pagination |

Returns `Page<GroupSearchResponse>` — a slim card DTO replacing the previous `Page<GroupResponse>`. Results are sorted: member groups first (alphabetical by name), then non-member groups (most members first).

## Key decisions

- **New `GroupSearchResponse` DTO** (not reusing `GroupResponse`) — drops `currentUserRole`, `coverUrl`, `isActive`, `createdBy` UUID, `updatedAt`, `createdAt`. Adds `isMember: boolean`. Keeps the response small for card/list views.
- **Single LEFT JOIN, flat 2 queries** — `memberCount` and `isMember` are both resolved in SQL via a single `LEFT JOIN GroupMember`, eliminating the original N+1 patterns. Total queries per page: 2 regardless of page size.
  - `COUNT(gm.groupId)` in the GROUP BY computes memberCount.
  - `SUM(CASE WHEN gm.userId = :userId THEN 1 ELSE 0 END)` computes isMember (0 or 1) without row multiplication — only the one matching row contributes 1, all others 0.
  - Creator names are batch-fetched via `userRepository.findAllById(creatorIds)` (one query for the whole page).
- **Two repository methods** — `searchPublicGroupsWithCounts` (authenticated, includes the SUM expression) and `searchPublicGroupsAnon` (anonymous, omits the SUM to avoid passing null to a JPQL `=` comparison). Each has an explicit `countQuery` because Spring Data cannot auto-derive a count from a GROUP BY query.
- **In-memory sort** — the two-tier sort (members: alpha; non-members: member count desc) is applied after mapping, within the fetched page. Cross-page ordering is approximate but correct within each page — acceptable for MVP discovery volumes.
- **Endpoint stays public** — unauthenticated users can still browse and search groups; `@AuthenticationPrincipal` returns null gracefully, routing to the anonymous query.

## Non-obvious constraints

- A naive double LEFT JOIN (one for memberCount, one for isMember) causes row multiplication: both joins expand on `g.id`, so every member row gets the user's membership row attached — `COUNT(gm_user)` would return the full member count, not 0/1. The `SUM(CASE WHEN ...)` pattern avoids this by aggregating conditionally over the single join's expanded rows.
- The old `getPublicGroups(Long sportId, Pageable pageable)` signature was a breaking change at the service interface level — both `GroupService` and `GroupController` were updated together. The two existing Spock tests for `getPublicGroups` were also migrated to the new signature.

---

**Status:** `DONE`  
**Type:** New Feature  
**Dependency:** B2 (sportId on Group)

`GET /api/groups/search` with optional filters:
- `keyword` — name/description ILIKE
- `sportId`
- `page` / `size`

Public groups only (`isPrivate = false`, `isActive = true`).

---
