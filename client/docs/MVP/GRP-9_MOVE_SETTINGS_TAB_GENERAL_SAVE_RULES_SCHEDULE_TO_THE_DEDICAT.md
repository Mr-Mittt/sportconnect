# GRP-9 · Move Settings tab General save (rules/schedule) to the dedicated `generalData` endpoint

### GRP-9 · Move Settings tab General save (rules/schedule) to the dedicated `generalData` endpoint
**Status:** `DONE` (2026-08-11) · **Type:** Enhancement (API alignment) · **Dependency:** backend
B19 (`modules/social/group-impl/docs/BACKLOG_MVP.md`, `DONE`)

**Filed:** 2026-08-11, raised directly by the user while asking why `useSettingsUnsavedGuard`
(GRP-2) invokes `useGroupInfo`/writes rules/schedule through the generic `useUpdateGroup`/`PUT
/{groupId}` rather than a scoped endpoint — leading to backend ticket B19 adding `PUT
/{groupId}/generalData`. This ticket is the client-side follow-through: point the Settings tab's
General section save at the new endpoint instead of the generic one.

**What shipped:**
- New `UpdateGroupGeneralDataPayload` type (`features/feed/types.ts`) and `GroupInfo` expanded with
  `description`/`avatarUrl`/`coverUrl` (matching B19's `GroupInfoResponse`) — the Settings tab UI
  still only edits `rules`/`schedule`, the extra fields exist for future UI per B19's own scope
  decision.
- New `useUpdateGroupGeneralData()` hook (`features/feed/hooks/`), wrapping `PUT
  /{groupId}/generalData`, mirroring `useUpdateGroupSettings`'s "patch the matching query cache
  from the response" shape.
- `useSettingsUnsavedGuard` now calls `useUpdateGroupGeneralData()` instead of
  `useUpdateGroup(currentUserId)` for the info-save half of its combined draft/Save flow. This
  **removed a workaround**: the old path patched the `groupInfo` cache manually from what was
  *sent* (`updateGroup`'s `GroupResponse` return shape never carries `rules`/`schedule`, so there
  was nothing real to patch from); the new endpoint returns a real `GroupInfoResponse`, so the
  cache is now set from what the server actually persisted, like every other mutation hook in this
  codebase already does.
- `currentUserId` dropped from `useSettingsUnsavedGuard`'s signature — it was only ever there to
  construct the old `useUpdateGroup(currentUserId)` instance (for patching the `userGroups` list
  cache on a Privacy-style update); the new hook doesn't touch that cache, so the param became
  dead. `GroupsPage.tsx`'s call site updated to match. Privacy itself is untouched — it keeps its
  own separate `useUpdateGroup(currentUserId)` instance elsewhere on the page.
- MSW e2e mocks: new `PUT /api/groups/:groupId/generalData` handler (writes `groupInfoState`,
  mirrors the real endpoint's response shape); the existing `PUT /api/groups/:groupId` handler's
  rules/schedule handling was left in place (backend still accepts it for back-compat per B19) but
  is no longer exercised by any client code path.

**Out of scope:** any UI for editing `groupName`/`description`/`avatarUrl`/`coverUrl` (not part of
this ticket — those fields exist on the payload/response types for future tickets to wire up, same
as B19's backend scope decision).

---
