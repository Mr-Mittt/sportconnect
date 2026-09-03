# SPORT-10 · Add-sport resume / reactivation flow (`isResume`)

**Status:** `TODO` · **Type:** Feature · **Filed:** 2026-09-03 ·
**Origin:** backend **A20** (`DONE`/merged 2026-09-03) § "Client follow-ups (filed by the user, not
in this PR)" item 1. A20 named this follow-up but it was never filed into this backlog; filed now
during A22's Phase 1 consumer census, which found the gap. ·
**Depends on:** backend **A20** (shipped — `isResume` on `CreateUserSportProfileRequest`,
`?includeInactive=true` on the profile-list read). Also touches the same hooks as **SPORT-11** —
if both are open, do SPORT-11's `useAddSportProfile` / query-key changes first or coordinate. ·
**Spec source:** `modules/sport/sport-impl/docs/MVP/A20_ISRESUME_REACTIVATION_MODE.md` §
"Client-visible" + "Client follow-ups"

## Why

Backend A20 changed profile reactivation semantics. Re-adding a sport the user previously had (a
soft-deleted `user_sport_profiles` row) is no longer "a fresh create" — the client must now:

1. detect that the chosen sport has a **soft-deleted** profile for this user, and
2. send `POST /api/sports/profiles` with `isResume: true`, which **purely reactivates** the old row
   (old scalars kept verbatim, `attributes` = A10 `retainDefined` prune only, request body
   otherwise ignored).

Today the client's add-sport flow (`useAddSportProfile` + the Add-sport modal) only ever does a
plain create. Against the A20 backend, re-adding a previously-removed sport either 400s (if A20's
`isResume`-required path rejects a plain re-create) or silently discards whatever the user typed in
the modal — neither is a coherent UX.

## What ships

### 1. Detect a resumable profile

- When the user picks a sport in the Add-sport modal, check whether they have a soft-deleted
  profile for it. Source: the caller's own profile list with `?includeInactive=true` (A20) —
  after **SPORT-11** this is `GET /api/sports/profiles?includeInactive=true`; until then it is
  `GET /api/sports/profiles/user/{selfId}?includeInactive=true`. Reuse / extend the existing
  self-profiles query rather than adding a third copy.
- A profile counts as "resumable" when a row exists for that `sportId` with `isActive: false`.

### 2. Resume confirmation (no edit form)

- If a resumable profile exists, replace the normal "fill in your skill level / attributes" modal
  body with a plain confirmation: *"You had a {sport} profile before — we'll reactivate it with
  your previous details."* One primary action (Reactivate), one cancel.
- On confirm: `POST /api/sports/profiles` with `{ sportId, isResume: true }` and **no other
  fields**. A20 ignores the rest of the body on resume.
- On success: the reactivated profile appears in the switcher / lists exactly as a normal create
  does today (same cache write / invalidation path in `useAddSportProfile`).

### 3. Fresh create unchanged

- No resumable profile → the existing create flow runs verbatim (skill level + attributes form,
  `isResume` omitted or `false`).

## Edge cases

- User has an **active** profile for the sport already → existing duplicate-guard behavior, not
  this flow (A20 `isResume:true` with an active row → `400`).
- `isResume: true` with nothing to resume (race: profile hard-changed between detect and submit) →
  A20 returns `400`; surface the generic "couldn't add that sport" error, refetch the list.
- Sport is deactivated app-wide (A6/A7) → it won't be offered in the modal's sport picker; no
  special handling here.
- Deactivated caller with a live access token → same standing U12 gap as every write path; no new
  client-side check.

## Out of scope

- The caller-scoped read-path migration (`GET /sports/profiles`, other-user display) — that's
  **SPORT-11**.
- Any change to what the resume actually keeps/prunes server-side — fixed by A20/A10.
- Showing the previous profile's details in the confirmation (skill level, attributes) — a plain
  text confirmation is enough for MVP; revisit if users ask.
- An "edit while reactivating" path — A20 deliberately ignores the body on resume; editing is a
  follow-up `PUT` the user can do after.

## Tests

- Vitest — picking a sport with a soft-deleted profile shows the confirmation body (not the form);
  confirming POSTs `{ sportId, isResume: true }` only; picking a sport with no prior profile shows
  the normal form and POSTs without `isResume`; a `400` on resume surfaces the error and refetches.
- Storybook — Add-sport modal: "fresh create" state and "resume confirmation" state.
- `client/docs/E2E_OVERVIEW.md` — update only if an e2e/visual spec file is added or materially
  changed (likely a new assertion in the existing sport-switcher / add-sport flow).
