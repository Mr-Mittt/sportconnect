# A11 · Admin attribute-schema read + rename collision guard

**Status:** `DONE` · **Type:** Bug fix (two related gaps) · **Filed + shipped:** 2026-08-21 ·
**Origin:** found while implementing client `ADMIN-2`, and fixed in that same branch at the user's
request rather than deferred ·
**Related:** `A9` (introduced gap 1 as a documented consequence), `A6`/`A7` (the active-only
posture both gaps sit against)

## Why this exists

Both gaps were found by reading `SportServiceImpl` while building the sport admin screen, and both
were then **reproduced against a running server** before any fix was written. Neither was
hypothetical.

### Gap 1 — the schema read and write disagreed about inactive sports

`replaceAttributeSchema` resolves via `findById` and is explicitly documented as keeping an inactive
sport's schema editable. `getAttributeSchema` resolves through the active-only `SportLookupCache`
and reports an inactive sport as not-found. A9 recorded this asymmetry deliberately — *"Admin writes
bypass the cache; user reads do not"* — but did not follow the consequence through: **the admin
editor could write a schema it could never read back.**

That broke the editor's central flow, configuring a sport's attributes *before* activating it. Worse,
the obvious client-side workaround is actively dangerous: treating the 404 as "no schema yet" would
prefill an empty document over a real stored schema, and the next save would destroy it. ADMIN-2
therefore had to skip the request entirely and explain itself to the admin.

### Gap 2 — a rename onto an existing name returned 500

`sports.name` is `UNIQUE NOT NULL` (`V003__create_sports_tables.sql:7`), but unlike `createSport`,
`updateSport` had no `existsByName` guard, and `GlobalExceptionHandler` has no
`DataIntegrityViolationException` case. The constraint violation therefore fell through to the
catch-all `@ExceptionHandler(Exception.class)` and reached the caller as
`500 "An unexpected error occurred"`. A rename onto an existing name is the single most likely
mistake in an admin sport form, so the most likely error was also the least useful one.

## What shipped

### Gap 1 — a second, admin-only read (not a change to the existing one)

- **`SportService.getAttributeSchemaForAdmin(Long sportId)`** — resolves via `findById`, mirroring
  `replaceAttributeSchema`, so an admin can read back exactly what they are allowed to write.
- **`GET /api/sports/all/{sportId}/attribute-schema`**, `@PreAuthorize("hasRole('ADMIN')")`.

**Deliberately additive.** `getAttributeSchema` is unchanged, for two independent reasons:

1. **It is on the profile write path.** `UserSportProfileServiceImpl` calls it on *every* profile
   create and update (`:79`, `:237`) to filter submitted attributes. Switching it to `findById`
   would add a query to every one of those writes; the cache hit is deliberate.
2. **Its active-only behaviour is what keeps a deactivated sport invisible to members** (A6/A7), and
   the member-facing renderer (client `SPORT-2`) reads that same endpoint.

Worth recording, because it looked like a risk and wasn't: the active-only resolution in
`getAttributeSchema` is **not** what enforces `isActive` on the profile write path.
`createProfile` calls `requireActiveSportById` first (`:74`) and throws there, so by the time
`getAttributeSchema` is reached the sport is already proven active. Changing it would not have
opened an A7 hole — but the two reasons above stand regardless.

**Path naming** follows this controller's own existing convention for "the admin view that includes
deactivated rows": `GET /api/sports` is active-only, `GET /api/sports/all` is the admin twin. So
`/api/sports/all/{sportId}/attribute-schema` reads as "within the full catalogue, that sport's
schema". Considered and rejected: widening the existing GET (breaks A6/A7 invisibility for members),
and a `?includeInactive=true` flag gated by `@PreAuthorize("!#includeInactive || hasRole('ADMIN')")`
— the cleanest REST shape, but it depends on SpEL method-argument references that nothing else in
this codebase uses.

### Gap 2 — `existsByName` guard in `updateSport`

Throws `BadRequestException` with the same message `createSport` already produces. Guarded by
`!request.getName().equals(sport.getName())` so re-sending a sport's own unchanged name — exactly
what a form posting every field does — is not a false collision. Compared case-sensitively, matching
`existsByName`/`createSport`; this closes the 500, it does not add new normalisation.

## Tests

**Spock** (`SportServiceImplSpec`, 6 new): admin read returns a deactivated sport's document and
asserts `0 * sportLookupCache.getActiveSportsById()` (the cache is genuinely bypassed); returns
`null` for no attributes; throws for an unknown id; rename collision rejected with **no** `save`
call; rename to a free name proceeds; unchanged name never calls `existsByName`.

**Integration** (`SportAttributeSchemaIntegrationTest`, 5 new) — required here, not optional: this
adds an authorization boundary, and `/api/sports/**` is blanket `permitAll` in `SecurityConfig`, so
only a real request proves method security rejects anonymous callers.

- `adminGetAll_rejectsNonAdmin_withForbidden`, `adminGetAll_rejectsAnonymous_withForbidden`
- `adminGetAll_returnsSchemaForDeactivatedSport_whereMemberGetIs404` — asserts **both halves as a
  pair**, so a future change that "fixes" the admin read by weakening the member read fails here.
- `adminGetAll_returnsNotFoundForUnknownSport`
- `adminUpdateSport_rejectsRenameOntoAnExistingName_withBadRequest`

## Verification

`./gradlew :modules:sport:sport-impl:test` green · `./gradlew :server:test` green (11/11 in
`SportAttributeSchemaIntegrationTest`) · `./gradlew build` green.

**Confirmed against a running server**, before and after:

| Case | Before | After |
|---|---|---|
| `GET /api/sports/2/attribute-schema` (inactive, member path) | 404 | 404 — unchanged, by design |
| `GET /api/sports/all/2/attribute-schema` (inactive, admin) | did not exist | 200 + document |
| same endpoint, anonymous | — | 403 |
| `PUT /api/sports/2` rename to `"Badminton"` | **500** "An unexpected error occurred" | **400** "Sport with name 'Badminton' already exists" |
| `PUT /api/sports/2` re-sending its own name | 200 | 200 — not a false collision |

All dev data touched was restored.

## Client impact

Client `ADMIN-2` consumed this in the same branch: `useSportAttributeSchema` points at the admin
endpoint and its inactive-sport special case is **gone** — no `enabled` gating, no
`unavailableReason` state on `AttributeSchemaEditor`. Its e2e case flipped from "a deactivated sport
explains why its schema is unavailable" to "a deactivated sport is editable like any other".

The MSW handler deliberately keeps the **member** path 404-ing for an inactive sport alongside the
new admin path, so a regression pointing the editor back at the active-only endpoint fails a test
rather than passing silently. The client unit test does the same by not stubbing that URL at all.

## Not addressed

- **No `isActive` check on the caller.** A deactivated admin can still use these endpoints until
  their token expires — unchanged from A9's explicit decision; that closes with `U12`, not here.
- **`GlobalExceptionHandler` still has no `DataIntegrityViolationException` case.** This fixes the
  one path that was reaching it. Any other unique constraint in the app still surfaces as a 500 — a
  broader fix worth its own ticket.
