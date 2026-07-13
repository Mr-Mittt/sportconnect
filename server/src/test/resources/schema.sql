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
