# SESSION-32 · Sessions have no client/location timezone — `scheduledStart` is implicitly server-zone

**Status:** `DONE` (2026-09-16) — design captured, split into concrete tickets
**Type:** Design / Architecture
**Depends on:** none directly; conceptually follows SESSION-31
**Filed:** 2026-09-16, raised in a follow-up discussion right after **SESSION-31** shipped, when the
user asked why `zoneOffsetSeconds` is always the *server's* JVM zone and whether the client's own
timezone should be used instead.

`CreateSessionRequest.scheduledStart` (and every discover/history `date`/`startTime` filter param)
is a bare `java.time.LocalDateTime` — no offset, no zone id anywhere on the wire. Every client,
regardless of where its user physically is, is silently assumed to mean "wall-clock time in
whatever zone the server happens to be deployed in." SESSION-25/27/31 fixed three real,
already-shipped bugs caused by `hibernate.jdbc.time_zone: UTC` mishandling that assumption
internally (a raw SQL `CAST`/`EXTRACT` reading Hibernate's un-reapplied write-side shift), but all
three were deliberately scoped away from this deeper question — SESSION-31's own Phase 1 gate
explicitly confirmed "any broader Java/system-timezone assumption... is a separate, bigger
conversation."

**Proposed direction (not decided — see the design doc for full reasoning and open questions):**
give `Location` a real IANA timezone field, store `Session.scheduledStart` as a true instant
(`Instant`/`OffsetDateTime`, `TIMESTAMPTZ`) instead of a naive `LocalDateTime`, and use two
different zones for two different purposes on the same value — the session's **location's** zone
for canonical date bucketing/display (so a shared event has one agreed-on date), and the **caller's
own** zone for time-of-day search filters (so `/discover`'s `startTime` means the caller's own
clock). Full reasoning, a worked cross-zone example, query mechanics (`AT TIME ZONE` replacing the
hand-derived `zoneOffsetSeconds`/`EXTRACT`+`MOD` corrections), and blast radius are in
**`documentation/md/LOCATION_TIMEZONE_DESIGN.md`**.

**Out of scope for this ticket entry itself:** this was a documentation/scoping placeholder, not an
implementation ticket — no code changes here.

## Resolution

The design doc grew through further discussion (a validated `TIMESTAMP`-vs-`TIMESTAMPTZ` example
against real Postgres, `Intl.DateTimeFormat()` confirmed as a permission-free browser API for
sourcing a client's zone, a creator-zone fallback proposed for location-less sessions) and was then
split into concrete, sequenced implementation tickets rather than staying open-ended:

- **LOC-4** — `Location` gains a real IANA timezone (foundational, no dependency on this ticket)
- **SESSION-33** — `Session.scheduledStart` becomes a true instant, plus a creator-zone fallback for
  location-less (`PREPARING`/standalone) sessions
- **SESSION-34** — rewrites `findHistoryDateCounts` using `AT TIME ZONE` — supersedes **SESSION-31**,
  whose own JVM-offset point-fix was implemented, fully verified, and then deliberately reverted
  before merge once this redesign was chosen instead
- **SESSION-35** — rewrites `/discover`'s `date`/`startTime` filters the same way, partially
  superseding the `EXTRACT`+`MOD` correction SESSION-25 introduced
- **CLIENT-SESSION-24** — client submits an offset-aware `scheduledStart` and its own browser
  timezone instead of a bare `LocalDateTime`

Each open question this ticket originally flagged (standalone sessions with no location, where a
caller's own zone comes from, migration/backfill for existing zone-less data) now lives as an
explicit "resolve at pickup" note on whichever new ticket owns it, rather than staying unowned here.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
