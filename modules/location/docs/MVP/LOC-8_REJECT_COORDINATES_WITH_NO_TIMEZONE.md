# LOC-8 · Reject a location whose coordinates resolve to no timezone

**Status:** `TODO`
**Type:** Enhancement (validation)
**Depends on:** LOC-4 (the timezone engine), LOC-7 (decided there that a missing timezone must not be stored silently)
**Filed:** 2026-11-10, found while closing LOC-7.

`CreateLocationRequest` has no latitude or longitude range check (a gap LOC-4 noted as out of its scope). `TimeZoneEngine` answers every valid coordinate (even open ocean maps to an `Etc/GMT+-N` zone), so an empty result only happens for an impossible coordinate, for example latitude 200. `LocationServiceImpl.createLocation` then saves the location with a null `timezone`, and `SessionGenerationService.resolveZone` falls back to the JVM's own zone for it, so sessions generated at that location are scheduled in the wrong local time, silently. LOC-7's decision (owner, 2026-11-10) is that a location should not be stored without a timezone when its coordinates are present; this ticket applies it to the one case LOC-7 left alone.

**What to do (to settle at pickup):** validate latitude in [-90, 90] and longitude in [-180, 180] on `CreateLocationRequest` and, as the backstop, make `createLocation` throw when coordinates are present and the resolver returns empty. Both with a stable `errorCode` (C12, `documentation/md/ERROR_CODES.md`), and the en and vi client strings in the same change or a client ticket filed at once (`client/docs/BACKLOG_MVP.md`). A location without coordinates (allowed today) still saves with a null timezone; that is a separate question for the owner (should a venue with no coordinates exist at all?), not decided here.

**Consumer census to run at pickup:** every caller of `POST /api/locations` (the client's `LocationPicker`, `client/e2e/mocks`), `createLocation` callers in other modules, and whether any existing row already has coordinates with a null timezone (a one-off query on the box, then a backfill if any).

**Out of scope:** the LOC-7 container flags, locations without coordinates.
