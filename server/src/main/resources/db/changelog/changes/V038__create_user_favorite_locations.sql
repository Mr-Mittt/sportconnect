-- LOC-2: favorite locations, filterable by sport via a join to locations.sport_id
CREATE TABLE user_favorite_locations (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, location_id)
);

CREATE INDEX idx_user_favorite_locations_user_id ON user_favorite_locations(user_id);

COMMENT ON TABLE user_favorite_locations IS 'Per-user favorite venues (LOC-2) — no sportId column, always resolved by joining to locations.sport_id; favoriting requires an active UserSportProfile for that sport, enforced in the service layer.';
