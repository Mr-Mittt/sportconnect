# A13 · Localized attribute-schema labels

**Status:** `TODO`
**Type:** Feature
**Filed:** 2026-08-24
**Depends on:** A9 (`DONE`). Independent of A12 — but see *Sequencing*.
**Blocks:** A15, client `SPORT-2`
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` §7

## Why

Attribute labels are **admin-authored, dynamic content**. They cannot live in a client translation
bundle, because the client does not know which attributes exist until it fetches the schema. There is
no other correct home for them, so the schema is where they belong — independently of whether the app
has i18n infrastructure yet (it does not; there is no i18n library in `client/package.json`).

The scheduling argument for deferring is answered by the **authoring window**: whoever configures
Badminton is bilingual today and the Vietnamese labels already exist in draft. If the format holds one
string they are discarded, and someone must reconstruct them later for content authored by a person
who may no longer be around.

## What ships

**1. `label` becomes `Map<String, String>`** on every labeled node — `SportAttributeGroup`,
`SportAttributeDefinition`, `SportAttributeOption`, and (if A12 has landed) `SportAttributeField`.
Localizing group headers but not option values renders a Vietnamese heading over an English dropdown,
which is worse than not localizing.

**2. `SportAttributeSchema` gains `defaultLocale`.**

**3. Validation** — every labeled node carries an entry for `defaultLocale`; locale keys are BCP 47.
That first rule is what makes resolution total: a missing label is caught at `PUT` time by the admin
who can fix it, never at render time by a user staring at a blank field.

**4. Resolution** — exact locale → language-only (`vi-VN` → `vi`) → `defaultLocale`. Source is the
`Accept-Language` header; a `User.preferredLocale` may override it later, and needs no field today.

**5. Endpoint split**, using the two endpoints A11 already built — no new ones:

| Endpoint | Labels |
|---|---|
| `GET /api/sports/{sportId}/attribute-schema` | **resolved** — one string per node |
| `GET /api/sports/all/{sportId}/attribute-schema` (admin) | **raw maps** — the editor needs every locale |

## The one implementation trap

**Resolution goes in `SportController`, not `SportService.getAttributeSchema`.**

That service method is called by `UserSportProfileServiceImpl` on **every** profile create and update
(`:79`, `:237`) to filter submitted attributes — a path that never touches labels. Resolving inside it
would do per-locale work on every profile write for nothing, and would break the locale-independence
that lets `SportLookupCache` cache one document for all users.

Resolve **after** the cache read, on the way out of the `GET` only.

## Decisions already made

- **BCP 47 codes** (`en`, `vi`, `en-US`). Not `vn` — that is the ISO 3166 country code and matches
  nothing a browser sends.
- **Server-side resolution for users, raw for admins.** Cost: switching language needs a refetch.
  Accepted.
- Labels stay **unconstrained text** otherwise, as in v1.

## Sequencing — this is a breaking DTO change with a closing window

Changing `label` from `String` to `Map<String, String>` breaks the `sport-api` DTOs.

**It costs nothing right now**: A9 shipped unseeded, all 12 sports carry `NULL`, and there are
**zero schema documents in existence** — nothing to migrate, no dual-shape parsing.

**That window closes the moment any sport is seeded.** So: land this before A15, and do not seed
anything in v1 format in the meantime. If a v1 document does get written first, `label` will need a
Jackson deserializer accepting both a string and a map (coercing to `{ defaultLocale: value }`) —
entirely avoidable.

A12 and A13 are independent, but landing them close together is preferable: both change the document
format, and while nothing is seeded there is nothing to migrate between them.

## Tests

- **Spock** — `defaultLocale` missing on a node → reject; non-BCP-47 locale key → reject; resolution
  picks exact over language over default; a document with only the default locale resolves for any
  request locale.
- **Integration** — `GET` as a user with `Accept-Language: vi` returns resolved Vietnamese strings;
  the admin `GET` on the same sport returns the raw maps. Asserting both **as a pair** is the point:
  a future change that starts resolving on the admin endpoint would silently break ADMIN-2's editor.

## Out of scope

App-wide i18n (static UI strings, a locale switcher, `User.preferredLocale`) — all separate, and none
of it blocks this. Translating anything other than schema labels.

## Implementation summary (`DONE`, 2026-08-24)

### The approved plan

`label` became `Map<String, String>` on every labeled node (`SportAttributeGroup`,
`SportAttributeDefinition`, `SportAttributeOption`, `SportAttributeField`); `SportAttributeSchema`
gained `defaultLocale`. `SportAttributeSchemaValidator` gained a BCP-47-ish `LOCALE_PATTERN` and a
`validateLabel` check called at every labeled node: reject a missing/empty label map, reject any
malformed locale key present, reject a label missing the document's own `defaultLocale` entry — the
schema-level `defaultLocale` itself is checked first, before any node is walked, since every label
check depends on it. Resolution landed as a new standalone class,
`SportAttributeSchemaLabelResolver` (`sport-impl`/`service`, `public` — not package-private, since
`SportController` needs to call it directly), walking the raw tree once per request and resolving
each label via exact locale tag → language-only → `defaultLocale`, using `Locale` as a plain
`SportController.getAttributeSchema` method parameter (Spring's default `AcceptHeaderLocaleResolver`
resolves it from `Accept-Language` with no manual header parsing). `SportService`/`SportServiceImpl`
were **not** touched — resolution happens strictly after the cache read, inside the controller, per
the ticket's own "implementation trap" warning.

**The one open design question from pickup — typed `Resolved*` DTOs vs. widening `label` to
`Object`** — was resolved before implementation, confirmed with the user rather than decided
unilaterally: six new DTOs (`ResolvedSportAttributeSchema`, `ResolvedSportAttributeDefinitionType`,
`ResolvedSportAttributeGroup`, `ResolvedSportAttributeDefinition`, `ResolvedSportAttributeOption`,
`ResolvedSportAttributeField`) mirror the raw tree 1:1 with `label: String`, following the
`ResolvedMapsUrlResponse` naming precedent in `location-api`. `GET /api/sports/{sportId}/attribute-schema`
now returns `ResolvedSportAttributeSchema`; `GET /api/sports/all/{sportId}/attribute-schema`
(admin) is unchanged — it already returned the raw `SportAttributeSchema`, which now carries
`Map<String, String>` labels natively. No divergence from the approved plan during implementation.

### Key decisions

- **`ResolvedSportAttributeDefinitionType` has no `label` of its own** — only `name` (a type
  namespace, per A12) and `fields`; only `fields` needed resolving.
- **Label validation order matters for error quality, not correctness**: `validateLabel` checks
  every locale key's pattern *before* checking `defaultLocale` presence, so a document with a
  malformed extra locale key (e.g. `vi_VN` sitting alongside a valid `en` `defaultLocale` entry) is
  still rejected — it doesn't get a free pass just because the required key happens to be present.
- **`SportAttributeSchemaLabelResolver` is a plain `public` class with no `-api` interface.** The
  `-api`/`-impl` split in this codebase is for cross-domain contracts; this is intra-domain
  (`sport`'s own controller calling `sport`'s own resolver), and nothing else in `sport-impl`
  precedent (`SportAttributeSchemaValidator`, `ProfileAttributeFilter`) has one either — those are
  package-private because they're only ever used from within the same package, but this one has to
  be `public` since `SportController` (a different package) calls it directly.

### Tests

- `SportAttributeSchemaValidatorSpec`: **+13** (65 total, up from 52 pre-A13) — missing schema `defaultLocale`, four
  malformed-`defaultLocale` cases, a node missing the `defaultLocale` label entry, a node with no
  label at all, three malformed-locale-key cases (alongside an otherwise-valid `defaultLocale`
  entry, proving the "checked regardless" decision above), an option's label checked the same way
  as every other node, a definition field's label checked the same way, and a full multi-locale
  document that passes.
- New `SportAttributeSchemaLabelResolverSpec` (**11 cases**): null schema → null; exact locale tag
  wins; language-only wins when no exact match; falls back to `defaultLocale` when neither matches;
  a default-only document resolves identically for 5 different request locales (data-table); full
  tree resolution (`definitions` → `fields`, `groups` → `attributes` → `options`); every non-label
  field carried through unchanged.
- `SportAttributeSchemaIntegrationTest`: **+3** (16 total) — the paired resolved-vs-raw test
  (`Accept-Language: vi` returns Vietnamese strings, no header falls back to the document's
  `defaultLocale`, the admin endpoint returns both locales raw, all asserted in one test per the
  ticket's "as a pair" instruction), a label-missing-`defaultLocale`-entry rejection, and a
  malformed-schema-`defaultLocale` rejection.
- Existing specs fixed for the `label: String → Map` DTO change, no behavioral changes needed since
  none of them exercise labels functionally: `ProfileAttributeFilterSpec`, `SportServiceImplSpec`,
  `UserSportProfileServiceImplSpec` (builder calls and raw-map fixtures updated to
  `["en": ...]`/`[en: ...]`; `SportServiceImplSpec`'s two raw-`Map` fixtures needed
  `defaultLocale: "en"` and `label: [en: ...]` too, since they go through the real
  `objectMapper.convertValue` path).
- `:modules:sport:sport-impl:test`: **179/179**. `:server:test`: **121/121**, 11/11 real IT classes
  (no new authorization boundary — the two `GET` endpoints' `@PreAuthorize` behavior is unchanged,
  only their response shape/content changed — so no new IT class, extending the existing one).

### Non-obvious constraints for whoever touches this next

- **A15 (seeding Badminton/Pickleball) can now proceed** — this was the ticket blocking it. Every
  seeded document must declare `defaultLocale` and cover it on every labeled node from day one.
- **Client `SPORT-2`** (blocked on this ticket per the backlog) now has a real contract to build
  against: `ResolvedSportAttributeSchema`'s `label` is a plain string, no client-side locale logic
  needed — resolution is entirely server-side, by design (§7.4's accepted cost: switching language
  needs a refetch).
- **The admin editor's raw-map contract is what `ADMIN-2` needs to be aware of** for whenever it
  gains locale-editing UI: `SportAttributeSchema.label` is `Map<String, String>`, so an admin PUT
  omitting an existing locale's entry silently drops that translation (schema replace is whole-document,
  no partial update — same as every other field in this document, A9's existing behavior, not new
  here).
