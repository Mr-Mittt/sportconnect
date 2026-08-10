-- SESSION-11: drop cross-domain DB-level FKs on session-impl tables.
-- users (user-impl) and locations (location-impl) are different domains — a DB-level FK is a
-- hard schema coupling that violates "domain-scoped tables" / "cross-domain references use IDs
-- only". All four entities already treat the column as a plain UUID/Long (no @ManyToOne), so
-- this is schema-only: no entity/service/DTO change.
-- All four are NO ACTION (not CASCADE), so there's no delete-cascade behavior to lose. No test
-- or code path relies on the FK rejecting an insert with a dangling reference (confirmed by
-- grepping session-impl's tests for DataIntegrityViolationException — the one hit is unrelated,
-- about the unique_group_session_start constraint).

ALTER TABLE sessions DROP CONSTRAINT sessions_created_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_cancelled_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_location_id_fkey;
ALTER TABLE session_participants DROP CONSTRAINT session_participants_user_id_fkey;
