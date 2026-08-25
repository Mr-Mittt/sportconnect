# A14 · Attribute-value suggestions and `searchScope`

**Status:** `TODO`
**Type:** Feature
**Filed:** 2026-08-24
**Depends on:** A12 (`TODO`) — carries the `searchScope` field and the `Reference` shape this consumes
**Blocks:** client `SPORT-6`
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` §8

## Why

`Reference` is an **entity link with a free-text fallback**: `{ id?, value }`. A user types a racket,
the client searches, and they either pick a known item (`id` set) or keep their own text (`id` null).

There is no Equipment domain yet, so there are no known items. Without something in between, users
type "Astrox 88D" / "astrox 88d pro" / "AX88D" for as long as the field exists, and the eventual
catalogue inherits a mess that has to be reconciled by hand.

This ticket builds the in-between: **suggestions aggregated from what users have already typed.**

## What ships

**1. A suggestion aggregate** — distinct `value`s stored in `Reference`-shaped attributes across all
profiles, grouped by the attribute's `searchScope`, ranked by frequency.

- **Frequency floor of N distinct users.** Distinct *users*, not occurrences, or one person
  re-editing their profile promotes their own string. Pick N and record the reasoning; the ticket
  does not prescribe it.
- **Not computed per keystroke.** It extracts distinct values out of JSONB across all profiles, so it
  needs a cached or periodically-refreshed aggregate with its own refresh policy. This is a **new,
  separate cache** — not part of `SportLookupCache`.

**2. A search endpoint** returning results whose `id` is optional from day one:

```jsonc
[ { "id": null,     "value": "Yonex Astrox 88D Pro" },
  { "id": "eq_123", "value": "Yonex Astrox 99 Pro"   } ]
