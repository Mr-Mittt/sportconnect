-- content's 1000-char cap reuses the limit the archived PubNub plan already
-- picked (itself reused from this app's existing comment-length limit) —
-- see internal/message.MaxContentLength, which enforces the same cap
-- application-side before a row is ever inserted.
CREATE TABLE chat_messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations (id),
    sender_id UUID NOT NULL,
    content VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backs the keyset-paginated history query (internal/message.Repository.Page)
-- — id DESC within a conversation, no offset pagination.
CREATE INDEX ix_chat_messages_conversation_id_id ON chat_messages (conversation_id, id DESC);
