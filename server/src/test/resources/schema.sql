-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP NOT NULL
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    username VARCHAR(50) UNIQUE,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20),
    bio TEXT,
    avatar_url VARCHAR(500),
    cover_url VARCHAR(500),
    location GEOMETRY(Point, 4326),
    city VARCHAR(100),
    country VARCHAR(100),
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    height_cm INTEGER,
    weight_kg NUMERIC(5,2),
    shoe_size_cm INTEGER,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- Create user_roles join table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Create refresh_tokens table (needed once an IT test started exercising real refresh/deactivation
-- flows — U12, modules/user/user-impl/docs/BACKLOG_MVP.md). Mirrors V002__create_auth_tables.sql.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Create sports table (needed once PostServiceImpl started querying it directly — A9,
-- modules/social/post-impl/docs/BACKLOG_MVP.md)
CREATE TABLE IF NOT EXISTS sports (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50),
    icon_url VARCHAR(500),
    min_players INTEGER,
    max_players INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    -- A9 (sport-impl): per-sport attribute definition tree. H2 JSON rather than Postgres JSONB
    -- (V059), the same substitution this file already makes for user_sport_profiles.attributes.
    attributes_schema JSON,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- user_sport_profiles (added by A7, for SportActiveGateIntegrationTest). Mirrors V003 minus the
-- cross-domain FK into users (A8 is removing that in the real schema anyway) and with attributes
-- as H2 JSON rather than Postgres JSONB (V025). The UNIQUE(user_id, sport_id) constraint IS
-- mirrored: it is load-bearing for the soft-delete case, since a soft-deleted row still occupies
-- the pair.
CREATE TABLE IF NOT EXISTS user_sport_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    sport_id BIGINT NOT NULL,
    skill_level VARCHAR(50),
    years_of_experience INTEGER,
    preferred_position VARCHAR(100),
    bio TEXT,
    attributes JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sport_id)
);

