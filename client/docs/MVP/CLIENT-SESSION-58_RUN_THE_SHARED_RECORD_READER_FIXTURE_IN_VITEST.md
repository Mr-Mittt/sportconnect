# CLIENT-SESSION-58 · Run the shared record-reader fixture in Vitest

**Status:** `TODO`
**Type:** Testing · **Depends on:** SESSION-53 (the server side of the fixture, filed with it)
**Filed:** 2026-11-23, from the SESSION-53 pickup: the ticket said the fixture of valid and invalid records is run by both the client's Vitest and the server's Spock so the two readers cannot drift. The owner chose to build the server side first, so a server ticket does not trigger the client's full e2e run and baseline derivation; this ticket is the client half.

SESSION-53 adds `modules/session/session-impl/src/test/resources/record-reader/competitive-v1-cases.json`: a list of cases, each a result schema (badminton, and a football-like one with goals and assists), a record's `data`, and the expected facts (`valid`, `invalidReason`, `rankable`, `notRankableReason`, the players in team order). The server's `CompetitiveRecordReaderSpec` runs every case.

- A Vitest test (next to `recordData.test.ts`) reads that same file (path relative to the repo root, or copied by a small script if the Vite root forbids it) and runs every case through the client's own record validation (`recordData.ts`, `recordSchema.ts`), asserting the same `valid` and `rankable` answers and, where the client has an equivalent, the same reason.
- A case the client answers differently is a real drift: fix the side that is wrong, or record the difference as a known divergence in the fixture (a `clientDiffers` note) with the reason, never by deleting the case.
- No UI change, no copy, no MSW change, so no baseline moves; the e2e catalog is untouched (a unit test only). `pnpm e2e` still runs once for this client ticket, per the Phase 5 rule.

**Out of scope:** a client reader for new record types (SESSION-58), changing the server reader.

**Tests:** the new Vitest file (one test per case, named by the case id), mutation check by changing a case's expectation.
