# A9 · Per-sport attribute schema (admin-managed, server-side)

**Status:** `DONE`
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

## Implementation summary (`DONE`, 2026-08-20)

### Deltas from the ticket and the design doc

Four things differ from what was written down. All were decided during pickup, and are recorded here
because the ticket and design doc still say otherwise in places.

1. **Migration is `V059`, not `V058`.** A8 took `V058` earlier the same day.
2. **Profile writes are lenient, not strict.** The ticket (item 6) and design §7 both specify
   *"unknown key → reject"*. **Overridden by explicit product decision:** unknown keys, values
   invalid for their type, and writes targeting an unavailable attribute are all **silently
   dropped**, and the rest of the write proceeds. Merge semantics are retained — a key absent from
   the request keeps its stored value. Profile writes therefore never fail on `attributes` content;
   only on size.
3. **`GET` needed an explicit annotation to be authenticated at all.** The ticket says
   "authenticated" without noting that `SecurityConfig:95` makes all of `/api/sports/**`
   `permitAll`, so the endpoint would have answered anonymous callers. Gated with
   `@PreAuthorize("isAuthenticated()")` rather than `hasRole('USER')`, because nothing in the
   codebase grants `ADMIN` (it is provisioned directly in the DB), so an admin-only account may not
   also hold `USER` — and client ADMIN-2 reads this endpoint to render its editor.
4. **The design doc's caching section is stale.** §6.1 refers to `getAllSportsById()` caching whole
   `Sport` entities; A7 renamed it `getActiveSportsById()` and made it active-only. The conclusion
   still holds — zero new cache wiring — but the method name there is wrong.

### The approved plan (Phase 3)

A migration adds a nullable `attributes_schema JSONB` to `sports`, unseeded. `Sport` gains an
**untyped** `Map<String, Object>` field. Five typed DTOs land in `sport-api`. `SportService` gains
`getAttributeSchema` (active-only, cached) and `replaceAttributeSchema` (repository-direct, evicts
the cache). Two package-private collaborators split the asymmetric validation: a strict validator for
admin writes, a lenient filter for profile writes. Two endpoints — `GET` authenticated, `PUT` admin.
Spock specs plus an authorization-boundary integration test. Caps: 4KB profile (unchanged from A3),
16KB schema.

### What was built

| File | Change |
|---|---|
| `V059__add_attributes_schema_to_sports.sql` | New. Nullable JSONB column, no default, no seed. |
| `db.changelog-master.xml` | Registered V059. |
| `Sport.java` | `attributesSchema` as `Map<String, Object>`, reusing A3's JSON mapping. |
| `SportAttributeSchema` / `Group` / `Definition` / `Option` / `Type` (`sport-api`) | New. The typed document tree. |
| `SportService.java` | `getAttributeSchema` + `replaceAttributeSchema`. |
| `SportServiceImpl.java` | Both methods; gained `SportAttributeSchemaValidator` + `ObjectMapper`. |
| `SportAttributeSchemaValidator.java` | New. Strict, atomic document validation. |
| `ProfileAttributeFilter.java` | New. Lenient, never-throwing profile-attribute filter. |
| `SportAttributeValues.java` | New. The one shared "is this value valid for this type" rule. |
| `UserSportProfileServiceImpl.java` | Filters attributes on create and update; gained the filter dep. |
| `SportController.java` | The two endpoints. |
| `GlobalExceptionHandler.java` (`common`) | **Scope expansion — see below.** |
| `schema.sql`, `server/build.gradle` | H2 column; `sport-api` onto the test classpath. |

### Key decisions

- **The entity field is untyped on purpose.** `Sport` is loaded on the hot path by
  `SportLookupCache.getActiveSportsById()`. A strongly-typed field would make a document that stops
  deserialising — after an attribute type is added or retired — throw while loading *the whole sport
  catalogue*, not just one schema. Untyped contains that blast radius to `getAttributeSchema`, the
  only place that parses it, and reuses A3's already-verified JSON mapping rather than introducing an
  unproven POJO-to-JSON one.
