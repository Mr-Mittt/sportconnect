# SPORT-6 · Reference field widget — search, link, free-text fallback

**Status:** `TODO` · **Type:** Component · **Filed:** 2026-08-24 ·
**Depends on:** backend **A14** (hard — the search endpoint) and client **SPORT-2** (hard — the
renderer this plugs into) ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` §8

## Why

Schema v2 introduces `Reference` — `{ id?, value }` — the shape behind rackets, strings, shuttlecocks
and footwear. It is an **entity link with a free-text fallback**: the user types, the client searches,
and they either pick a known item (`id` set) or keep their own text (`id` null).

`SPORT-2` renders the schema generally. This ticket is the one field type that needs real interaction
rather than a form control.

## What ships

A combobox rendered for any attribute carrying a `searchScope`:

1. User types → debounced query against A14's search endpoint for that scope
2. Results render as a dropdown; the user may pick one **or** keep what they typed
3. On pick, store `{ id, value }` from the result. On free text, store `{ id: null, value: <typed> }`
4. Empty `searchScope` ⇒ plain text input, no dropdown

Used inside `DEFINITION` (one reference) and `DEFINITION_LIST` (repeating rows with add/remove).

## The distinction the UI must not blur

Today **every search result carries `id: null`** — they are aggregated strings other users typed, not
verified catalogue items (design §8.4). Picking one is **spelling convergence, not linking**.

If suggestions are presented as verified, users believe their racket is linked when it is not, and the
**link rate** — the number that decides whether equipment-based partner matching is ever buildable
(§8.6) — measures something that does not exist.

Once the Equipment domain ships, the same endpoint returns a mix. Render the two kinds distinctly:
catalogue items first, free-text suggestions below under a heading such as "others typed". **The
client code does not otherwise change** — the response shape already carries the optional `id`, which
is the whole point of §8.4's design.

## Required-field validation

Definition fields carry `isRequired`. The client is the **strict** half of the deliberate asymmetry in
design §6.2: block the save, show an error, keep the user's input. The server silently drops instead.

Two corollaries to honour:

- A `200` does **not** mean everything sent was stored. Do not assume it.
- The server does not rely on this validation — it is a UX affordance, not a security control.

For `Reference` specifically, `value` is required and `id` is not, so a row with no text is invalid
and must not be submittable.

## 10-item cap on `DEFINITION_LIST`

The server caps every `LIST`/`DEFINITION_LIST` value at **10 items**
(`SportAttributeValues.MAX_LIST_ITEMS`, design §9.2) — a hardcoded default, not something the schema
declares, so it cannot be read off the response and must be hardcoded here too.

**The "add row" control must disable itself at 10 rows.** Same strict-client/lenient-server split as
`isRequired` above, and the failure mode if this is skipped is worse than usual: the server does not
reject an 11-item submission with an error — it **silently drops the whole value** and the profile
keeps whatever was stored before this save (A3's merge semantics: a key absent from the filtered
output keeps its stored value). A user who adds an 11th racket, edits a couple of the other 10, and
clicks Save sees a `200` — but none of it took effect, not even the edits to the 10 that were
individually fine, since the whole submitted list was rejected as one unit. They believe it saved;
the profile silently reverts to its pre-save state. Blocking at the UI layer is the only thing that
prevents this — there is no server-side error to fall back on.

## Non-obvious behaviour

- **`DEFINITION_LIST` writes replace the whole list.** Removing a row and saving really removes it;
  there is no element identity and no partial merge. This also means an empty list genuinely clears
  the attribute — the only attribute type that can be cleared, since `A10` is still open.
- **A malformed element is dropped server-side without an error.** Submit three shoes with one bad and
  two come back. The strict client validation above is what actually prevents users hitting this.
- **No URL field.** `Reference` deliberately has no `url` (§8.2). Users will paste URLs into `value`;
  render `value` as **text**, never as a link.
- **`id` may be absent, not merely `null`.** The server drops optional fields whose value is `null`,
  so a reference sent as `{ id: null, value: "…" }` comes back as `{ value: "…" }` (design §13.3).
  Read it as **"absent or null ⇒ unlinked"** — never `"id" in ref`, and never assume the round-trip
  preserves the key you sent.

## Tests

- Vitest — free text stores `id: null`; picking a result stores its `id`; empty `value` blocks save;
  add/remove rows in a `DEFINITION_LIST`; no `searchScope` renders a plain input.
- MSW — mock A14's endpoint returning a mix of `id: null` and `id`-bearing results, and assert the two
  render distinguishably.

## Out of scope

The Equipment catalogue, any "link it?" reconciliation prompt for already-stored free text (design
§8.5 step 4 — that lands with the Equipment domain), and the admin-side `searchScope` picker.
