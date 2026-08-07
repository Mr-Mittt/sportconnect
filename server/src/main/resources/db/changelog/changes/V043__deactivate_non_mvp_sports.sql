-- A6: MVP sport restriction — deactivate every seeded sport except Badminton and Pickleball
-- Data-only change; reactivating a sport later is the trivial inverse UPDATE (all deactivated
-- rows were is_active = true beforehand, so no snapshot/rollback data needs to be captured).

UPDATE sports SET is_active = false WHERE name NOT IN ('Badminton', 'Pickleball');
