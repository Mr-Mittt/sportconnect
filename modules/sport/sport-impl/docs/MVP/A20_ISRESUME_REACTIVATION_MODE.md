# A20 · `isResume` mode on sport-profile reactivation

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** **A10** (hard — reuses its `ProfileAttributeFilter.retainDefined` + attribute-merge
helper) · relates to **A7** (revises its reactivation decision)
**Filed:** 2026-09-03, from the A10 `/workon` Phase 2 discussion — deleting a sport profile and
re-adding it currently wipes everything the user had (A7: "reactivation behaves like a fresh
create"). An attribute map (gear lists, structured records) is real effort to lose on a sport
toggle; the user should be able to choose *resume* vs *start fresh*.

## Background — what A7 does today

`deleteProfile` soft-deletes (`isActive = false`); the row's columns are left intact. `createProfile`
finds that row and **reactivates it by overwriting every field from the request** — `skillLevel`,
`bio`, `preferredPosition`, `yearsOfExperience`, and `attributes` (set to `filter(request)`), so
nothing from the pre-delete profile ghosts back. That was A7's explicit call.

## What ships

**1. `Boolean isResume` on `CreateUserSportProfileRequest`.** Absent / `false` → today's behaviour,
unchanged. `true` → resume the soft-deleted row instead of rebuilding it.

**2. Reactivation branch in `UserSportProfileServiceImpl.createProfile`:**

| | `isResume` absent / `false` (A7, unchanged) | `isResume == true` |
|---|---|---|
| scalar columns (`skillLevel`, `bio`, `preferredPosition`, `yearsOfExperience`) | replaced from the request (even to `null`) | kept from the old row; the request's **non-null** fields update them (`updateProfile`-style null-check merge) |
| `attributes` | `filter(request)` — old map discarded | old map run through A10's `retainDefined` (prune definitions the admin has since removed, re-validate the rest) **+** merge the filtered request **+** honour `null` as a delete marker — i.e. exactly A10's `updateProfile` pipeline |
| `isActive` | set `true` | set `true` |

**3. Edge cases:**
- **No existing row** for `(userId, sportId)` → `isResume` is ignored (nothing to resume); behaves
  as a first-time create.
- **Existing row is currently active** → still `400 "User already has a profile for sport"`,
  unchanged — `isResume` never overrides the active-duplicate guard. Resuming is only for a
  soft-deleted row.
- Sport-active gate (A6/A7 `requireActiveSportById`) and the size cap
  (`validateAttributesSize` on the merged result) are unchanged.

## Account lifecycle

`createProfile` is an existing authenticated endpoint; `isResume` adds no new endpoint or job. The
sport-active gate already runs. Caller `isActive` is the same pre-existing gap every write path
carries (CLAUDE.md / U12) — not introduced here.

## Client-visible

- **DTO change:** `CreateUserSportProfileRequest` gains `isResume`. The client's add-sport flow
  (`useAddSportProfile` / the Add-sport modal) must set it.
- **Real UX, not just a flag:** the add-sport flow does not currently surface "you had a profile
  for this sport before." It needs to detect a soft-deleted profile for the chosen sport and offer
  *resume* vs *start fresh* before calling `createProfile`. File a `SPORT-*` / `PROFILE-*` client
  ticket alongside — this is the blocker that kept `isResume` out of A10.
- No enum mirror involved.

## Out of scope

- The client resume/fresh chooser (separate client ticket, above).
- Any change to `updateProfile` (that is A10).
- Surfacing or listing a user's soft-deleted profiles as a general feature — this ticket only needs
  the point lookup `createProfile` already does (`findByUserIdAndSportId`).

## Tests

- `UserSportProfileServiceImplSpec` — reactivation with `isResume = true`: old scalars survive when
  the request omits them; a non-null request field overrides; `attributes` = `retainDefined(old)` +
  filtered request + `null`-deletes; with `isResume` false/absent the existing
  `"createProfile does not inherit stale values from the deleted profile"` still holds (that test
  gets the resume/fresh split); `isResume = true` with no existing row behaves as a fresh create;
  `isResume = true` against an active row still `400`.
- Integration test in `server/src/test/java/com/sportconnect/integration/` — `DELETE` a profile,
  then `POST /api/sports/profiles` with `isResume: true` and a partial body, and confirm the
  re-`GET` shows the old `attributes` (minus any now-undefined keys) plus the request's changes.
