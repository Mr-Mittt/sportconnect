# B19 · Dedicated `PUT /{groupId}/generalData` endpoint

**Status:** DONE (2026-08-11)
**Type:** Enhancement (API design)

## Context

Filed 2026-08-11, raised directly by the user while discussing why `useGroupInfo`/
`useSettingsUnsavedGuard` (client, GRP-2) write the Settings tab's General section
(`rules`/`schedule`) through the generic `PUT /api/groups/{groupId}` (`updateGroup`/
`UpdateGroupRequest`) rather than a scoped endpoint mirroring `GET`/`PUT
/api/groups/{groupId}/settings`. `GET /{groupId}/info` already existed as a read-side
projection of `Group`, but had no matching write side — the client had to reuse the wider
`UpdateGroupRequest` shape and, since `GroupResponse` (that endpoint's return type) never
carries `rules`/`schedule`, manually patch the `groupInfo` query cache from what it knew it
had just sent rather than trusting the response.

Asked directly why no dedicated pair exists; the answer was architectural, not accidental:
`rules`/`schedule` aren't a separate resource the way `GroupSettings` is — they're two more
nullable columns on the same `Group` row as `groupName`/`description`/`avatarUrl`/`coverUrl`/
`isPrivate`, all handled by `updateGroup`. Given the choice to add symmetry anyway (see
Decision below), this ticket adds the write side.

## Decision (confirmed with user before implementing)

Two questions resolved via `AskUserQuestion`:

1. **Route:** add `PUT /{groupId}/generalData` **alongside** the existing `GET /{groupId}/info`
   (not a rename/replace) — `GroupInfoResponse`/`getGroupInfo` untouched for existing callers.
2. **Field scope:** the full `groupName`/`description`/`avatarUrl`/`coverUrl`/`rules`/`schedule`
   set (everything `UpdateGroupRequest` carries except `isPrivate`) — not just `rules`/`schedule`,
   even though that's all the client's Settings tab General section edits today. Deliberate
   front-loading: "later on we can add more updatable fields" without another backend ticket, the
   same reasoning A10 used to add `sportIds` alongside (not replacing) the legacy `sportId` param.

`isPrivate` stays on `UpdateGroupPayload`/`PUT /{groupId}` — it's its own immediate-apply toggle
(GroupsPage's Privacy switch), a different UX shape from the draft/Save flow this endpoint serves.

**`UpdateGroupRequest`/`PUT /{groupId}` keeps accepting `rules`/`schedule` too** — not removed.
Same precedent as A10 keeping the legacy `sportId` filter param: a public, Swagger-documented
endpoint's existing accepted fields aren't pulled out just because a narrower path now exists,
to avoid a silent breaking change for any caller besides this client. The client itself (GRP-9)
stopped sending `rules`/`schedule` through this endpoint, but the field/logic stayed.

## What was built

- **`UpdateGroupGeneralDataRequest`** (`group-api/dto`) — new DTO: `groupName`, `description`,
  `avatarUrl`, `coverUrl`, `rules`, `schedule` (same `@Size` validation as the matching
  `UpdateGroupRequest` fields). No `isPrivate`.
- **`GroupInfoResponse`** (`group-api/dto`) — expanded with `description`/`avatarUrl`/`coverUrl`,
  so the write side's full field set has a matching read side (previously only
  `groupId`/`groupName`/`rules`/`schedule`/`updatedAt`).
- **`GroupService.updateGroupGeneralData(Long groupId, UUID userId,
  UpdateGroupGeneralDataRequest request): GroupInfoResponse`** — new interface method.
- **`GroupServiceImpl`** — `updateGroupGeneralData` mirrors `updateGroup`'s exact shape: fetch via
  `findByIdAndIsActiveTrue`, `canManageMembers` (owner or admin) permission check, per-field
  non-null partial update, groupName-uniqueness pre-check plus the same
  `DataIntegrityViolationException` TOCTOU backstop, returns the freshly-saved group mapped to
  `GroupInfoResponse`. `getGroupInfo`'s mapping and this method's now share one private
  `mapToGroupInfoResponse(Group)` helper (extracted, not duplicated).
- **`GroupController`** — `PUT /api/groups/{groupId}/generalData`, `ROLE_USER` (service layer does
  the real owner/admin check, same pattern as `updateGroup`/`updateGroupSettings`).
- **Tests** — `GroupServiceImplSpec`: owner-success, admin-success, member-rejected,
  group-not-found, and duplicate-name cases for `updateGroupGeneralData` (mirroring `updateGroup`'s
  existing coverage set); `getGroupInfo`'s existing test extended to assert the three new fields
  round-trip. `GroupControllerTest`: one MockMvc integration test asserting the endpoint wiring and
  response envelope.

## Out of scope

- Removing/deprecating `rules`/`schedule` from `UpdateGroupRequest`/`PUT /{groupId}` — kept for
  back-compat per the Decision above.
- Any UI for editing `groupName`/`description`/`avatarUrl`/`coverUrl` — the Settings tab's General
  section only edits `rules`/`schedule` today (see client's GRP-9); those fields exist on the new
  DTO for future UI to grow into without another backend ticket, per the user's own framing when
  scoping this.

## Verification

- `./gradlew :modules:social:group-impl:test --tests "com.sportconnect.group.service.GroupServiceImplSpec"` — pass.
- `./gradlew :server:test --tests "com.sportconnect.integration.GroupControllerTest"` — pass, including the new `updateGroupGeneralData_Success` case.

---

**Status:** `DONE` (2026-08-11) · **Summary:**
`modules/social/group-impl/docs/MVP/B19_GROUP_GENERAL_DATA_ENDPOINT.md`
**Type:** Enhancement (API design)

**Filed:** 2026-08-11, raised directly by the user while discussing why the client's Settings tab
General section (`rules`/`schedule`) writes through the generic `PUT /{groupId}`
(`updateGroup`/`UpdateGroupRequest`) rather than a scoped endpoint mirroring `GET`/`PUT
/{groupId}/settings` — `GET /{groupId}/info` already existed read-side with no matching write side,
forcing the client to reuse the wider DTO and manually patch its query cache since
`GroupResponse` never carries `rules`/`schedule`.

**Decision (confirmed with user via `AskUserQuestion` before implementing):** add `PUT
/{groupId}/generalData` **alongside** (not replacing) the existing `GET /{groupId}/info`; field
scope is the full `groupName`/`description`/`avatarUrl`/`coverUrl`/`rules`/`schedule` set (not just
the two fields the client edits today) — deliberate front-loading so future UI doesn't need another
backend ticket, same reasoning A10 used keeping `sportId` alongside `sportIds`. `isPrivate` stays
on `UpdateGroupPayload`/`PUT /{groupId}` (its own immediate-apply toggle, different UX shape).
`UpdateGroupRequest`/`PUT /{groupId}` keeps accepting `rules`/`schedule` too, for back-compat — not
removed, same precedent as A10 keeping its legacy `sportId` param.

**What shipped:** new `UpdateGroupGeneralDataRequest` DTO; `GroupInfoResponse` expanded with
`description`/`avatarUrl`/`coverUrl`; new `GroupService.updateGroupGeneralData` (owner/admin,
mirrors `updateGroup`'s permission + partial-update + name-conflict-backstop shape exactly);
`PUT /api/groups/{groupId}/generalData`. Full design/implementation writeup, including the
`AskUserQuestion` decisions verbatim: `modules/social/group-impl/docs/MVP/B19_GROUP_GENERAL_DATA_ENDPOINT.md`.

**Out of scope:** removing `rules`/`schedule` from `UpdateGroupRequest` (kept for back-compat); any
UI for the newly-added `groupName`/`description`/`avatarUrl`/`coverUrl` write fields (client's
GRP-9 only wires `rules`/`schedule` through the new endpoint, matching what the Settings tab
General section actually edits today).

---