- **One shared value-validity rule, two behaviours.** `SportAttributeValues` is used by both the
  strict validator (for `defaultValue`) and the lenient filter (for user values). Sharing it means a
  schema can never declare a default that the profile path would then silently drop — a divergence
  that would only surface when a real user hit it.
- **Admin writes bypass the cache; user reads do not.** `replaceAttributeSchema` resolves via
  `findById` like `updateSport`/`deleteSport`, so an *inactive* sport's schema stays editable, while
  `getAttributeSchema` reads the active-only cache, so an inactive sport 404s (A7's collapse).
- **No `isActive` checks added,** matching A7's posture by explicit decision. A deactivated admin can
  still rewrite a schema until their token expires. That closes with U12, not here.

### Scope expansion: `@PreAuthorize` denials returned 500 app-wide

Writing the integration test surfaced a **pre-existing bug affecting the entire application**:
`GlobalExceptionHandler`'s `@ExceptionHandler(Exception.class)` catch-all swallowed Spring Security's
`AccessDeniedException`, so **every `@PreAuthorize` denial returned 500 "An unexpected error
occurred" instead of 403** — including the four admin endpoints already shipped in `SportController`,
and every `hasRole('USER')` endpoint in every module.

It went unnoticed because no integration test had ever exercised a method-security denial. Every
existing `isForbidden()` assertion in the suite (19 in `PostAccessGate`, 22 in
`SessionPostAccessGate`, and others) comes from the app's own domain `ForbiddenException`, which was
always mapped correctly. The three existing unauthenticated tests assert **401** and pass through a
different mechanism entirely: the filter chain rejects them before method security, because their
paths are not `permitAll`. `/api/sports/**` is effectively the only blanket-`permitAll` namespace
that is also method-gated, which is precisely why the bug could hide there. There remains **zero**
wrong-role coverage elsewhere in the suite — A9's `put_rejectsNonAdmin_withForbidden` is the first
test of its kind in this codebase.

Fixed here rather than deferred, on the user's explicit call, because A9's own acceptance criterion
is a 403 through the real pipeline. The handler returns a fixed `"Access denied"` message rather than
Spring's own, which is an internal detail and version-dependent.

### Non-obvious constraints

- **The 4KB profile cap now measures less than it used to.** The filter drops unknown keys *before*
  `validateAttributesSize` runs, so junk no longer counts toward the cap — only schema-valid data
  does. The cap still matters because `STRING` values are free text and unbounded by the schema.
- **Size stays a loud 400 while invalid content is silent.** Deliberate: an oversized payload has no
  sensible partial answer, since choosing which keys to discard would be arbitrary.
- **`sport-api` was not on the server's compile classpath** (declared `implementation`, not `api`, by
  `sport-impl`). Added as `testImplementation`, following the existing `auth-api` precedent in the
  same file.
- **An empty `LIST` is stored, not dropped** — the only way to clear a multi-select given there is no
  delete-a-key path.

### Divergence during implementation: existing specs' premises broke

`UserSportProfileServiceImplSpec` predates A9 and asserts on free-text keys (`dominantHand`,
`strokeStyle`, `blob`) that no schema declares. Under A9 the filter drops all of them, so those cases
would have silently become tests of the drop path instead of what they were written to test. Fixed by
stubbing a schema in `setup()` that offers exactly those keys, preserving each case's original
intent — including the two oversized-payload cases, which only still reach the size check because
`blob` is now schema-known.

`ProfileAttributeFilter` and `SportAttributeSchemaValidator` are constructed **real, not mocked**, in
every spec that uses them. They are pure functions, and mocking them would prove only that the mock
returned what it was told — the exact failure mode that let A7's bug survive.

### Tests

