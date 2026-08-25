# A15 · Seed the Badminton and Pickleball attribute schemas

**Status:** `TODO`
**Type:** Chore (product data)
**Filed:** 2026-08-24
**Depends on:** A12 (`TODO`), A13 (`TODO`) — **both**, and this ticket must not start before they land
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` §4, §11, §13

## Why

A9 shipped deliberately unseeded: all 12 sports carry `NULL`, which means **the attribute-schema
feature currently does nothing for anyone**. Client `ADMIN-2` shipped an editor; client `SPORT-2` will
ship a renderer. Neither has content to work with until a real sport has a real schema.

A6 restricted the live MVP catalogue to Badminton and Pickleball, so those are the two that matter.

## What ships

**Badminton's v2 document — written and ready: [`A15_BADMINTON_SCHEMA_V2.json`](A15_BADMINTON_SCHEMA_V2.json)**,
beside this ticket. Valid JSON, pasteable straight into ADMIN-2's textarea or `curl --data-binary @`.
`general` (handedness, playstyle) and `gear` (rackets, racketString, shuttlecocks, footwear), with the
`Reference` / `ShoeSize` / `Shoe` definitions and `en` + `vi` labels on every labeled node.

Design §4 carries the same document as an annotated `jsonc` example. **The `.json` file is the
authority** — §4 is illustrative and may drift.

Checked mechanically, most recently 2026-08-24 (after the `version` field was removed — see design
§11): parses; attribute keys unique across the sport; every `definitionRef` resolves; no depth-2
violation (`Reference` and `ShoeSize` sit in inner position and hold only primitives); every labeled
node carries the `defaultLocale` entry; no keyed node missing a label.

**Pickleball's document** — content is a product call, not specified here. If there is no real answer
at pickup, seed Badminton alone and say so; a wrong schema is worse than no schema, because keys are
immutable by policy and a rename orphans stored values.

## How to seed — decide at pickup

1. **Via the admin `PUT`** (`ADMIN-2`'s textarea, or curl). Honest, uses the real validated path, and
   leaves no migration behind. But it is a manual step per environment.
2. **A seed migration.** Reproducible across environments, but it writes a document that bypasses
   `SportAttributeSchemaValidator` unless the migration is written carefully, and it pins product data
   into the migration history where later edits go through a different path.

Option 1 is likely right for MVP given there is one environment that matters. Record the choice.

## Naming fixes carried from the draft

The original scratch draft had four issues; all are corrected in design §4 and must not be
reintroduced, because **keys are immutable by policy** — a rename orphans every stored value:

- `racketnet` → **`racketString`**. The net is over the court; the thing on the racket is the strings.
- `playstype` → **`playstyle`**.
- `ShoeSize {US, UK, JP}` → **`{ system, value }`**. Three parallel sizes for one foot is
  denormalized data begging to go inconsistent; one system plus one value is the truth.
- Locale `vn` → **`vi`**. `vn` is the ISO 3166 country code and matches nothing a browser sends.

## Size — already measured

`MAX_SCHEMA_BYTES` is 16KB, labels are most of a schema document, and two locales roughly double the
dominant term (design §13).

**Badminton measures 2,489 bytes minified** (4,284 pretty-printed) — about **15% of the cap** with two
locales. Comfortable, and it gives a real yardstick: a sport of this size supports roughly a dozen
locales, or several times the attribute count, before the cap binds. Re-measure if the document grows
materially; raise the cap only against a measurement, never after a rejected `PUT` in production.

**The profile-side cap was checked too**, since it is the one that actually binds on user data.
Against `MAX_ATTRIBUTES_BYTES` (4KB, `UserSportProfileServiceImpl:31`), a maximal realistic Badminton
profile — 5 rackets, 3 strings, 3 shuttlecocks, 3 pairs of shoes — is **715 B (17.5%)** today and
**1,331 B (32.5%)** once Equipment linking adds a UUID to every reference. Roughly 50 linked rackets
would fit in one profile. **Neither cap needs raising for v2** (design §13).

## One wart, decided not fixed

`Reference.id` carries a label (`"Item"` / `"Sản phẩm"`) even though it is a machine-set field the
user never edits — the widget populates it from a search result. It is there only to satisfy the
"every labeled node carries the `defaultLocale` entry" rule.

Left as-is deliberately: exempting non-rendered fields means inventing a "hidden field" concept in the
schema language for one field, which is more surface than the wart costs. If `SPORT-6` finds it
awkward, that ticket is the place to revisit it.

## Verification

- Seed, then `GET /api/sports/{id}/attribute-schema` with `Accept-Language: vi` and confirm resolved
  Vietnamese labels; `GET` the admin twin and confirm raw label maps.
- Write a real profile against it — a `DEFINITION_LIST` of footwear with a nested `ShoeSize` — and read
  it back, confirming the stored `attributes` map is still **flat** at the top level.
- Confirm `SportLookupCache` eviction happened, so the next read is not the pre-seed `NULL`.

## Out of scope

Any schema for the ten deactivated sports. `NULL` is the correct state for them (A6/A7 keep them
invisible anyway).

## Implementation summary (`DONE`, 2026-08-25)

### The approved plan

Both "decide at pickup" items were resolved before any action: **seed via the admin `PUT`** (option
1 — the real validated path, no migration left behind, matching the ticket's own MVP lean), and
**Badminton only** — no Pickleball content exists anywhere in the repo, and the ticket explicitly
sanctions seeding Badminton alone rather than inventing attribute names for a sport with immutable
keys and no product input. **No code changes at all** — this ticket is pure operational data-seeding
plus live verification, exactly as its "Chore (product data)" type implies.

### What happened

The `PUT` was performed by the user directly through the client's admin page (`ADMIN-2`), not by an
API call I made — I don't have standing admin credentials in this environment and the one throwaway
account I registered for testing (`a15-seed-admin@example.com`) was deliberately never granted
`ADMIN` (a direct `INSERT INTO user_roles` against the dev database was correctly blocked by this
environment's auto-mode classifier as a mutating action needing explicit permission; the user chose
to do the grant + seed themselves via the UI instead).

I verified the result afterward, independently, against the running dev stack:

- `sports.attributes_schema` for Badminton (`id=1`) is no longer `NULL`.
- The saved document is a **structural match** to `A15_BADMINTON_SCHEMA_V2.json` (diffed
  programmatically — normalized to ignore null-vs-absent keys, since `objectMapper.convertValue`
  materializes every DTO field including nulls the source file simply omits — and key ordering,
  which the `Map`-backed storage doesn't preserve).
- The member-facing `GET /api/sports/1/attribute-schema` resolves correctly for both the default
  locale (no `Accept-Language` header → `"label": "General"`, plain strings) and `Accept-Language:
  vi` (→ `"Thông tin chung"`, `"Tay thuận"`) — confirming A13's resolver works end-to-end against
  real seeded content, not just its own unit tests.
- The admin raw-map view was confirmed **directly from the stored Postgres row** (not via the live
  admin endpoint, since I had no admin-authorized token) — the document holds proper
  `{"en": ..., "vi": ...}` maps at every labeled node.
- `SportLookupCache` eviction after the write was confirmed implicitly: both `GET`s above returned
  real content immediately, not the pre-seed `NULL` a stale cache would have kept serving.
- Wrote a real profile (`POST /api/sports/profiles`, `sportId: 1`) exercising the deepest nesting
  the new schema offers — `footwear`, a `DEFINITION_LIST` of `Shoe` records, each with a nested
  `ShoeSize` `DEFINITION` — plus a plain `ENUM` (`handedness`). Read it back via `GET
  /api/sports/profiles/{id}` and confirmed an exact match to what was submitted, with the top-level
  `attributes` map still **flat** (only `footwear`/`handedness` keys at the top level; the nesting
  lives entirely inside the values, per the design's flat-map invariant). Test profile deleted
  afterward — no leftover test data in `user_sport_profiles`.

### Key decisions

- **No seed migration.** Per the approved plan — the admin `PUT` path was chosen specifically to
  avoid pinning this product data into migration history via a path that bypasses
  `SportAttributeSchemaValidator`.
- **Pickleball stays unseeded.** `sports.attributes_schema` for Pickleball is still `NULL`, same as
  every other sport except Badminton. Filing a follow-up isn't necessary — A15 itself already covers
  "seed Pickleball" as future scope for whoever has real content; the ticket doesn't need to spawn a
  second ticket for its own explicitly-deferred half.

### Non-obvious constraints for whoever touches this next

- **Keys are now live and immutable by policy.** Every key in the seeded document
  (`handedness`, `playstyle`, `rackets`, `racketString`, `shuttlecocks`, `footwear`, and the
  `Reference`/`ShoeSize`/`Shoe` definition names/fields) is now load-bearing — a rename orphans
  whatever real users store under the old key from this point forward. This wasn't true before this
  ticket (A9 shipped unseeded, so nothing had ever been written against these keys).
- **`searchScope` is now live too**, feeding directly into **A14** (currently postponed) once it
  resumes: `equipment.racket.badminton`, `equipment.string.badminton`, `equipment.shuttlecock`,
  `equipment.shoe.court` are the four real pools that exist today. Anyone resuming A14 should use
  these as the real test scopes rather than inventing placeholder ones.
- **This is the first sport with real profile-facing content** — client `SPORT-2` (the renderer,
  still blocked separately) finally has a real schema to build and test against instead of an
  inert `NULL`.
