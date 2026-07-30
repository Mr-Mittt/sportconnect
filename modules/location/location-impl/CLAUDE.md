# CLAUDE.md — location-impl

Shared, sport-scoped venue directory. Any authenticated user can add a `Location` (crowdsourced,
like adding a venue the first time it's needed) — this is the shared place `Session` (see
`modules/session/session-impl`) and `Group`'s recurrence config (`modules/social/group-impl`)
both point at by id instead of each carrying its own raw location fields.

## Dependencies

| From | Why |
|---|---|
| `modules/location/location-api` | LocationService interface + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| `modules/sport/sport-api` | Batch `sportName` enrichment on `LocationResponse` |
| Hibernate Spatial + JTS | Same `geography(Point,4326)` pattern as `user-impl`/`post-impl` |
| JDK `java.net.http.HttpClient` | Outbound call to resolve short Google Maps links — no external library |

## Key Classes

| Class | Purpose |
|---|---|
| `Location` | Sport-scoped entity: PostGIS `Point` (nullable), name/address, `sourceMapsUrl`, `claimedByVendorId` (future Vendor placeholder) |
| `LocationServiceImpl` | CRUD/search, all sport-scoped; batch-resolves `sportName` via `SportService.getSportsByIds` — never per-row |
| `GoogleMapsUrlResolver` | Parses coordinates from a pasted Google Maps URL; resolves short links via a domain-allowlisted redirect follow |
| `LocationHttpClientConfig` | The one `HttpClient` bean, used only by `GoogleMapsUrlResolver` |

## Location Pattern

```java
// Same convention as User.location / Post.location — longitude=X, latitude=Y
Coordinate coord = new Coordinate(request.getLongitude(), request.getLatitude());
Point point = geometryFactory.createPoint(coord);
```

## Endpoints

```
POST /api/locations                    ROLE_USER — create (any authenticated user)
GET  /api/locations/{locationId}
GET  /api/locations/search?sportId=&q= paginated typeahead, sportId required
POST /api/locations/resolve-maps-url   ROLE_USER — resolve only, does not persist
```

## Run Tests

```bash
./gradlew :modules:location:location-impl:test
```

## Gotchas

- `Location.sportId` is required — a physical complex hosting multiple sports is modeled as
  multiple `Location` rows, not a many-to-many venue/sport relationship. `searchLocations`
  throws `BadRequestException` if `sportId` is null — there is no unscoped search.
- `resolveGoogleMapsUrl` never throws for "couldn't find coordinates" — it returns
  `latitude`/`longitude` as `null` and lets the caller fall back to manual entry. It only throws
  for a malformed URL or a host outside `GoogleMapsUrlResolver.ALLOWED_HOSTS`.
- The redirect-follow in `GoogleMapsUrlResolver.followRedirects` re-checks the allowlist on
  **every hop**, not just the initial URL — this is the SSRF guard. Do not relax it to "check
  once" when touching this code.
- No update/delete endpoint exists yet — `Location` is create-only in this round; duplicates/junk
  are an accepted crowdsourcing tradeoff (see `docs/BACKLOG_MVP.md`).
- `claimedByVendorId` is a bare nullable `Long` with no FK and no `Vendor` entity — don't build
  claim/ownership logic against it until a real Vendor/Facility domain exists.
