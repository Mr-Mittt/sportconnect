# SESSION-33 · `Session.scheduledStart` becomes a true instant, with a creator-zone fallback for location-less sessions

**Status:** `TODO`
**Type:** Enhancement (Schema / Contract change)
**Depends on:** LOC-4 (soft — the type change itself doesn't need it, but the
location-vs-creator-zone precedence decision this ticket also has to make does)
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md` (§2, §2.1, §5) —
foundational piece of the location-owned-timezone redesign that replaces SESSION-31's superseded
JVM-offset point-fix (`modules/session/docs/MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md`).

`Session.scheduledStart` is today a naive `java.time.LocalDateTime` — no offset, no zone id —
shifted implicitly by `hibernate.jdbc.time_zone: UTC`'s write-side JVM-offset assumption, the root
cause behind SESSION-25/27/31's bugs. This ticket removes the ambiguity at the source instead of
continuing to patch symptom queries one at a time.

## Scope

- **Migration:** `sessions.scheduled_start` column type `TIMESTAMP` → `TIMESTAMPTZ`. Backfill
  existing rows by reinterpreting their naive value as the server's current JVM zone — the only
  available assumption for already-written data. (See `documentation/md/LOCATION_TIMEZONE_DESIGN.md`
  §2.1 for why `TIMESTAMPTZ` normalizes to a UTC instant regardless of what offset a value arrives
  with, verified against real Postgres.)
- **Entity/DTOs:** `Session.scheduledStart` → `java.time.Instant` (or `OffsetDateTime` — decide at
  pickup which Java type maps cleanest through Hibernate's `TIMESTAMPTZ` support).
  `CreateSessionRequest`/`UpdateSessionRequest`/`SessionResponse`'s `scheduledStart` become
  offset-aware — a client omitting the offset now fails deserialization (400) instead of silently
  defaulting. **This is an intentional, non-additive contract break**, not a compatible change —
  full consumer census required at pickup (CLAUDE.md § API Change Discipline): every backend caller
  of `SessionService`'s create/update/response paths, plus `client/src` and `client/e2e/mocks` for
  the field's shape.
- **New `originZoneId` column on `sessions`** (nullable, IANA zone id) — captures the creator's own
  browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`, see CLIENT-SESSION-24) at
  creation time, for sessions with no `locationId` yet (`PREPARING`/standalone). Used as the
  fallback zone by SESSION-34/35's queries whenever `location_id IS NULL`.
- `hibernate.jdbc.time_zone: UTC`'s write-side shifting no longer applies to this column once it's
  `TIMESTAMPTZ`. Confirm no other `LocalDateTime` column in the app still needs that setting before
  even considering removing it globally — out of scope for *this* ticket to remove, just don't let
  this migration silently change behavior anywhere else.

## Open questions — resolve at pickup, don't guess

- **Precedence when a `PREPARING` session later gets a real `Location`.** SESSION-24's completion
  flow lets a `PREPARING` session's `locationId` be set after creation via `updateSession`. Once
  that happens, does the session's canonical zone switch from `originZoneId` to the newly-attached
  `Location.timezone`, or stay pinned to `originZoneId` forever? Switching could silently move which
  calendar date the session displays under mid-lifecycle (a real behavior change visible to already
  `JOINED` participants); staying pinned means a location is never authoritative for a session that
  started `PREPARING`. This needs a decision with the user before SESSION-34/35 can implement the
  `COALESCE` shape their queries depend on.

## Out of scope

Rewriting the queries themselves (SESSION-34, SESSION-35) and the client's create/update UI
(CLIENT-SESSION-24) — separate tickets. This one is the schema/contract foundation they both build
on.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
