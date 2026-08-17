-- NTF-2: notification-impl's own idempotency marker table for the sportconnect.events consumer.
-- message_id is the AMQP messageId OutboxRelay sets (routingKey + ":" + outbox row id), globally
-- unique across every current/future producer. A redelivered message's insert here hits the PK
-- unique constraint, recognized as "already processed" and skipped, not an error.
CREATE TABLE processed_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