- `sport-impl`: **104 pass, 0 fail** (up from 59). New: `SportAttributeSchemaValidatorSpec` (24
  cases, one per rejection rule — bundled into a single "invalid document" test they would rot
  silently, since the test passes as soon as any one rule fires), `ProfileAttributeFilterSpec` (14
  cases, none of which assert an exception, which is the point), and 7 new `SportServiceImplSpec`
  cases for the two service methods.
- `server`: `SportAttributeSchemaIntegrationTest` — 6 cases through real MockMvc/Spring/H2:
  non-admin `PUT` → 403, anonymous `PUT` → 403, anonymous `GET` → 403, admin `PUT` → `GET` round
  trip through the real JSON column, duplicate-leaf-key rejection proven atomic (the follow-up `GET`
  shows nothing was written), and deactivated sport → 404.

### Not done, deliberately

No seeded Badminton/Pickleball schemas (both `NULL`; the feature is inert until ADMIN-2 ships), no
delete-a-key path (**A10** filed), no `isActive` checks, no `NUMBER`/`BOOLEAN` types, no optimistic
locking, and the schema is not added to `SportResponse`.

### Client impact (CLIENT-NOTIF-4 check)

`SportAttributeType` (`STRING`/`ENUM`/`LIST`) is a **client-mirrored enum** — the client branches on
it to choose a form control. Its consumers are client `ADMIN-2` (editor) and `SPORT-2` (renderer),
both already blocked on A9, so their cases land in those tickets rather than needing one filed
alongside. Adding a member later is a client-facing change and must carry the client case with it.

### Known flaky test, pre-existing and unrelated

The first full `:server:test` run after this work failed 6 tests, all of
`SessionEventsConsumerIntegrationTest`, with `AmqpIOException: java.io.IOException` — a connection
failure to the Testcontainers RabbitMQ broker, not an assertion failure. That is **SESSION-22**
(`modules/session/docs/MVP/SESSION-22_FLAKY_SESSION_EVENTS_CONSUMER_RABBITMQ_IT.md`, `TODO`), already
filed as a known flake measured at 6-failed/6-passed across 12 same-code runs. A `--rerun-tasks` on
identical code passed 111/111, confirming it. Noted because SESSION-22's own filing records these
failures being mis-attributed to A7 before re-runs disproved it — the same trap was available here.

### Live verification against the running app

Beyond the IT suite, the endpoints were exercised over real HTTP against
`./gradlew :server:bootRun` on the dev Postgres, because MockMvc does not prove the real filter
chain behaves the same way:

| Request | Result |
|---|---|
| anonymous `GET /api/sports/1/attribute-schema` | **403** `{"success":false,"message":"Access denied"}` — not the 200 the blanket `permitAll` would otherwise give |
| anonymous `PUT /api/sports/1/attribute-schema` | **403** |
| `GET /api/sports` (public catalogue) | **200** — unchanged, no regression from the `AccessDeniedException` handler |
| anonymous `POST /api/sports` (pre-existing, was 500) | **403**, nothing written |
| anonymous `GET /api/sports/all` (pre-existing, was 500) | **403** |
| anonymous `DELETE /api/sports/1` (pre-existing, was 500) | **403** |

Migration confirmed applied: `attributes_schema` is `jsonb`, `is_nullable = YES`, no default; V059
recorded `EXECUTED`; all 12 existing sports have a `NULL` schema, which is the intended unseeded
state.

**Pre-existing quirk noticed, not fixed:** an anonymous `POST /api/sports` with an *invalid* body
returns **400 "Validation failed"** listing the failing fields, rather than 403 — Spring validates
`@Valid @RequestBody` during argument resolution, before the proxied method invocation where
`@PreAuthorize` fires. So an unauthenticated caller can discover a DTO's validation rules. Minor,
long-standing, affects every validated admin endpoint, and orthogonal to A9 — recorded here rather
than fixed, since changing handler-vs-security ordering is a far larger change than this ticket's
subject. A valid body correctly returns 403.
