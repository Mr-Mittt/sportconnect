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
