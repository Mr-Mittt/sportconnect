# LOC-4 · Location gains a real IANA timezone

**Status:** `TODO`
**Type:** Enhancement (Schema)
**Depends on:** none
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md` (§2, §5) —
foundational piece of the location-owned-timezone redesign that replaces SESSION-31's superseded
JVM-offset point-fix (`modules/session/docs/MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md`).

Add a `timezone` field to `Location` — an IANA zone id string (e.g. `Asia/Ho_Chi_Minh`), not a raw
UTC offset, since an offset alone can't express DST transitions correctly across a year. A court,
pitch, or venue is a physical place with exactly one real-world timezone that doesn't change per
viewer, which makes `Location` the natural canonical source `AT TIME ZONE` conversions in
`session-impl`'s queries (SESSION-34, SESSION-35) join against once a session has a real location.

## Scope

- Migration: new `timezone VARCHAR` column on `locations` — nullable-then-required vs. required
  outright is a pickup decision (see backfill note below).
- `Location` entity + `location-api` DTOs (`LocationResponse`, create/update requests) gain the
  field.
- Validation: reject an invalid/unknown zone id. Java's `ZoneId.of(...)` throws `DateTimeException`
  for anything that isn't a real IANA id — use that directly rather than hand-rolling a zone-id
  allowlist.

## Open questions — resolve at pickup, don't guess

- **Backfill for existing rows.** Every current `Location` row has no zone. The only available
  assumption for already-written data is "whatever the server's JVM zone was" — lossy, but the only
  option. Decide with the user whether to backfill eagerly in the same migration, or leave existing
  rows `NULL` and require the field only going forward.
- **Consumer census required (CLAUDE.md § API Change Discipline).** `LocationResponse` is a shared
  DTO the client reads — grep `client/src`/`client/e2e/mocks` for every consumer before adding the
  field. An additive, nullable field is normally compatible-as-is, but confirm rather than assume.

## Out of scope

Anything on the `Session`/`session-impl` side — that's SESSION-33/34/35. This ticket only gives
locations a zone to be read later; it doesn't change how any session query behaves.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
