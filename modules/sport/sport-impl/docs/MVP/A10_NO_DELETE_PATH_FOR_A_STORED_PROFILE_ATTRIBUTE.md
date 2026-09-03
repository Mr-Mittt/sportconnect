# A10 · No delete path for a stored profile attribute

**Status:** `DONE` (2026-09-03)
**Type:** Enhancement
**Filed:** 2026-08-20, during A9 pickup — an explicitly accepted gap, not a discovery.
**Widened:** 2026-09-03 (user decision) — folded in **orphaned-value pruning**. A `/ticket` pass
proposed it as a separate ticket ("remove stored values whose definition the admin has since
deleted"), but it is the same delete-a-stored-key gap from the other side: the admin removes the
definition instead of the user clearing the value, and the fix lives on the same write path.
**Depends on:** A9 (`DONE`) — the schema this validates a delete against.

## Why

A3 shipped `UserSportProfile.attributes` with merge-only semantics: a write can add or overwrite a
key, never remove one. A9 was the natural place to close that, because with a server-side schema the
server finally knows the legitimate key set — the design doc raises exactly this
(`SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` §7) and leaves the call to the ticket.

The call, made during A9 pickup: **keep merge**. A key absent from the request keeps its stored
value; a key present with an invalid value is ignored. Both are deliberate. The consequence is two
related gaps, addressed together here:

1. **A user cannot remove a value they set** (a live `STRING`/`ENUM` attribute).
2. **A value orphaned by the admin deleting its definition is never cleaned up** — it persists,
   still counts against the 4KB cap, and no path (user or server) removes it.

## Concrete effects

- A user who set `racket: "Yonex"` cannot clear it. Sending `null` is ignored (the filter drops
  null values, see `ProfileAttributeFilterSpec`), and omitting the key means "leave it alone".
- Stale keys — written before A9, or belonging to an attribute whose definition the admin has since
  **physically removed** from the schema — persist forever. Reads pass them through untouched, by
  design (schema evolution policy, design §5.1), but nothing clears them.
- Those stale keys count toward the 4KB `MAX_ATTRIBUTES_BYTES` cap. A profile close to the limit can
  have a legitimate new write rejected with a 400, and the user has no way to reclaim the space.
  Rare, but a real dead end with no user-facing escape.

Note `LIST` attributes have a partial workaround: an empty list is a valid value and is stored, so a
multi-select can be cleared even though it cannot be removed. `STRING` and `ENUM` have no equivalent.

## Part 1 — user clears their own value — **Option 1 chosen (2026-09-03, `/workon`)**

**Explicit-null deletes.** In the `attributes` map of an `updateProfile` request:

- key **absent** → unchanged (current merge behaviour — "leave it alone")
- key present with a **valid value** → set (unchanged)
- key present with an explicit **`null`** → the key is **removed** from the stored map

`ProfileAttributeFilter` currently treats a null value as invalid and silently drops the entry
(`ProfileAttributeFilterSpec`: `"null value" | [racket: null] | [:]`). That inverts here: `null`
becomes a **delete marker** the `updateProfile` merge honours by removing the key rather than
writing it. An **empty string is unchanged** — `"racket": ""` is still a valid `STRING` value and is
still stored as `""` (not a delete); only an explicit JSON `null` removes. `DEFINITION_LIST`'s
existing `[]` clear (key kept, empty list stored) is likewise unchanged; `null` on a
`DEFINITION_LIST` removes the key entirely, same as any other type.

### Options considered and rejected

- **`DELETE /api/sports/profiles/{profileId}/attributes/{key}`** — explicit and REST-shaped, but a
  second write path into `attributes` to secure, test, and keep consistent with the filter's rules,
  and no set-and-delete in one round trip.
- **Replace-within-schema** (schema-defined keys the payload omits get cleared) — a breaking change
  for every caller, explicitly rejected at A9 pickup.

### Client follow-up (file alongside)

The current client never sends `null` — an emptied `STRING`/`ENUM` field goes out as `""` (traced:
`SportAttributesFields` → `setAttribute` in `useSportProfileSettingsTabData` →
`buildSportProfileUpdatePayload`), and `setAttribute` has no path that deletes a key or sets it
null. So Option 1 is purely additive — no existing behaviour changes. Exposing the delete gesture
(a "remove field" control that emits `null`, and pruning the local draft after Part 2 runs
server-side so the UI matches) is a client change — file as `SPORT-*` / `PROFILE-*` alongside this
ticket. Not an enum-mirror issue; it is an API-surface change (`{key: null}` now means "delete").

## Part 2 — orphaned-value pruning (approach decided 2026-09-03)

**Lazy, on the user's own attribute write. No bulk sweep, no background job, no new endpoint, no
admin-side action.**

`updateProfile` already runs the incoming request through `ProfileAttributeFilter` and merges the
result onto the stored map. Extend that merge: before overlaying the filtered request, re-filter the
**existing** stored `attributes` against the current schema and keep only what it still defines (see
**Depth — 2b** below for how far the re-filter reaches). The profile self-heals the next time its
owner saves anything.

Decisions locked in:

- **"Removed" = physically absent from the schema document.** A definition set `isAvailable: false`
  is *not* pruned — soft delete is explicitly designed to keep stored values readable ("Nothing a
  user saved is destroyed by an admin switching a field off", `SportAttributeDefinition` javadoc).
  Only a node the admin actually deleted counts.
- **"Renamed" is not a distinct case.** Keys are immutable by policy, so a rename is already
  add-new + retire-old; the retired old key is just a removed definition and prunes the same way.
- **All orphans, not only touched ones.** One save cleans every orphaned key in that profile, not
  just those the request happens to mention.
- **Admin schema `PUT` is untouched.** Deleting a node from the schema has no immediate effect on
  stored data; the prune only ever happens on a subsequent user write to that profile.
- **`updateProfile` only** (revised at Phase 2, 2026-09-03). `createProfile` already sets
  `attributes` purely from the filtered request on both its paths — a new row builds from
  `filter(request)`, and the A7 reactivation path *replaces* wholesale (`existing.setAttributes(...)`,
  never a merge), so it carries no stale map to prune. Part 1's `null` is likewise moot on create
  (`filter()` drops null, nothing prior to delete). The originally-filed "both write paths" was
  wrong — nothing changes in `createProfile`. Making reactivation *keep* the old attributes
  (merge + prune instead of wipe) is a deliberate A7 revision tracked separately as **A20**
  (`isResume` mode), which reuses this ticket's `retainDefined` + merge helper.
- **Runs unconditionally.** The prune executes on every `updateProfile` call, even one that carries
  no `attributes` in the request (a skill-level-only save still self-heals the profile). Costs one
  extra cache-backed `getAttributeSchema` lookup per call.

### Depth — **2b chosen (2026-09-03, `/workon`)**

The prune re-filters the **entire stored `attributes` map** through the current schema on every
write, not just the incoming delta:

- stored top-level keys with **no physically-present definition** → dropped;
- each surviving `DEFINITION` / `DEFINITION_LIST` stored value → re-run through `isValidRecord`
  against its current definition, so an **undeclared nested field** (a `width` the admin removed
  from a `Shoe` record) is dropped too.

Rejected: **2a** (top-level keys only — a nested orphan lingers until its own record is next
re-submitted) and **2c** (strip undeclared nested keys but skip record re-validation).

**Known gap, accepted (client closes it).** Because 2b re-runs the full record contract via
`isValidRecord`, a schema *tightening* that is **not** a deletion — an optional field made
required, a type narrowed, a `NUMBER` `min`/`max` added (A16) — can drop a whole stored record on
the user's next unrelated save, silently, since the client does not currently validate required
fields. That is client **SPORT-6** (`TODO`): strict client-side required-field validation that
stops a user reaching the invalid state. Choosing 2b over 2c means accepting this window until
SPORT-6 lands.

### `isAvailable: false` — cannot reuse `ProfileAttributeFilter.filter()` as-is

`filter()` drops keys under an `isAvailable: false` attribute or group
(`availableAttributesByKey` skips them). Part 2 must **keep** those stored values (soft delete
preserves data, by design). So the stored-map prune needs a predicate of "a definition for this
key/field **physically exists** in the schema, regardless of `isAvailable`" — a distinct traversal
from `filter()`'s "available" one. The record-level re-validation can still route through
`isValidRecord` unchanged (definition *fields* have no `isAvailable` — v2 §15).

### Doc consistency (pickup)

Design §5.1 and v2 §14 both say stored keys with no current definition "pass through untouched".
That stays true for **reads** — this ticket changes only the **write** path. Both passages want a
caveat: "…until the profile's next write, which prunes definitions the admin has physically
removed."

## Out of scope

- **Read-path behaviour.** A plain `GET` never drops anything; permissive reads (design §5.1) are
  unchanged. Pruning is a write-path effect only.
- **Bulk / admin-triggered cleanup.** No cascade on the schema `PUT`, no "purge orphaned values"
  endpoint, no background sweep — all considered and rejected in favour of the lazy model above.
- **Pruning soft-deleted (`isAvailable: false`) attributes' values.** Those are preserved by design.
- **Stale-key retention semantics beyond the above** — the server still never silently drops a value
  except as the direct result of a user's own write.
- **The client "remove field" affordance** for Part 1 — filed as a separate `SPORT-*` / `PROFILE-*`
  ticket. The server contract (`{key: null}` deletes) ships here; the UI to emit it does not.
- **Strict client-side required-field validation** — that is SPORT-6; this ticket ships 2b knowing
  SPORT-6 has to land to close the tightening-drops-a-record window.

## Tests

- `UserSportProfileServiceImplSpec` (real `ProfileAttributeFilter`, stubbed
  `getAttributeSchema(_) >> schemaWith(...)`) + `ProfileAttributeFilterSpec`:
  - **Part 1:** `updateProfile` with `attributes: {racket: null}` removes the stored key;
    `attributes: {racket: ""}` still stores `""` (not a delete); an omitted key is still left
    alone (merge unchanged).
  - **Part 2 / 2b:** a stored top-level key whose definition was physically removed is gone after
    the next `updateProfile`, **including one whose request carries no `attributes` at all**; a
    stored key under an `isAvailable: false` definition **survives, verbatim**; an undeclared
    nested field inside a still-valid `DEFINITION` record is stripped; a stored record missing a
    now-required field is dropped wholesale (the accepted 2b gap); a live key the request omits
    still survives; a `null` schema drops all stored attributes.
  - Existing `"updateProfile should merge new attribute keys without dropping existing ones"` must
    stay green (both keys are in the schema, so neither is an orphan).
- Integration test in `server/src/test/java/com/sportconnect/integration/` for the `null`-delete
  round trip — JSON `null` binding through `@RequestBody` into the `Map` and reaching the delete
  path, which the Spock specs (which build the request object directly) cannot prove.

---

## Implementation summary (2026-09-03, `/workon`)

### Scope as built

`updateProfile` only (Part 1 + Part 2). `createProfile` unchanged — both its paths already set
`attributes` purely from `filter(request)` (new row builds fresh, A7 reactivation replaces
wholesale), so there is no stored map to prune and `null` has nothing to delete. Keeping attributes
across a reactivation is a deliberate A7 revision, filed separately as **A20** (`isResume` mode),
which reuses this ticket's helper. Part 1's undecided alternatives (`DELETE …/attributes/{key}`,
replace-within-schema) stay rejected.

### What was built

| File | Change |
|---|---|
| `ProfileAttributeFilter.retainDefined(stored, schema)` | new package-private method — the Part 2 / "2b" re-filter of an already-stored map. Drops a top-level key with no physically-present definition; keeps an `isAvailable: false` attribute's/group's value **verbatim** (soft delete freezes, never destroys); re-runs a live key's value through the existing private `filterValue` so an undeclared nested `DEFINITION` field is stripped and a record failing its current definition (missing required field, `NUMBER` outside a tightened `min`/`max`) is dropped whole. `null` schema → empty. |
| `ProfileAttributeFilter.definedAttributesByKey` + `DefinedAttribute` record | new private traversal — every declared attribute keyed by leaf key **regardless of `isAvailable`** (the "physically defined" view), with a `live` flag = attribute and its group both still available. Distinct from `availableAttributesByKey`'s "may a write target this" view. |
| `ProfileAttributeFilter` class Javadoc | reworded — removal is now A10's job across two entry points (`retainDefined` + the caller's explicit-`null` drop), not "no way to delete". |
| `UserSportProfileServiceImpl.updateProfile` | merge block restructured. Fetch the schema once (cache-backed; sport already known active). Run the prune **unconditionally** via a new private `mergeAttributes(stored, requested, schema)` even when the request carries no `attributes`, then `validateAttributesSize` + `setAttributes` every call. |
| `UserSportProfileServiceImpl.mergeAttributes` | new private helper: `retainDefined(stored)` → `putAll(filter(requested))` → remove any key the **raw** request carries with an explicit `null` (Part 1 delete marker; `filter` has already dropped those entries so the raw map is read to see them). `requested == null` runs step 1 only. A20 will reuse this. |
| `CreateUserSportProfileRequest.attributes` Javadoc | updated — merge on update; two removal paths (explicit `null`, or definition deleted → pruned next update). |

No migration, entity, repository, `-api` interface, controller, or `SecurityConfig` change.

### Key decisions / non-obvious constraints

- **Prune runs on every `updateProfile`**, not only ones carrying `attributes` — a skill-level-only
  save still self-heals the profile. Costs one extra `SportLookupCache` hit; `setAttributes` on an
  unchanged map is a JPA no-op (content equality).
- **`isAvailable: false` values are kept verbatim, never re-validated.** That is the one place
  `filter()` could not be reused as-is (`availableAttributesByKey` drops those keys). Only *live*
  attributes get the 2b record re-validation.
- **2b's accepted gap:** because the live-key path reuses `filterValue` → `isValidRecord`, a schema
  *tightening* that is not a deletion (optional→required, type narrow, `NUMBER` bounds added) can
  drop a whole stored record on the user's next unrelated save. The client does not validate
  required fields yet; **SPORT-6** closes this.
- **`null` schema drops all stored attributes.** Consistent with "a definition-less sport offers no
  attributes", and only reachable if an admin clears a sport's whole schema after users filled it.

### Divergence from the approved plan

None. Built as designed.

### Tests

- `ProfileAttributeFilterSpec` — 11 new `retainDefined` cases: undefined key dropped; `isAvailable:false`
  attr **and** group value kept verbatim even when now-invalid; live invalid value dropped; undeclared
  nested `DEFINITION` field stripped; record missing a required field dropped; `NUMBER` outside
  tightened bounds dropped; `DEFINITION_LIST` re-filter drops a malformed element + an undeclared
  nested field; a `DEFINITION_LIST` that re-filters to empty keeps the key; `null` schema → empty;
  null/empty stored → empty.
- `UserSportProfileServiceImplSpec` — 5 new `updateProfile` cases: `{racket: null}` deletes;
  `{racket: ""}` stores `""`; a request with no `attributes` still prunes an orphan; prune + add + delete
  compose in one call; a schema that declares nothing wipes the stored map. Existing merge test stays
  green. (Also fixed: `setup()`'s permissive `getAttributeSchema` stub can only be overridden from a
  `then:` block, not `given:` — the new cases use `_ * … >>` in `then:`.)
- `server/src/test/java/com/sportconnect/integration/SportProfileAttributeWriteIntegrationTest` — new
  IT, 3 cases: JSON `null` through `@RequestBody` → `Map` → delete, re-read through the JSON column;
  `""` stored not deleted; prune runs with no `attributes` in the body.
- All green: `:modules:sport:sport-impl:test`, full `:server:test`.
