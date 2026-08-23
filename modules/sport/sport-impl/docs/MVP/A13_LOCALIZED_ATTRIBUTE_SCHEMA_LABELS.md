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
