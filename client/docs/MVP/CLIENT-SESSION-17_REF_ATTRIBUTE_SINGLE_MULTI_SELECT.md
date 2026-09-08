# CLIENT-SESSION-17 · `#ref` single/multi-select + discriminated-union attribute model

**Status:** `TODO`
**Type:** Client feature + refactor
**Filed:** 2026-09-08, from the C5 `/workon` pickup. Two folded-together concerns:
1. the backend `#ref` semantic change (explicit `key` + `SINGLE`/`LIST` `cardinality`, `#ref` = a
   *data source* path into the profile schema) leaves a client rendering gap — the resolved session
   schema gains a `cardinality` field the client must branch on;
2. C5 replaces the flat god-DTO (`SportAttributeDefinition` carrying `options`/`min`/`max`/
   `definitionRef` regardless of `type`) with a **sealed per-type hierarchy**. The client's
   hand-mirror in `shared/types/sport.ts` is the same flat god-type, and every attribute surface
   switches on `type` off it — this ticket migrates that mirror to a discriminated union and
   per-type rendering (user decision 2026-09-08: fold into this ticket rather than a separate one).
**Depends on:** **sport `A23`** (hard). C5 defines the neutral contract but is pure addition and
changes no wire shape; `A23` is when `session-impl` repoints onto `common.attributes` and
`GET /api/sports/{sportId}/session-attribute-schema` (+ the resolved variant) actually starts
emitting `cardinality` and requiring `#ref` nodes to carry an explicit `key`. The wire format stays
byte-identical (`ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` D7), so the discriminated-union migration
is a client-internal refactor that *can* start earlier — but keep it in this ticket so the two land
together. Do not ship the `#ref` UI before A23 — that half is not observable until then.

## Why

Today (CLIENT-SESSION-15) a `#ref` / `prefillable` node in `CreateSessionModal` renders as an
ordinary `SportAttributesFields` control, pre-seeded once from `profile.attributes[prefillKey]`.

After C5 + A23 a `#ref` node means **"this session attribute's value(s) are chosen from what the
creator has on their own sport profile at the `#ref` path"**, and the resolved node carries:

- `cardinality: "SINGLE" | "LIST"` (new, always present on a `#ref`-derived node)
- `prefillKey` — the `/`-path into the profile schema whose stored value(s) are the **choice list**
  (not just a one-shot default anymore)

So the control changes:

| `cardinality` | Control | Choices | Result value |
|---|---|---|---|
| `SINGLE` | single-select dropdown | the creator's profile value(s) at `prefillKey` | one value |
| `LIST` | multi-select list | same | array of values |

## Scope

### Part A — discriminated-union attribute model

0. **Migrate `client/src/shared/types/sport.ts`** from the flat `ResolvedSportAttributeDefinition`
   (every field optional, `type` a bare string) to a **discriminated union** on `type`:
   `{ type: "STRING"; … }` | `{ type: "NUMBER"; min?: number; max?: number; … }` |
   `{ type: "ENUM" \| "LIST"; options: …[]; … }` |
   `{ type: "DEFINITION" \| "DEFINITION_LIST"; definitionRef: string; searchScope?: string; … }`,
   plus a `RefAttribute` arm (`ref: string; cardinality: "SINGLE" \| "LIST"`). Mirror the raw
   (unresolved) schema type the same way if the client holds one. Wire is byte-identical
   (plan doc D7) so this is a pure type-narrowing refactor — no parsing change.
0b. **Per-type rendering** — replace the `switch (type)` blocks in every attribute surface
   (`SportAttributesFields`, `SessionAttributesSummary`, the SPORT-2 renderer, the ADMIN-2 /
   ADMIN-5 editors) with a small component per arm, selected off the narrowed union so TS
   enforces exhaustiveness. Behaviour unchanged; this is the client counterpart of C5's
   open/closed goal.

### Part B — `#ref` single / multi-select
1. **Choice derivation** — a small helper that, given a resolved `#ref` node and the creator's
   `profile.attributes`, produces the option list from the value(s) stored at `prefillKey`:
   - profile value is a scalar → a one-entry option list
   - profile value is an array (profile attribute is itself a `LIST`/`DEFINITION_LIST`) → one
     option per entry
   - profile has nothing at that path → empty option list (control renders empty + a hint, not an
     error)
   - `DEFINITION`/`DEFINITION_LIST`-shaped entries → display via the same nested-record formatting
     `SessionAttributesSummary` already uses; the stored value round-trips whole.
2. **Create modal** (`CreateSessionModal` / `SportAttributesFields` integration from
   CLIENT-SESSION-15) — when a node is a `RefAttribute`, render the dropdown (`SINGLE`) or
   multi-select (`LIST`) instead of the generic control. Fold the selected value(s) into the
   `attributes` payload under the node's (now explicit) `key`.
3. **Read-only detail** (`SessionAttributesSummary`, CLIENT-SESSION-16) — verify a `LIST` `#ref`
   value renders as chips and a `SINGLE` as a plain value; adjust only if the existing
   type-driven rendering doesn't already cover it (it likely does — this is a check, not
   assumed work).

### Tests (both parts)
4. Vitest for the choice-derivation helper (scalar / array / empty / record cases) and for the
   modal rendering both `cardinality` branches; a type-level test (or `tsc` exhaustiveness) that
   the union narrows correctly; Storybook stories for the single-select and multi-select states
   and for each per-type render arm that changed shape; update MSW session-schema fixtures under
   `client/e2e/mocks/` to include a `RefAttribute` node so the e2e create flow exercises it;
   refresh `client/docs/E2E_OVERVIEW.md` if a spec changes. Full `pnpm e2e` + `visual-regression`
   per the client Phase 5 rules — the per-type rendering refactor touches baselined surfaces.

## Edge cases

- Creator has an **empty profile** for the sport → every `#ref` control renders empty with a
  "nothing on your profile to pick from" hint; the field is still submittable as empty/`[]` if the
  attribute is not required.
- Profile value shape doesn't match `cardinality` (e.g. `SINGLE` node, profile stores an array):
  offer all entries as choices, let the user pick one.
- `#ref` node whose `prefillKey` no longer resolves in the profile schema — backend already
  lenient-drops these at expand time, so the client simply won't see the node.

## Out of scope

- The backend contract itself (C5 defines it, A23 ships it).
- Any *behaviour* change to how own (non-`#ref`) attributes render — Part A restructures that code
  into per-type components but the rendered output is unchanged (visual-regression baselines must
  come back byte-identical except where the `#ref` control legitimately changes).
- Letting the user type a free value that isn't on their profile — the choice list is exactly the
  profile value(s). (A "add to my profile from here" affordance would be a separate ticket.)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
