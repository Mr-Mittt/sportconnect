# CLIENT-SESSION-17 · `#ref` single/multi-select + discriminated-union attribute model

**Status:** `DONE` (2026-09-08)
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
- ~~Letting the user type a free value that isn't on their profile~~ — **reversed by the
  2026-09-08 pickup scope change below.** A free-value "Other…" affordance *is* in scope now
  (free-text only; the suggested-results typeahead is the follow-up).

---

## Scope changes — 2026-09-08, at `/workon` pickup (user decisions)

### SC-1 · Part A extraction depth → **full per-arm component split**
Part A's per-type rendering is a **dedicated component per union arm** (`StringField`,
`NumberField`, `BooleanField`, `EnumField`, `ListField`, `DefinitionField`, `DefinitionListField`
for the write surface; read-side twins for `SessionAttributesSummary`), dispatched from a
`type`-keyed lookup with TS exhaustiveness — not a narrowed `switch` that keeps its shape. Rendered
output for non-`#ref` nodes stays byte-identical (visual-regression must come back unchanged).
*Why:* matches C5's open/closed goal on the client side; user decision over the lower-risk
narrowed-switch option.

### SC-2 · ticket-text correction — **ADMIN-2 / ADMIN-5 editors are not a per-type surface**
`AttributeSchemaEditor.tsx` is a generic JSON `<Textarea>` that round-trips the document opaquely;
it has no `switch (type)` to refactor. Part A's per-type work is confined to **3 files**:
`shared/components/SportAttributesFields.tsx` (2 switches), `features/session/components/
SessionAttributesSummary.tsx` (1 switch), `features/session/sessionAttributePrefill.ts` (1 switch,
value-shape guard — logic, not render). The admin editors get **no change**.

### SC-3 · resolved-union discriminant — **`#ref` is not a `type` arm on the wire**
`common.attributes.ResolvedAttributeNode` is flat: a `#ref`-derived resolved node carries its
*inherited* `type` (STRING/ENUM/LIST/…) **plus** `cardinality` / `prefillable` / `prefillKey`.
There is no `type: "REF"`. The client models a `#ref` node as `prefillable === true` (equivalently
`cardinality != null`) and short-circuits the per-`type` dispatch to the `#ref` control. Only the
resolved (`Resolved*`) tree migrates to a discriminated union; the **raw/unresolved schema types
stay flat** (nothing in the client discriminates on them — they are generic type params for the
admin JSON textarea only). *Why:* user decision; step 0's "no parsing change / pure type-narrowing"
constraint.

