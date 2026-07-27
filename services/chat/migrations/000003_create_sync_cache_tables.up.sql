-- Local read cache of the Java monolith's group membership, friendships,
-- and user display info — kept in sync via internal/sync (Redis Streams for
-- ongoing deltas, a one-time HTTP bootstrap pull for cold start). None of
-- these tables has a foreign key into chat's own tables (conversations,
-- chat_messages): they're joined at query time in application code only,
-- per docs/SYNC_DESIGN.md. Nothing outside internal/sync ever writes these.
CREATE TABLE group_members_cache (
    group_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    -- Not currently kept in sync on role change (transferOwnership /
    -- updateMemberRole aren't published events) — a documented gap, see
    -- docs/SYNC_DESIGN.md. Chat authorization only needs "member or not."
    role TEXT,
    synced_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE friendships_cache (
    user_id UUID NOT NULL,
    friend_id UUID NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE user_profiles_cache (
    user_id UUID PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT,
    avatar_url TEXT,
    synced_at TIMESTAMPTZ NOT NULL
);

-- Tracks the last acked Redis Stream entry ID per stream, so a restart
-- resumes the consumer group instead of re-running the cold-start bootstrap.
CREATE TABLE sync_state (
    stream TEXT PRIMARY KEY,
    last_id TEXT NOT NULL
);
