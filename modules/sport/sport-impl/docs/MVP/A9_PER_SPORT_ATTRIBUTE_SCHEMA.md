# A9 · Per-sport attribute schema (admin-managed, server-side)

**Status:** `TODO`
**Type:** Feature (Architecture)
**Filed:** 2026-08-20
**Depends on:** nothing (A3 `DONE` supplies the profile-side storage this validates against)
**Blocks:** client `ADMIN-2` (admin editor) and client `SPORT-2` (user-facing renderer, rescoped
onto this schema)
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` — read it first; this ticket is the
backend half and does not re-argue the decisions made there.

## Why

A3 (`DONE`) shipped `UserSportProfile.attributes` as a schema-less JSONB map with **no per-key
validation**, deliberately assigning "which keys belong to which sport" to a static client config.
That leaves three gaps: typo'd keys persist silently forever; there is no delete-a-key path (merge
semantics can overwrite a value but not drop it, because the server doesn't know the legitimate key
set); and adding a sport needs a client deploy before it has any attributes.

This ticket moves the key set server-side, where it can be validated and admin-managed. The design
doc records why this reverses A3's explicit "no schema table" call — the requirements changed
(runtime admin management, per-attribute soft delete, display grouping), not the cost estimate.

## What ships

**1. Migration `V058__add_attributes_schema_to_sports.sql`**

```sql
ALTER TABLE sports ADD COLUMN IF NOT EXISTS attributes_schema JSONB;
```

Nullable with **no default** — a `NULL` schema means "this sport offers no attributes", which is the
correct state for every existing row, so no backfill is needed. Register in
`db.changelog-master.xml` following the existing comment-per-include convention.

**2. `Sport.attributesSchema`** — same Hibernate 6 native JSON mapping A3 already established on
`UserSportProfile.attributes` (`@JdbcTypeCode(SqlTypes.JSON)` + `@Column(columnDefinition = "jsonb")`),
so no new dependency and a verified-working precedent in this exact module. Not
`@Builder.Default`-initialised — `null` is a meaningful state here, unlike A3's empty map.

**3. DTOs in `sport-api`** — the descriptor tree as real typed DTOs, not a raw `Map`:
`SportAttributeSchema` (`version`, `List<SportAttributeGroup> groups`), `SportAttributeGroup`
(`key`, `label`, `isAvailable`, `order`, `List<SportAttributeDefinition> attributes`),
`SportAttributeDefinition` (`key`, `label`, `type`, `options`, `isAvailable`, `order`,
`defaultValue`), `SportAttributeOption` (`value`, `label`), and a `SportAttributeType` enum
(`STRING`, `ENUM`, `LIST` — closed set, see design §3).

**4. Endpoints on `SportController`**

| Endpoint | Auth |
|---|---|
| `GET /api/sports/{sportId}/attribute-schema` | authenticated |
| `PUT /api/sports/{sportId}/attribute-schema` | `@PreAuthorize("hasRole('ADMIN')")` |

`PUT` replaces the whole document. Both return `ApiResponse<T>` per the repo convention.
**Do not add the schema to `SportResponse`** — `GET /api/sports` returns the whole catalog and would
carry every sport's full tree on every fetch (design §6).

**5. Write validation** — reject the document atomically, never half-apply. Per design §4: known
`type` only; **leaf keys unique across the whole sport** (the invariant that keeps profile storage
flat — get this one right); group keys unique; `ENUM`/`LIST` carry non-empty `options` with unique
values; `defaultValue` valid for its own type; keys match `^[a-z][a-zA-Z0-9_]*$`; serialized size
capped, mirroring A3's `MAX_ATTRIBUTES_BYTES` approach.

**6. Profile-write validation** — `createProfile()`/`updateProfile()` validate incoming `attributes`
against the sport's live schema: unknown key → reject, value invalid for its node's `type` → reject,
write targeting an `isAvailable: false` attribute → reject. Reads stay permissive: stored keys with
no current definition pass through untouched (design §5.1).

## Decisions to make during pickup

- **Does merge become replace?** Now that the key set is known, A3's merge-only `updateProfile()`
  could safely become "replace within the schema", closing the no-delete-a-key gap. This is a
  behaviour change to a shipped endpoint — decide explicitly and record it, don't let it happen as
  a side effect.
- **Seeding.** The admin page (`ADMIN-2`) doesn't exist yet, so Badminton's and Pickleball's initial
  schemas need to come from somewhere. Either a seed migration or leave both `NULL` until an admin
  fills them in — the second is honest but means the feature does nothing until `ADMIN-2` ships.
  Product call on what the actual Badminton/Pickleball attribute trees should contain.

## Caching

The column is on `sports`, so it rides `SportLookupCache` — which already caches whole `Sport`
entities and already `evictAll()`s after every admin write. Confirm the new `PUT` goes through the
same eviction path as the existing admin writes; if it does, **no new cache wiring is needed**.

## Tests

- Spock (`sport-impl`): document validation — each rejection rule above, plus a valid document
  round-tripping; profile create/update accepting a valid attribute and rejecting unknown / wrong-
  type / unavailable keys; stale stored keys surviving a read.
- **Integration test required** (`server/src/test/java/com/sportconnect/integration/`): `PUT
  /api/sports/{id}/attribute-schema` is an authorization boundary — a non-admin must get 403 through
  the real pipeline, not just a mocked unit check, per root `CLAUDE.md`'s testing rule. Expect to
  add `sports.attributes_schema` to `server/src/test/resources/schema.sql` first; that H2 mirror is
  maintained lazily and a missing column there is expected, not a symptom.