### SC-4 · `#ref` control gains an **"Other…" free-value affordance** (both `SINGLE` and `LIST`)
The choice list for a `#ref` control (derived from the creator's profile value(s) at `prefillKey`)
ends with an **"Other…"** entry. Selecting it opens a **nested modal** with a **plain text input**
(for a `DEFINITION`-base `#ref`, the definition's fields via `DefinitionFields`). On submit the
entered value becomes a **draft option**: it joins that node's option list *and* is selected/checked.
Draft options **accumulate** per `#ref` node for the life of the create modal (cleared on sport
change / modal close, same as the rest of the draft) and are **never written to the user's
profile** in this ticket. Applies to **both** the `SINGLE` dropdown and the `LIST` multi-select.
*Why:* user decision — reverses the original "profile value(s) exactly" out-of-scope line.

- **Deferred to follow-up `CLIENT-SESSION-18`** (filed 2026-09-08): the *suggested-results
  typeahead* inside that "Other…" modal. Hard-blocked on backend **A14** (postponed) — same block
  as `SPORT-6`; sequence with it. This ticket ships the modal with free-text entry only.
- **Deferred to follow-up `CLIENT-SESSION-19`** (filed 2026-09-08): reusing the "Other…" add-modal
  as a **profile `DEFINITION_LIST` attribute add** affordance (writing a new entry to the user's
  own sport profile, not just a session draft).

### `SINGLE` preselect
No auto-preselect. The `SINGLE` `#ref` renders as a dropdown of profile-derived choices +
accumulated drafts + "Other…"; the user picks explicitly. (Superseded the "preselect the sole
value" option — the "Other…" flow made an always-visible dropdown the cleaner model.)

### SC-5 · `SINGLE` is always a dropdown, regardless of base type (2026-09-09, user decision)
A `SINGLE` `#ref` renders as a native `<select>` for **every** base type — scalar *and*
`DEFINITION`/`DEFINITION_LIST`. A record-base option shows its one-line summary text in the
`<option>`; the full nested record is shown read-only in the session detail view
(`SessionAttributesSummary`). (Superseded the initial build's "`SINGLE` + record base → radio
list".) `LIST` still uses the checkbox list, where a record entry can render its nested block
inline.

---

## Implementation (2026-09-08)

### Approved plan, as built

**Part A — discriminated-union attribute model.**

- **`shared/types/sport.ts`** — `ResolvedSportAttributeDefinition` is now a discriminated union:
  `ResolvedRefAttribute | ResolvedStringAttribute | …Number | …Boolean | …Enum | …List |
  …Definition` (`DEFINITION` + `DEFINITION_LIST` share one arm). `ResolvedSportAttributeField`
  (record fields) is the same, minus the `#ref` arm and `DEFINITION_LIST` (depth-2 rule) — 6 arms.
  New `Cardinality` type. New `isRefAttribute(a): a is ResolvedRefAttribute` guard (checks
  `a.prefillable === true`) — a `#ref` node **cannot** be discriminated by `type` (it carries the
  inherited base `type`, per SC-3), so every dispatcher runs the guard *before* `switch (node.type)`.
  Raw/unresolved types unchanged except `SessionAttributeNode` gained optional `cardinality`
  (A23/D9). New `shared/lib/assertNever.ts` — compile-time exhaustiveness in every dispatcher's
  `default:`; a `SportAttributeType` member added without a branch fails `tsc -b`.
- **`shared/components/attributeFields/`** (new dir) — one component per write arm:
  `StringField`, `NumberField`, `BooleanField`, `EnumField`, `ListField` (moved verbatim),
  `DefinitionField` (top-level `DEFINITION` fieldset), `DefinitionListField` (moved verbatim),
  plus `DefinitionFields` (record body) + its `RecordField` per-type dispatcher. JSX copied
  verbatim from the old inline `switch` bodies; the standalone/record wrapper differences
  (`aria-required`, the required hint, the `<div>` around `LIST`) are driven by optional props so
  output is byte-identical in both contexts. `SportAttributesFields` keeps its group recursion /
  default-seeding / responsive grid and calls a small dispatcher: runtime `KNOWN_TYPES` guard
  (degrade on an unknown type) → `isRefAttribute` → `<RefField>` → `switch` → per-arm component →
  `assertNever`.
- **Read side** — `attributeFields/attributeValues.tsx` holds the read renderers extracted from
  `SessionAttributesSummary` (`renderValueNode` is now a `Record<SportAttributeType, fn>` lookup +
  `AttributeList`, `renderRecord`, `optionLabel`). `SessionAttributesSummary` keeps only its
  group walk. **Divergence from plan:** the read side is a lookup of pure functions, not a
  component per arm — components would risk wrapper-DOM drift against the byte-identical
  constraint, and the ticket's own §B.3 framed the read side as "a check, not assumed work".

**Part B — `#ref` single / multi-select.**

- **`attributeFields/refChoices.tsx`** — `deriveRefChoices(node, profileAttributes,
  definitionsByName)`: reads `profileAttributes[node.prefillKey]`; array → one `RefChoice` per
  entry, scalar → one, empty/absent → `[]`; ENUM/LIST base resolves the label through the
  inherited `options`; `DEFINITION`/`DEFINITION_LIST` base renders each entry through the shared
  nested-record formatter and round-trips the stored value whole. `draftToChoice` /
  `refValueKey` sit alongside for the "Other…" drafts and value↔choice matching.
- **`attributeFields/RefField.tsx`** — `choices = deriveRefChoices(...) ∪ draftOptions ∪
  currently-selected` (deduped). **`SINGLE` (any base) → native `<Select>`** of every choice + a
  trailing `Other…` `<option>` (user decision 2026-09-09 — a record-base option shows its
  one-line summary text; the full nested record is shown read-only in the session detail view).
  `LIST` (any base) → checkbox list (reusing `ListField`'s cap behaviour) with an `Other…` outline
  button; a record-base entry there renders its nested-record block inline. An empty derived list →
  a "Nothing on your profile to pick from" hint. The `Other…` control opens a **nested `<Dialog>`**:
  a plain `<Input>` for a scalar base, `<DefinitionFields>` for a record base; on submit the value
  is recorded via `onAddDraftOption` and selected.
- **Read side (`SessionAttributesSummary` / `SessionDetailModal`)** — §B.3 said "verify, adjust
  only if needed"; adjustment *was* needed. A `#ref` node's stored value shape follows its
  `cardinality`, not its inherited scalar `type` (a `LIST` `#ref` stores an *array* under a
  `type: "STRING"` node; a `SINGLE` `#ref` off a `DEFINITION_LIST` base stores a single record) —
  so the prior `renderValueNode(node.type, …)` rendered nothing for either. Added
  `effectiveRenderType(node)` in `SessionAttributesSummary`: for a `#ref` node it maps
  `LIST → LIST`/`DEFINITION_LIST` and `SINGLE → <base type>`/`DEFINITION` (record base), then
  renders through the same `renderValueNode`. Own nodes unchanged. Covered e2e: `mockDiscoverableSession`
  gained `attributes` with two `#ref` values + one own node, and `matches-journey.spec.ts` step 9
  (which already opens that session's detail) asserts the `LIST` `#ref` renders as chips, the
  `SINGLE` `#ref` and the own node as plain values.
- **State** — `useCreateSessionModalData` drops CLIENT-SESSION-15's `buildSessionAttributePrefill`
  value-seeding entirely (A23 makes `#ref` a *choice source*, not a pre-filled value) and adds
  `refDraftOptions: Record<path, unknown[]>` + `onAddRefDraftOption`, reset on the same
  sport-change / close lifecycle as `sessionAttributes`. `sessionAttributePrefill.ts` →
  `sessionAttributePaths.ts` (keeps only `collectSchemaPaths` / `pickPaths` for payload trimming;
  `buildSessionAttributePrefill` / `isPrefillValueCompatible` deleted). `SportAttributesFields`
  gained three **optional** props (`refChoiceSource`, `refDraftOptions`, `onAddRefDraftOption`) —
  the profile Settings tab passes none, so `#ref` rendering is inert there (and the profile schema
  has no `#ref` nodes anyway). `CreateSessionModal` + all 5 render sites
  (`Matches/Friends/Groups/HomeFeed/Profile`) thread them through.

### Bug found and fixed along the way — `useMatchesPageData` `sessionAttributeSchema` collision

Wiring the e2e step surfaced that **`CreateSessionModal`'s "Session detail" section never rendered
on the Matches page**. `useMatchesPageData` spreads `...createSessionModalData` then
`...sessionDetailData`, and CLIENT-SESSION-16 had added a `sessionAttributeSchema` key to
`useSessionDetailModalData` (for the read-only summary) — the later spread shadowed
CLIENT-SESSION-15's create-form `sessionAttributeSchema` with the detail one, which is `null`
whenever no detail modal is open. A pre-existing latent bug (CLIENT-SESSION-15's create-modal
attributes section had no integration/e2e coverage — every prior test passes the prop directly),
made visible only by this ticket. Fixed in `useMatchesPageData` by binding both explicitly:
`sessionAttributeSchema` = the create form's, new `detailSessionAttributeSchema` = the open
session's; `MatchesPage`'s `SessionDetailModal` now reads the latter. The other 4 pages call
`useCreateSessionModalData` directly (no merge) and were never affected. The new e2e test is the
regression coverage (no RTL test in this repo renders `MatchesPage`).

### E2E

`e2e` project (run alone): **82 passed, 1 failed** — `friends-journey.spec.ts:13`, a pre-existing
parallel-load flake unrelated to this ticket (FRIEND-2's "Send a friend request" panel state),
**green in isolation** (re-run → 1 passed). An earlier full run under machine contention showed 3
such flakes (`a11y.spec.ts:132`, `feed-groups-journey.spec.ts:473` — the one CLIENT-SESSION-16's
summary already named — and `friends-journey.spec.ts:13`), all green isolated. Every new/changed
assertion in this ticket passed.

New / changed coverage:
- **`matches-journey.spec.ts` — new standalone `test()`** (own page + 30s budget; folding it in as
  a step blew the per-test timeout): select Badminton in Create session, expand "Session detail",
  assert the `LIST` `#ref` renders profile-derived checkboxes (`Yonex Astrox 99` /
  `Li-Ning Axforce 90`), the `SINGLE` `#ref` shows the "Other… only" empty state + hint, the
  "Other…" nested modal adds a checked draft option — **then fill the remaining required fields,
  create, and assert the intercepted `POST /api/sessions` body's `attributes` ==
  `{ 'match/racketModel': ['Yonex Astrox 99', 'Victor Thruster'], 'match/format': 'Doubles' }`**
  (the checked profile option + the "Other…" draft under the LIST `#ref`'s node path, plus the own
  node's `defaultValue`). This is the end-to-end proof that a `#ref` selection reaches the create
  payload — needed a new `mockBadmintonLocation` fixture, since `/api/locations/search` filters by
  `sportId` and the create flow must use Badminton (the only sport with a session `#ref` schema).
- **`matches-journey.spec.ts` step 9** — now also asserts the **read-only** "Session detail"
  summary: `mockDiscoverableSession` gained `attributes`, so opening its detail shows the `LIST`
  `#ref` as chips and the `SINGLE` `#ref` + own node as plain values (exercises
  `effectiveRenderType`).
- MSW fixtures: the Badminton session schema (`defaultSessionAttributeSchemas`) now carries two
  `#ref` nodes each with a `cardinality` (`racketModel` `LIST` ← `gear/racketModels`, `racketBrand`
  `SINGLE` ← `gear/racketBrand`); the Badminton profile fixture stocks `gear/racketModels` with two
  entries and leaves `gear/racketBrand` empty; `mockDiscoverableSession` carries stored `#ref` +
  own-node `attributes`. `E2E_OVERVIEW.md` (matches-journey section + separate
tests, directory listing, the `mockSportProfiles` fixture row, and the `app-create-session-modal`
visual section) updated.

### Visual-regression expectation

**Baselines that legitimately change** (all need an `update-baselines` GitHub dispatch — baselines
cannot be created on a Windows host):
- `create-session-session-detail-ref-{375,768,1280}.png` — **new**: `app-create-session-modal.spec.ts`
  gains a `session-detail-ref` state (select Badminton, expand "Session detail" → the two `#ref`
  controls). **Fixup 2026-09-09:** the first `update-baselines` artifact caught during
  `/updatebaseline` review showed only the "Session detail" toggle in frame — clicking it scrolls
  the toggle, not its expanded content, into view, and `toBeVisible()` passes below the fold. The
  spec now `scrollIntoViewIfNeeded()`s the lower `#ref` control after expanding (same pattern as
  `app-notification-bell.spec.ts`'s `with-load-more`); that first artifact was discarded (branch
  reset, force-pushed) and a fresh dispatch is needed off this fix.
- `session-detail-not-joined-{375,768,1280}.png` — **changed**: `mockDiscoverableSession` now
  carries `attributes`, so `app-session-detail-modal.spec.ts`'s `not-joined` state also frames the
  read-only "Session detail" `#ref` summary (needed to give the read path real visual coverage).

**Every other baseline is byte-identical** — Part A's per-arm extraction changed no rendered
markup.

**Executed 2026-09-09:** `update-baselines` dispatch artifact applied via `/updatebaseline`.
SHA-256 against the committed set confirmed **exactly** the predicted 6 changed — 3 new
`create-session-session-detail-ref-{375,768,1280}.png` + 3 modified
`session-detail-not-joined-{375,768,1280}.png` — and the other 105 baselines came back
byte-identical (local Windows noise floor only, no `MISSING`). Human eyeball (1280 of each
surface): the create-session state frames both `#ref` controls (`LIST` checkboxes + "Other…"
above, `SINGLE` dropdown in its "Nothing on your profile" empty state, both scrolled into
frame); the not-joined state renders the read-only "Session detail" summary (racket-model
chips, "Racket brand: Yonex", "Format: Doubles") with the rest of the modal unchanged.

`visual-regression` **was run** for `app-create-session-modal.spec.ts` on this Windows host:
- the 3 new `session-detail-ref` states → *"A snapshot doesn't exist … writing actual"* (expected —
  they render, there is just no baseline yet);
- the 9 pre-existing states (`default` / `location-chosen` / `no-sport-profiles` × 3 widths) →
  pixel-diff failures. **Proven to be the documented Windows font-rendering noise floor, not a
  regression:** with this ticket's changes `git stash`ed, `create session modal — default @ 1280px`
  fails with the same diff. No other baselined surface was run (Part A adds/removes no DOM;
  `app-session-detail-modal` / `app-profile` use Pickleball or an unchanged profile schema).

### Verification summary

- `tsc -b` clean · `eslint .` clean (the 2 remaining warnings are pre-existing in
  `SessionStartTimePicker.tsx`, untouched).
- Full **Vitest** suite **167 files / 1169 passed**, 0 failures (was 163/1147; +4 test files, and
  `sessionAttributePrefill.test.ts` → `sessionAttributePaths.test.ts`).
- **Browser walk:** the Playwright `#ref` test drives real Chromium against the built client
  (MSW-mocked API) through the happy path. A throwaway diagnostic confirmed
  `GET /api/sports/1/session-attribute-schema` fires and the "Session detail" section renders once
  the `useMatchesPageData` shadowing fix is in.
- **Live Java backend:** not run. The wire contract was read directly from
  `modules/common/.../attributes/resolved/ResolvedAttributeNode.java` in Phase 2. Per A23's D9
  note, the dev Badminton session schema still needs an admin re-PUT in the new `#ref` format
  (`key` + `cardinality`) before a live check would render anything — dev-data setup outside this
  client ticket.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
