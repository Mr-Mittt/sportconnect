-- SESSION-GROUP-4: how a group's regular sessions are generated (settings + recurrence configurations).
--
-- group_session_settings: one row per group that ever saved a setting; no row means OFF and WEEKLY. `enabled` turns generation
--   on or off, `mode` is the one active recurrence mode (recurrences of the other mode stay stored and are inert).
-- group_session_recurrences: one wall-clock slot of a group: `day_key` is a weekday 1-7 (Monday first) in WEEKLY mode or a day of
--   the month 1-31 in MONTHLY mode, `start_time` a local time read in the location's timezone when a session is generated
--   (SESSION-GROUP-5). `is_draft` is computed by the service (a missing location, duration or fixed-fee amount) and a draft is
--   never generated. At most 5 per (group, mode, day) is enforced by the service, not here.
-- group_session_recurrence_members: the chosen members of a SPECIFIC audience; recurrence_id is in-domain and keeps its FK
--   (hard delete of a recurrence removes them), user_id is cross-domain and carries none. group_id and location_id carry no FK
--   either (cross-domain, the repo-wide rule).
-- Not touched: groups.recurrence_* and group_settings.auto_generate_sessions (the old single rule), removed later by GROUP-1.
CREATE TABLE group_session_settings (
    group_id BIGINT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mode VARCHAR(10) NOT NULL DEFAULT 'WEEKLY',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_group_session_settings_mode CHECK (mode IN ('WEEKLY', 'MONTHLY'))
);

CREATE TABLE group_session_recurrences (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL,
    mode VARCHAR(10) NOT NULL,
    day_key INTEGER NOT NULL,
    start_time TIME NOT NULL,
    duration_minutes INTEGER,
    location_id BIGINT,
    location_note VARCHAR(500),
    audience VARCHAR(20) NOT NULL DEFAULT 'ALL_MEMBERS',
    fee_type VARCHAR(10),
    fee_amount_vnd BIGINT,
    fee_note VARCHAR(300),
    game_mood INTEGER NOT NULL DEFAULT 5,
    attributes JSONB,
    is_draft BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT chk_group_session_recurrences_mode CHECK (mode IN ('WEEKLY', 'MONTHLY')),
    CONSTRAINT chk_group_session_recurrences_day CHECK (day_key BETWEEN 1 AND 31),
    CONSTRAINT chk_group_session_recurrences_audience CHECK (audience IN ('ALL_MEMBERS', 'SPECIFIC')),
    CONSTRAINT chk_group_session_recurrences_mood CHECK (game_mood BETWEEN 1 AND 10),
    CONSTRAINT chk_group_session_recurrences_duration CHECK (duration_minutes IS NULL OR duration_minutes >= 1)
);

-- The list of a group's recurrences, and the per-day count behind the 5-per-day limit.
CREATE INDEX idx_group_session_recurrences_group ON group_session_recurrences (group_id, mode, day_key, start_time);

CREATE TABLE group_session_recurrence_members (
    id BIGSERIAL PRIMARY KEY,
    recurrence_id BIGINT NOT NULL REFERENCES group_session_recurrences(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    CONSTRAINT unique_group_session_recurrence_member UNIQUE (recurrence_id, user_id)
);
