# SESSION-5 — Session Capacity + Fee/Pricing

**Status:** DONE (2026-08-02)

## Scope

Split out of the `CreateSessionModal` redesign (`client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`),
which deliberately excluded a "Taken slot"/"Open slot" capacity input and a "Fee" group
(Free / Split cost / fixed VND amount) because no backend support existed. `Session` gains
`capacity` (display-only "open slots" — "taken" stays derived from the existing
`participantCount`, never a second stored counter) and fee fields.

## Decisions made during scoping

- **Capacity is informational only** — `joinSession` never checks `participantCount` against
  `capacity`. The backlog's open design question (hard-reject vs. display-only) was resolved
  toward display-only; no waitlist, no enforcement, matching SESSION-1's original deferred scope.
- **Both `capacity` and `feeType` are mandatory on `CreateSessionRequest`** — no default fallback
  for a missing field; the caller must always send both explicitly. (`feeAmountVnd` stays
  optional/conditional — see below.)
- **`capacity` bound: `>= 0`, no upper bound** — the client's 1–24 wheel-picker is a UI constraint
  only, not enforced server-side beyond non-negative.
- **Capacity/fee are editable via `updateSession`** — same partial-update pattern as every other
  field on that endpoint (`null` = unchanged).
- **Backfill for pre-existing rows:** `capacity` is `NOT NULL DEFAULT 9999` (a sentinel meaning
  "uncapped") rather than staying nullable at the schema level — sessions created before this
  ticket (and auto-generated `GROUP_RECURRING` sessions, which have no capacity/fee input at all
  since `GroupRecurrenceConfigResponse` carries neither) get this default via
  `@Builder.Default` on the entity. `feeType` backfills to `FREE` the same way.

## What was built

**Migration** — `V040__add_capacity_and_fee_to_sessions.sql`:
```sql
ALTER TABLE sessions ADD COLUMN capacity INTEGER NOT NULL DEFAULT 9999;
ALTER TABLE sessions ADD COLUMN fee_type VARCHAR(10) NOT NULL DEFAULT 'FREE';
ALTER TABLE sessions ADD COLUMN fee_amount_vnd BIGINT;
```
Defaults kept permanently (not dropped after backfill) — matches this repo's existing precedent
(e.g. `groups.rules NOT NULL DEFAULT ''`). Verified against the real dev Postgres: the 2
pre-existing rows backfilled to `capacity=9999, fee_type=FREE, fee_amount_vnd=NULL` exactly as
designed.

**New enum** — `session-api/dto/FeeType.java`: `FREE`, `SPLIT`, `FIXED`.

**Entity** — `Session` gains `capacity` (`Integer`, `nullable=false`, `@Builder.Default = 9999`),
`feeType` (`FeeType`, `nullable=false`, `@Builder.Default = FREE`), `feeAmountVnd` (`Long`,
nullable — meaningful only when `feeType == FIXED`).

**DTOs:**
- `CreateSessionRequest`: `capacity` (`@NotNull @Min(0)`), `feeType` (`@NotNull`), `feeAmountVnd`
  (unconstrained by annotation — cross-field validated in the service, since "required only when
  `feeType == FIXED`" isn't expressible as a single-field Bean Validation constraint).
- `UpdateSessionRequest`: same three fields, all optional (`@Min(0)` on capacity only) — partial
  update, `null` = unchanged.
- `SessionResponse`: adds `capacity`, `feeType`, `feeAmountVnd`.

**Service impl** — new private helper:
```java
private Long resolveFeeAmountVnd(FeeType feeType, Long candidateAmount) {
    if (feeType == FeeType.FIXED) {
        if (candidateAmount == null) {
            throw new BadRequestException("feeAmountVnd is required when feeType is FIXED");
        }
        return candidateAmount;
    }
    return null;
}
```
- `createSession`: resolves `feeAmountVnd` via the helper before building the entity; sets
  `capacity` directly from the request (already `@NotNull`-validated by `@Valid` at the
  controller).
- `updateSession`: applies `capacity`/`feeType`/`feeAmountVnd` if present in the request (standard
  partial-update `if != null`), then **unconditionally** re-runs `resolveFeeAmountVnd` against the
  session's post-merge state — this is what catches "switched to `FIXED` without an amount" (even
  if the request only touched `feeType`) and clears a stale `feeAmountVnd` when switching away
  from `FIXED` (even if the request didn't touch `feeAmountVnd` at all). Re-running it
  unconditionally (not just when a fee field changed) also re-validates an already-consistent
  state as a no-op, so it's safe on every update regardless of what changed.
- `mapToResponses`: carries `capacity`/`feeType`/`feeAmountVnd` through to `SessionResponse`.

**Controller** — no route changes; `POST`/`PUT /api/sessions/**` already validate via `@Valid` on
the request DTOs, so the new required fields are enforced automatically.

**Tests** — Spock cases for: capacity/feeType/feeAmountVnd flow through on create, `FIXED` with no
amount rejected on create, `FREE`/`SPLIT` silently clears any passed `feeAmountVnd` on create,
partial capacity-only update, switching to `FIXED` via update with no amount ever supplied is
rejected, switching away from `FIXED` via update clears a stale amount.

## Verification

- `:modules:session:session-impl:test` — all pass (existing tests untouched — they build
  `CreateSessionRequest`/`Session` without capacity/feeType, which is fine at the unit-test level
  since `@Valid` enforcement happens at the controller, not the service, and Lombok's
  `@Builder.Default` only fills in when the builder method for that field is never called).
- `:server:test` — 38/38 pass.
- Migration applied cleanly against the real dev Postgres; confirmed via `\d sessions` and a
  direct row query that the 2 pre-existing sessions backfilled to the sentinel values.
- Full manual end-to-end verification against the running server: create with missing `capacity`
  → 400; create with `feeType=FIXED` and no `feeAmountVnd` → 400 with the expected message; create
  with a valid `FIXED` fee → amount carried through in the response; update switching `FIXED` →
  `SPLIT` → `feeAmountVnd` cleared to `null` in the response; update switching back to `FIXED`
  with no amount → 400; update touching only `capacity` → applied, everything else unchanged.

## Out of scope / follow-ups

- **Client:** capacity/fee display on `SessionListCard`/`UpcomingMatches`/`SessionDetailModal`,
  and the "Taken slot"/"Open slot"/"Fee" inputs in `CreateSessionModal`. Not filed yet.
- **Not built:** any join-time capacity enforcement or waitlist — explicitly out of scope per the
  scoping decision above.
- **Not built:** propagating capacity/fee into `GroupRecurrenceConfig` so auto-generated sessions
  could carry a real value instead of the `9999`/`FREE` defaults — no requirement surfaced for
  this; recurring sessions keep using the sentinel/default until a real need is identified.
- SESSION-6 (join-approval/invite) remains `TODO`, unaffected by this ticket.
