-- NTF-1: replace the dead V005 notifications table (zero owning code, cross-domain FKs straight
-- to users(id)) with a domain-owned, ID-only replacement for the new notification module.
DROP TABLE IF EXISTS notifications;

CREATE TABLE notifications (
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

-- GET /api/notifications: newest-active-first list for one recipient
CREATE INDEX idx_notifications_recipient_updated ON notifications(recipient_user_id, updated_at DESC);

-- GET /api/notifications/unread-count
CREATE INDEX idx_notifications_recipient_unread ON notifications(recipient_user_id, is_read);

-- recordEvent's aggregation upsert lookup (find the open unread group for this key)
CREATE INDEX idx_notifications_aggregation_key
    ON notifications(recipient_user_id, type, entity_type, entity_id, is_read);
