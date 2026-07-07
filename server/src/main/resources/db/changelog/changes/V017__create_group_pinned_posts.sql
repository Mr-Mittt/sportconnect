CREATE TABLE group_pinned_posts (
    id         BIGSERIAL PRIMARY KEY,
    group_id   BIGINT    NOT NULL,
    post_id    BIGINT    NOT NULL,
    pinned_by  UUID      NOT NULL,
    pinned_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_group_pinned_post UNIQUE (group_id, post_id)
);

CREATE INDEX idx_group_pinned_posts_group_id ON group_pinned_posts (group_id, pinned_at DESC);
