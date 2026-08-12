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
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

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
-- PostGate's friends-visibility branch (A14, modules/social/post-impl/docs/A14_POST_RESOURCE_GATE.md),
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
-- likeComment/unlikeComment for real — A14, modules/social/post-impl/docs/A14_POST_RESOURCE_GATE.md)
CREATE TABLE IF NOT EXISTS comment_likes (
    id BIGSERIAL PRIMARY KEY,
    comment_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (comment_id) REFERENCES comments(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (comment_id, user_id)
);
