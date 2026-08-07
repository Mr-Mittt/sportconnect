# A5 · Cache sport lookups — sport data is effectively static at runtime

**Status:** DONE
**Module:** `modules/sport/sport-impl`
**Date:** 2026-08-07

## Design

Plan as approved before implementation:

- Cache mechanism: Spring's caching abstraction (`spring-boot-starter-cache`), backed by
  `ConcurrentMapCacheManager` — in-process, no new infrastructure, matching the ticket's own framing
  that Redis would be more infrastructure than ~12 near-static rows justifies. No TTL — evict-on-write
  is reliable enough given the write surface is exactly 3 enumerable methods
  (`createSport`/`updateSport`/`deleteSport`), all in `SportServiceImpl`.
- **Deviation from the ticket's literal wording** ("cache `getSportById`, `getSportsByIds`, and
  `getAllActiveSports` independently"): caching those 3 methods independently would have made
  `getSportsByIds(List<Long>)`'s `List` argument part of its cache key — one cache entry per distinct
  id combination, no shared invalidation with `getSportById`'s own cache region. Instead, one cached
  master map (`SportLookupCache.getAllSportsById(): Map<Long, Sport>`, all sports including inactive)
  backs all 4 read paths (`getSportById`/`getSportsByIds`/`getAllActiveSports`/`getAllSports`),
  filtered/derived in-memory. One cache entry, guaranteed-consistent across all 4.
- `SportLookupCache` is a separate `@Component` from `SportServiceImpl`, not a `@Cacheable` method on
  `SportServiceImpl` itself — `@Cacheable`/`@CacheEvict` are Spring-AOP-proxy-based, and a same-class
  (`this.`) call bypasses the proxy, silently never caching.
