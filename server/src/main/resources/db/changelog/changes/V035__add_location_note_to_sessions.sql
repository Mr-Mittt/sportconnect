-- Lets a session creator attach free-text detail within the shared Location (e.g. "Court 3",
-- "North field") without writing back to the shared, crowdsourced Location row itself.

ALTER TABLE sessions ADD COLUMN location_note VARCHAR(500);
