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
