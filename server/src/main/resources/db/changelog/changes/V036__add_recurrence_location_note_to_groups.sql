-- Default note (e.g. "always Court 3") copied verbatim into Session.location_note on every
-- occurrence the recurrence job auto-generates for this group.

ALTER TABLE groups ADD COLUMN recurrence_location_note VARCHAR(500);
