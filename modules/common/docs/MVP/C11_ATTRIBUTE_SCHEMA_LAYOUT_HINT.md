# C11 · `layout` presentation hint on attribute-schema nodes

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** `C5`–`C9` (the `common.attributes` DTO tree). Pairs with client `SPORT-13` /
`SPORT-14` / `SPORT-15`, which define and consume the vocabulary.
**Filed:** 2026-09-09, from the client `SPORT-13` `/ticket` session — the client layout tickets
add a schema-driven per-element/per-type `layout` rendering hint but the schema DTOs have no field
to carry it, so they ship client-types + MSW-seed only until this lands.
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` (object shape + vocabulary, shared with
the client tickets).

## Scope

- Add an optional `layout` **object** to the attribute-schema node model in
  `com.sportconnect.common.attributes` — the raw `AttributeNode` / `AttributeField` / `Group`
  sealed sets and their `Resolved*` twins. Shape (mirror client `SPORT-13`'s `AttributeLayout`,
  reconcile names at pickup):
  - `id` — required, the layout id (an opaque string server-side; client owns the vocabulary).
  - `icon` — optional string (Tabler icon name).
  - `format` — optional string (value-format token).
  - Tolerate unknown extra properties (client may add more before the backend does).
- Carry it through `AttributeJson` round-trip, the single-schema + derived validators
  (accept/ignore leniently — presentation only, **never** a validation gate), the resolver (pass
  through to `Resolved*`), and the derived-schema expander (a `#ref` node's own `layout` survives
  expansion).
- Sport + session schema seeds / admin `PUT` docs updated so a real schema can set it;
  `SportService` `-api` resolved DTOs expose it.
- No server-side behavioural change — an opaque passthrough the client interprets.

## Out of scope

Client rendering (`SPORT-13`). Any admin schema-editor UI. Server-side interpretation of `id` /
`icon` / `format`.

## Tests

Round-trip parity (a node with a full `layout` object survives serialize/deserialize); validators
ignore it (a schema with `layout` still validates, an unknown `id` is not rejected); resolver
carries it to `Resolved*`; a `#ref` node's `layout` survives derived-schema expansion.
