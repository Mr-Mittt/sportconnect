-- LOC-1: Shared, sport-scoped venue directory. Referenced by Session.location_id and
-- Group.recurrence_location_id (added in later migrations) instead of duplicating raw
-- location fields on each.

CREATE TABLE locations (
    id BIGSERIAL PRIMARY KEY,
    sport_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    address VARCHAR(500),
    location GEOGRAPHY(POINT, 4326),
    source_maps_url VARCHAR(1000),
    claimed_by_vendor_id BIGINT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE locations IS 'Crowdsourced, sport-specific venue directory (LOC-1)';
COMMENT ON COLUMN locations.sport_id IS 'A Location is specific to one sport; a multi-sport complex is modeled as multiple rows';
COMMENT ON COLUMN locations.source_maps_url IS 'Original pasted Google Maps URL, kept for provenance/re-resolution';
COMMENT ON COLUMN locations.claimed_by_vendor_id IS 'Placeholder for a future Vendor/Facility feature to claim this Location; no Vendor entity exists yet';

CREATE INDEX idx_locations_location ON locations USING GIST(location);
CREATE INDEX idx_locations_sport_id_name ON locations(sport_id, name);
