# A10 · No delete path for a stored profile attribute

**Status:** `TODO`
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

## Part 1 — user clears their own value (options, not yet decided)

1. **Explicit null deletes.** Key absent = keep; key present with `null` = remove. No new endpoint,
   no change to merge, and JSON keeps absent and explicit-null distinguishable. Requires
   `ProfileAttributeFilter` to stop treating null as invalid and start treating it as a delete
   marker, which its current tests pin the opposite way.
2. **`DELETE /api/sports/profiles/{profileId}/attributes/{key}`.** Explicit and REST-shaped, but a
   second write path to secure, test, and keep consistent with the filter's rules.
3. **Replace-within-schema.** Keys the schema defines but the payload omits get cleared; stale keys
   still preserved. Closes the gap without new syntax, but changes shipped behaviour for every
   caller and was explicitly rejected during A9 pickup.

## Part 2 — orphaned-value pruning (approach decided 2026-09-03)

**Lazy, on the user's own attribute write. No bulk sweep, no background job, no new endpoint, no
admin-side action.**

`updateProfile` already runs the incoming request through `ProfileAttributeFilter` and merges the
result onto the stored map. Extend that merge: after filtering the request, walk the **existing**
stored `attributes` and drop every key the current schema **no longer physically defines**. The
profile self-heals the next time its owner saves anything.

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

## Tests

- `ProfileAttributeFilterSpec` / the `updateProfile` spec — a stored key whose definition was
  removed from the schema is gone after the next `updateProfile`, even when the request never
  mentions it; a stored key under an `isAvailable: false` definition **survives**; a live key the
  request omits still survives (merge unchanged); a read before any write still returns the orphan.
- Whichever Part 1 option is chosen gets its own coverage.
