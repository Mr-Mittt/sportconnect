# A10 · No delete path for a stored profile attribute

**Status:** `TODO`
**Type:** Enhancement
**Filed:** 2026-08-20, during A9 pickup — an explicitly accepted gap, not a discovery.
**Depends on:** A9 (`DONE`) — the schema this would validate a delete against.

## Why

A3 shipped `UserSportProfile.attributes` with merge-only semantics: a write can add or overwrite a
key, never remove one. A9 was the natural place to close that, because with a server-side schema the
server finally knows the legitimate key set — the design doc raises exactly this
(`SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` §7) and leaves the call to the ticket.

The call, made during A9 pickup: **keep merge**. A key absent from the request keeps its stored
value; a key present with an invalid value is ignored. Both are deliberate. The consequence is that
**there is still no way to remove a stored attribute**, which is one of the three gaps A9's own
*Why* section cites.

## Concrete effects

- A user who set `racket: "Yonex"` cannot clear it. Sending `null` is ignored (the filter drops
  null values, see `ProfileAttributeFilterSpec`), and omitting the key means "leave it alone".
- Stale keys — written before A9, or belonging to a since-retired attribute — persist forever. Reads
  pass them through untouched, by design (schema evolution policy, design §5.1), but nothing can
  clear them.
- Those stale keys count toward the 4KB `MAX_ATTRIBUTES_BYTES` cap. A profile close to the limit can
  have a legitimate new write rejected with a 400, and the user has no way to reclaim the space.
  Rare, but it is a real dead end with no user-facing escape.

Note `LIST` attributes have a partial workaround: an empty list is a valid value and is stored, so a
multi-select can be cleared even though it cannot be removed. `STRING` and `ENUM` have no equivalent.

## Options (not yet decided)

1. **Explicit null deletes.** Key absent = keep; key present with `null` = remove. No new endpoint,
   no change to merge, and JSON keeps absent and explicit-null distinguishable. Requires
   `ProfileAttributeFilter` to stop treating null as invalid and start treating it as a delete
   marker, which its current tests pin the opposite way.
2. **`DELETE /api/sports/profiles/{profileId}/attributes/{key}`.** Explicit and REST-shaped, but a
   second write path to secure, test, and keep consistent with the filter's rules.
3. **Replace-within-schema.** Keys the schema defines but the payload omits get cleared; stale keys
   still preserved. Closes the gap without new syntax, but changes shipped behaviour for every
   caller and was explicitly rejected during A9 pickup.

## Out of scope

Anything touching stale-key *retention* policy — reads stay permissive and stale keys are never
silently dropped (design §5.1). This ticket is about giving the user an explicit way to remove a
value, not about the server deciding to.

---