- `UserSportProfileServiceImpl.getUserProfiles()` (A4's batched lookup) routed through
  `SportService.getSportsByIds(...)` instead of calling `sportRepository.findAllById(...)` directly
  — user decision at pickup, so this read path benefits from the cache too. Every other
  `sportRepository.findById(...)` call in that class (`createProfile`, `getProfileById`, the update
  path) stays untouched — out of scope, per the same decision.

## What was built

- `build.gradle`: added `spring-boot-starter-cache`.
- New `com.sportconnect.sport.config.CacheConfig` — `@EnableCaching`, one `@Bean CacheManager` →
  `new ConcurrentMapCacheManager("sports")`.
- New `com.sportconnect.sport.service.SportLookupCache` (package-private `@Component`):
  ```java
  @Cacheable("sports")
  public Map<Long, Sport> getAllSportsById() {
      return sportRepository.findAll().stream()
              .collect(Collectors.toMap(Sport::getId, Function.identity()));
  }

  @CacheEvict(value = "sports", allEntries = true)
  public void evictAll() {
  }
  ```
- `SportServiceImpl`: `getSportById`/`getSportsByIds`/`getAllActiveSports`/`getAllSports` now read
  from `sportLookupCache.getAllSportsById()` instead of `sportRepository` directly, filtering/mapping
  in-memory (missing/inactive semantics unchanged — verified in tests). `createSport`/`updateSport`/
  `deleteSport` each call `sportLookupCache.evictAll()` after their existing `sportRepository.save(...)`.
  `getSportsByCategory`/`existsByName` untouched — not in the ticket's 3-read-path scope.
- `UserSportProfileServiceImpl`: `getUserProfiles()` now calls `sportService.getSportsByIds(sportIds)`
  instead of `sportRepository.findAllById(sportIds)`.

## Key decisions

- **No TTL** — evict-on-write only, since the write surface (3 methods, all in one class) is small
  enough to enumerate and verify completely via tests, rather than needing a safety net against a
  missed eviction path.
- **Cache includes inactive sports** — `getSportById` never filtered on `isActive` (a soft-deleted
  sport is still fetchable by id), so the cached master map can't be active-only either, or
  `getSportById` would start 404ing for a sport it used to return.

## Non-obvious constraints

- **AOP self-invocation**: `SportLookupCache` must stay a separate bean from `SportServiceImpl`. If
  `getAllSportsById()` were a `@Cacheable` method on `SportServiceImpl` itself and called via `this.`
  from another method on the same class, the call would bypass the Spring AOP proxy entirely and
  never actually cache — no compile error, no runtime error, just silently wrong behavior. Caught in
  design (Phase 3), not discovered as a bug.
- **First use of Spring's caching abstraction, and first Spring-context test, in this module** — every
  existing spec in `sport-impl` is a pure `Mock()`-based unit spec, which can't prove `@Cacheable`/
  `@CacheEvict` actually fire (mocks aren't AOP-proxied). `SportLookupCacheSpec` builds a real,
  isolated `AnnotationConfigApplicationContext` per test instead (see Tests below).

## Pre-existing bugs found and fixed (blocking this ticket's own verification)

Discovered while trying to run this ticket's own new tests — not part of the original ticket scope,
but fixing them was required to get a real pass/fail signal at all:

- **`sport-impl/build.gradle` was missing `test { useJUnitPlatform() }`** — every other module has
  this; without it, Gradle's `test` task silently executes **zero** Spock specs (Spock runs on the
  JUnit Platform; without this flag Gradle defaults to a JUnit 4 runner that doesn't discover them).
  `BUILD SUCCESSFUL`, no test-results XML produced at all — this module's entire test suite had
  never actually run.
- Once tests actually executed, this surfaced ~76 occurrences across all 4 of this module's test
  files where `Sport.id`/`UserSportProfile.id`/`UserSportProfile.sportId` (all `Long`) were built
  with `UUID.randomUUID()` instead — every one fixed. (`UserSportProfile.userId` is genuinely a
  `UUID` and was already correct.)
- `UserSportProfileServiceImplSpec`'s 3 `createProfile` tests were also missing a
  `profileRepository.findByUserIdAndIsActiveTrue(userId)` stub for the max-3-profiles check
  `createProfile` runs before `existsByUserIdAndSportId` — an unstubbed Spock `Mock()` call returns
  `null` for a `List`-returning method, so `.size()` on it threw `NullPointerException`. Added the
  missing stub to all 3.

None of this touched production entity behavior — `Sport`/`UserSportProfile` already had correct,
null-safe id-based `equals()`/`hashCode()` (initially suspected missing too; a partial file read
had cut off before reaching them — re-verified via a full read before touching anything).

## Tests

- `SportLookupCacheSpec` (new) — the only Spring-context test in this module. Builds a fresh
  `AnnotationConfigApplicationContext` (`CacheConfig` + `SportLookupCache`, `SportRepository`
  replaced with a `Mock()`) per test rather than `@SpringBootTest`, after `@Autowired`/`@SpringBean`
  field injection silently left the field `null` (first `spock-spring` context test in the whole
  repo — not worth the time diagnosing that specific wiring gap when a manual context is equally
  correct and fully self-contained). 2 tests: repeated calls hit the repository once
  (cache populated), `evictAll()` forces the next call to hit it again.
- `SportServiceImplSpec` — all id fixed to `Long`; read-method tests now mock
  `sportLookupCache.getAllSportsById()`; `createSport`/`updateSport`/`deleteSport` tests assert
  `1 * sportLookupCache.evictAll()` (and `0 *` on their early-exception paths).
- `UserSportProfileServiceImplSpec` — all `sportId`/profile `id` fixed to `Long`; `getUserProfiles`
  tests now mock `sportService.getSportsByIds(...)`; added a new test for the "sportService doesn't
  resolve an id" → `"Unknown"` fallback path; added the missing `findByUserIdAndIsActiveTrue` stub
  to the 3 `createProfile` tests described above.
- `SportSpec`/`UserSportProfileSpec` (entity specs) — id types fixed to `Long`, no behavior changes.

**Run:** `./gradlew :modules:sport:sport-impl:test` — 46/46 passing (5 + 5 + 2 + 15 + 19 across the
5 spec files). `./gradlew :server:test` — passing, full app context loads cleanly with the new
`CacheConfig`/`SportLookupCache` beans. `./gradlew :server:bootRun` — live-verified against real
Postgres: first `GET /api/sports` call issues one `SELECT ... FROM public.sports` (logged twice by
two independent, pre-existing SQL-logging mechanisms already configured on this app — not two real
repository calls); a second call produces zero SQL, confirming the cache hit.