-- group_types / group_settings (added by A7): createGroup writes a settings row against the
-- DEFAULT tier, so the success case cannot complete without both. Seed rows mirror V026.
CREATE TABLE IF NOT EXISTS group_types (
    id BIGSERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    max_members INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_settings (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT UNIQUE NOT NULL,
    group_type_id BIGINT,
    allow_member_posts BOOLEAN DEFAULT TRUE,
    require_post_approval BOOLEAN DEFAULT FALSE,
    allow_member_invites BOOLEAN DEFAULT FALSE,
    auto_generate_sessions BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

MERGE INTO group_types (id, type_name, max_members) KEY(id) VALUES (1, 'DEFAULT', 50);
MERGE INTO group_types (id, type_name, max_members) KEY(id) VALUES (2, 'STANDARD', 100);
MERGE INTO group_types (id, type_name, max_members) KEY(id) VALUES (3, 'PREMIUM', 500);

-- Create group_roles / groups / group_members tables (needed once a real
-- @SpringBootTest first exercised an authenticated GroupService call for real
-- instead of mocking it — A10, modules/social/post-impl/docs/BACKLOG_MVP.md;
-- PostServiceImpl.getPostsByHashtag calls groupService.getGroupIdsForMember()
-- for any authenticated caller, which queries group_members directly)
CREATE TABLE IF NOT EXISTS group_roles (
    id INTEGER PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(500),
    level INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

MERGE INTO group_roles (id, role_name, description, level) KEY(id) VALUES
    (1, 'group_owner', 'Group creator with full control', 3),
    (2, 'group_admin', 'Group administrator with elevated permissions', 2),
    (3, 'group_member', 'Regular group member', 1);

CREATE TABLE IF NOT EXISTS groups (
    id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(500),
    avatar_url VARCHAR(500),
    cover_url VARCHAR(500),
    is_private BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    rules VARCHAR(2000) NOT NULL DEFAULT '',
    schedule VARCHAR(2000) NOT NULL DEFAULT '',
    -- GROUP-RECUR-1 (V033/V036) — needed for a real @SpringBootTest to persist a Group entity,
    -- which has mapped these fields since that ticket shipped.
    recurrence_day_of_week VARCHAR(10),
    recurrence_time TIME,
    recurrence_duration_minutes INTEGER,
    recurrence_location_id BIGINT,
    recurrence_location_note VARCHAR(500),
    sport_id BIGINT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    role_id INTEGER NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_group_user UNIQUE(group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES group_roles(id)
);

-- Two rows per friendship pair, mirrors V019 — needed for a real @SpringBootTest to exercise
-- PostGate's friends-visibility branch (A14, modules/social/post-impl/docs/MVP/A14_POST_RESOURCE_GATE.md),
-- which calls UserFriendService.areFriends() for real.
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    friend_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_friendship_pair UNIQUE(user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id)
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    group_id BIGINT,
    content TEXT NOT NULL,
    location GEOMETRY(Point, 4326),
    location_name VARCHAR(255),
    sport_id BIGINT,
    visibility VARCHAR(20) DEFAULT 'public',
    is_active BOOLEAN DEFAULT TRUE,
    post_type VARCHAR(20) NOT NULL DEFAULT 'USER_FEED',
    last_interaction_at TIMESTAMP DEFAULT now(),
    broadcast_end_time TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    parent_comment_id BIGINT,
    content TEXT NOT NULL,
    comment_type VARCHAR(32) DEFAULT 'USER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id)
);

-- Create hashtags table
CREATE TABLE IF NOT EXISTS hashtags (
    id BIGSERIAL PRIMARY KEY,
    tag VARCHAR(100) UNIQUE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL
);

-- Create post_hashtags table
CREATE TABLE IF NOT EXISTS post_hashtags (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    hashtag_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (hashtag_id) REFERENCES hashtags(id)
);

-- Create post_media table
CREATE TABLE IF NOT EXISTS post_media (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    media_type VARCHAR(20) NOT NULL,
    media_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id)
);

-- Create post_likes table
CREATE TABLE IF NOT EXISTS post_likes (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (post_id, user_id)
);

-- Create comment_likes table (needed once a real @SpringBootTest first exercised
-- likeComment/unlikeComment for real — A14, modules/social/post-impl/docs/MVP/A14_POST_RESOURCE_GATE.md)
CREATE TABLE IF NOT EXISTS comment_likes (
    id BIGSERIAL PRIMARY KEY,
    comment_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (comment_id) REFERENCES comments(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (comment_id, user_id)
);

-- Create sessions / session_participants tables (needed once a real @SpringBootTest first
-- exercised PostGate's SESSION_POST case for real — SESSION-10/A17,
-- documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md §7's supersession note). Cross-domain columns
-- (created_by, cancelled_by, location_id, sport_id, group_id, post_id) carry no FK, mirroring
-- SESSION-11/A15's production drop of those constraints — session_id on session_participants is
-- in-domain and keeps its FK.
CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT,
    post_id BIGINT NOT NULL UNIQUE,
    session_type VARCHAR(30) NOT NULL,
    created_by UUID NOT NULL,
    sport_id BIGINT NOT NULL,
    title VARCHAR(200),
    description TEXT,
    location_id BIGINT NOT NULL,
    location_note VARCHAR(500),
    scheduled_start TIMESTAMP NOT NULL,
    scheduled_end_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    capacity INTEGER NOT NULL DEFAULT 9999,
    fee_type VARCHAR(10) NOT NULL DEFAULT 'FREE',
    fee_amount_vnd BIGINT,
    initial_slot INTEGER NOT NULL DEFAULT 0,
    auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_reason VARCHAR(500),
    cancelled_by UUID,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT unique_group_session_start UNIQUE (group_id, scheduled_start)
);

CREATE TABLE IF NOT EXISTS session_participants (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'JOINED',
    reject_reason VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    CONSTRAINT unique_session_user UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_user_id UUID NOT NULL,
    type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    actor_ids VARCHAR(500),
    actor_count INTEGER NOT NULL DEFAULT 0,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_outbox_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
