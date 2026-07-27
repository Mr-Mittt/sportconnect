-- Conversations cover both GROUP and DIRECT (1:1) chat in one lineage, per
-- the structural decision to design the schema for both now rather than
-- treating them as separate lineages requiring a rework later.
--
-- external_group_id/dm_key use zero-value semantics ("not applicable" for
-- the other Type), not NULL-checked pointer scanning, on the Go side — see
-- internal/conversation/conversation.go's Conversation struct comment.
CREATE TABLE conversations (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('GROUP', 'DIRECT')),
    -- Set for type = 'GROUP'. Value-only reference to the Java monolith's
    -- Group.id — no foreign key, per this repo's "IDs only across domain
    -- boundaries" rule, taken to its logical extreme here since there is no
    -- shared schema at all across the service boundary.
    external_group_id BIGINT,
    -- Set for type = 'DIRECT': LEAST(user_a, user_b) || ':' || GREATEST(user_a, user_b),
    -- computed application-side (see conversation.dmKey) so a DIRECT pair
    -- can never end up with two conversation rows.
    dm_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_conversations_external_group_id ON conversations (external_group_id) WHERE type = 'GROUP';
CREATE UNIQUE INDEX ux_conversations_dm_key ON conversations (dm_key) WHERE type = 'DIRECT';

-- A join table, not two nullable user-id columns on conversations itself —
-- GROUP conversations need an arbitrary-N member list (tracked separately,
-- in group_members_cache, since that's monolith-owned data); DIRECT
-- conversations need exactly the 2 participants recorded here so
-- authorization and future group-DM expansion share one shape.
CREATE TABLE conversation_participants (
    conversation_id BIGINT NOT NULL REFERENCES conversations (id),
    user_id UUID NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL = still an active participant. Left as a column (not a delete)
    -- so a DIRECT conversation's history remains visible to someone who
    -- later unfriends the other participant, distinct from authorization
    -- to send new messages (see conversation.Service.Authorize).
    left_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);
