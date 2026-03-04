-- Create group_join_requests table
-- Manages user requests to join groups and admin approval workflow

CREATE TABLE group_join_requests (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_group_join_requests_group_id ON group_join_requests(group_id);
CREATE INDEX idx_group_join_requests_user_id ON group_join_requests(user_id);
CREATE INDEX idx_group_join_requests_status ON group_join_requests(status);

-- Unique constraint: only one pending request per user per group
CREATE UNIQUE INDEX idx_unique_pending_request 
    ON group_join_requests(group_id, user_id) 
    WHERE status = 'pending';

-- Comments
COMMENT ON TABLE group_join_requests IS 'Join requests from users wanting to join groups';
COMMENT ON COLUMN group_join_requests.status IS 'Request status: pending (awaiting review), accepted, declined';
COMMENT ON COLUMN group_join_requests.message IS 'Optional message from user to group admins';
COMMENT ON COLUMN group_join_requests.reviewed_by IS 'Admin/owner who accepted or declined the request';