```

Today every result carries `id: null`. When Equipment ships the same endpoint starts returning some
that do, and **the client does not change**. The response shape mirrors the storage shape, and both
treat unlinked as normal rather than as a missing case.

**3. `searchScope` becomes load-bearing.** A12 validates and stores it; here it becomes the pool key.

## Decisions already made

- **A suggestion is not a link.** Picking one stores `value` with `id: null`. It is spelling
  convergence, nothing more. The client must not present suggestions as verified — see *Why it
  matters* below.
- **`searchScope` lives on the attribute, not the definition** (§8.3). One `Reference` type serves
  many pools, and the granularity is product knowledge the server cannot infer: rackets do not pool
  across sports, court shoes do, running shoes do not belong in the same pool as court shoes.
- **Deduplicate on the normalized value, preferring the catalogue entry**, once both sources exist.
  Otherwise the same racket appears twice — once linkable, once not — and users pick the wrong one
  about half the time.
- **Build it with the attribute, not later.** Aggregation only compounds while there is no catalogue.

## Why it matters (do not value-engineer this away)

`PROGRESS.md` lists equipment as a **partner-matching filter**. Filtering, faceting and counting all
work on `id`; none work on free text. The **link rate** — the share of stored references carrying a
non-null `id` — is the number that decides whether that roadmap feature is buildable at all.

Which is exactly why the UI must not blur suggestions into links: if picking a suggestion *looks*
like linking, the link rate measures something that does not exist.

## Non-obvious constraints

- **Surfacing user text to other users is the reason the frequency floor exists.** It filters one-off
  typos and guarantees nothing a single user typed is ever shown to anyone else. That is one
  threshold doing two jobs; do not drop it as an optimisation.
- **It is self-reinforcing, including its mistakes.** A widely-repeated misspelling becomes a
  suggestion and gets reinforced. Acceptable: convergence on a *wrong* string is still convergence,
  and it is corrected once at catalogue-seeding time instead of 400 times.
- **Cross-domain rules apply in advance.** When Equipment exists, resolution goes through an `-api`
  interface with a **batch** method (`getItemsByIds(List<UUID>) → Map<UUID, Item>`), never per-item
  inside a `.map()` over a page. Do not design the endpoint in a way that makes that awkward later.

## Open at pickup

- **N for the frequency floor**, and the aggregate's refresh policy. Both are this ticket's to decide,
  with a number and a rationale rather than a default.
- **Should `searchScope` be a closed, validated set?** A free-form typo does not error — it silently
  creates a *new empty pool* that accumulates its own users' entries in isolation, and suggestions for
  one sport just stay mysteriously thin. Free-form is defensible while there is one real scope; the
  admin UI should surface scopes already in use so it is pick-not-type. Revisit when there is more
  than one.

## Out of scope

The Equipment domain itself, and the later resolution/backfill work (design §8.5 records the intended
approach: seed the catalogue *from* the aggregate, exact-match auto-apply, user-confirmed linking for
the ambiguous middle, and a non-destructive backfill that sets `id` and never rewrites `value`).

## Investigation notes (postponed at pickup, 2026-08-25)

Picked up, taken through most of Phase 1/design, then **explicitly postponed** — the aggregation
strategy needs another pass before implementation starts, not a default picked under pressure to
keep moving. Recorded here so the next pickup doesn't re-derive the same ground from scratch, but
**nothing below is a locked decision** — treat it as the leading candidate, not the approved plan.

**Two approaches were compared:**

1. **Periodic full-scan + Redis cache.** A `@Scheduled` job (same shape as `SessionGenerationJob`)
   re-scans every active profile's JSONB `attributes` on a fixed cadence, tallies distinct users per
   `(searchScope, value)` in Java, writes the ranked result into a Redis sorted set
   (`ZADD sport:attribute-suggestions:{searchScope} <count> <value>`), swapped in atomically via a
   temp-key + `RENAME` so reads never see a half-rebuilt aggregate. Matches design §12's "cache"
   wording and has real precedent in this codebase (`post-impl` B3's `StringRedisTemplate` counters).
   Rejected primarily because **it reintroduces a staleness window** (a value only becomes a
   suggestion on the next scheduled run, up to the cadence length later) for no longer than the
   full-scan itself actually costs — at current MVP scale (A6 caps the catalogue at 2 active sports,
   and A15 hasn't seeded anything yet, so this job would find zero `searchScope` attributes to
   aggregate if it ran today) the full scan is cheap, but the staleness is a real, avoidable UX cost
   regardless of scale.

2. **A persistent, write-time-maintained dictionary table** (the direction the discussion converged
   toward, not yet fully designed): a new table — sketched as
   `sport_attribute_value_index(profile_id, attribute_key, search_scope, value, user_id)` — synced
   incrementally in `UserSportProfileServiceImpl.createProfile`/`updateProfile`/`deleteProfile`
   (delete this profile's existing `(profile_id, attribute_key)` rows, insert fresh ones for
   whatever `searchScope`-bearing values are now stored — delete-then-insert rather than diffing
   old-vs-new, so it's correct regardless of what changed). Reads become a live, indexed
   `SELECT value, COUNT(DISTINCT user_id) ... GROUP BY value HAVING COUNT(DISTINCT user_id) >= :N
   ORDER BY count DESC` — no cache, no scheduled job, no staleness window, and the earlier "what
   happens on restart" concern disappears entirely since Postgres is already the durable store.
   Costs a Liquibase migration + new entity/repository this ticket previously assumed it didn't
   need, and a write-time hook that has to be gotten right on create/update/delete/reactivate.

**A real flaw was caught and fixed mid-discussion, worth preserving:** the dictionary read query
must **not** be parameterized by whatever the user is currently typing and re-run per keystroke —
that reintroduces exactly the "must not run per keystroke" cost the design doc warns about, just
against a smaller table instead of the full profile set. The fix: the endpoint takes **no**
prefix/query parameter at all. It returns the *full* ranked list for a `searchScope` once (fired on
field focus, not per keystroke), and the client filters that already-small, already-floor-passed
list locally as the user types — search-as-you-type becomes client `SPORT-6`'s concern, not a
backend query parameter. Under that call pattern (once per edit session, not once per character),
even the live `GROUP BY`/`COUNT(DISTINCT)` query is comfortably fast against an indexed table sized
by distinct-values-per-scope, not by profile count. A short TTL cache in front of that one query
(a few seconds to a minute) was floated as cheap insurance against many users opening the same
popular field at once, but was not settled as required.

**Still genuinely open, not reached before postponing:**
- Whether the dictionary-table approach is actually the final call, or whether it has its own
  unexamined problems (e.g. write amplification if a profile has several `searchScope` attributes,
  correctness of the delete-then-insert hook across `createProfile`'s reactivation path, whether
  `DEFINITION_LIST`'s multiple values-per-attribute need special handling in the delete-then-insert).
- The frequency floor **N** and its rationale — never reached; a candidate of 3 was floated but not
  confirmed.
- Whether a short TTL cache in front of the read query is worth adding now or only if it's ever
  measured as needed.
- Endpoint auth (public vs. `isAuthenticated()`, matching `getAttributeSchema`'s precedent) — never
  reached.

Given this ticket is inert until **A15** ships anyway (see *Why*), postponing costs nothing in
practice — reordered to the back of the Open queue in `BACKLOG_MVP.md` rather than left `IN
PROGRESS` on a half-decided design.
