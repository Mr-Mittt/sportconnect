// Package conversation is chat's own domain — conversations and their
// participants — for both GROUP and DIRECT conversations in one lineage
// (per the structural decision to design the schema for both now, even
// though which endpoints ship first is a separate future ticket). It reads
// authorization data from internal/sync's cache tables; it never calls the
// monolith directly.
package conversation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/db"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
)

type Type string

const (
	TypeGroup  Type = "GROUP"
	TypeDirect Type = "DIRECT"
)

// ExternalGroupID/DMKey use zero values (0 / "") rather than nullable Go
// pointer types to mean "not applicable for this conversation's Type" — the
// two columns are mutually exclusive by construction (only one is ever set,
// depending on Type), and a zero group ID / empty key are never valid real
// values, so this avoids nullable-scan handling for no real loss of clarity.
type Conversation struct {
	ID              int64
	Type            Type
	ExternalGroupID int64
	DMKey           string
	CreatedAt       time.Time
}

var (
	ErrNotAMember = errors.New("caller is not a member of this group")
	ErrNotFriends = errors.New("caller and target are not friends")
)

const conversationColumns = `id, type, COALESCE(external_group_id, 0), COALESCE(dm_key, ''), created_at`

// Repository is chat's own storage for conversations/participants — no
// foreign key ever points out of this database, per the repo-wide "IDs only
// across domain boundaries" rule, taken to its logical extreme here since
// there is no shared schema at all across the service boundary.
type Repository struct {
	pool db.TxQuerier
}

func NewRepository(pool db.TxQuerier) *Repository {
	return &Repository{pool: pool}
}

func scanConversation(row pgx.Row) (Conversation, error) {
	var c Conversation
	err := row.Scan(&c.ID, &c.Type, &c.ExternalGroupID, &c.DMKey, &c.CreatedAt)
	return c, err
}

func (r *Repository) GetOrCreateGroupConversation(ctx context.Context, groupID int64) (Conversation, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+conversationColumns+` FROM conversations WHERE type = 'GROUP' AND external_group_id = $1`, groupID)
	if conv, err := scanConversation(row); err == nil {
		return conv, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, err
	}

	insertRow := r.pool.QueryRow(ctx, `
		INSERT INTO conversations (type, external_group_id) VALUES ('GROUP', $1)
		RETURNING `+conversationColumns, groupID)
	return scanConversation(insertRow)
}

func (r *Repository) GetOrCreateDirectConversation(ctx context.Context, userA, userB string) (Conversation, error) {
	key := dmKey(userA, userB)

	row := r.pool.QueryRow(ctx, `SELECT `+conversationColumns+` FROM conversations WHERE type = 'DIRECT' AND dm_key = $1`, key)
	if conv, err := scanConversation(row); err == nil {
		return conv, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Conversation{}, err
	}
	defer tx.Rollback(ctx)

	insertRow := tx.QueryRow(ctx, `
		INSERT INTO conversations (type, dm_key) VALUES ('DIRECT', $1)
		RETURNING `+conversationColumns, key)
	conv, err := scanConversation(insertRow)
	if err != nil {
		return Conversation{}, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)
	`, conv.ID, userA, userB)
	if err != nil {
		return Conversation{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Conversation{}, err
	}
	return conv, nil
}

func (r *Repository) GetByID(ctx context.Context, id int64) (Conversation, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+conversationColumns+` FROM conversations WHERE id = $1`, id)
	return scanConversation(row)
}

// IsActiveParticipant checks conversation_participants directly — used for
// DIRECT authorization alongside the friendship cache check, since a
// friendship being revoked doesn't retroactively remove someone from a
// conversation they already have history in (left_at models that instead).
func (r *Repository) IsActiveParticipant(ctx context.Context, conversationID int64, userID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
		)
	`, conversationID, userID).Scan(&exists)
	return exists, err
}

func dmKey(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}

// Service is the authorization boundary every API handler goes through
// before touching a conversation — all checks read internal/sync's local
// cache, never a live call to the monolith.
type Service struct {
	repo  *Repository
	cache *sync.CacheStore
}

func NewService(repo *Repository, cache *sync.CacheStore) *Service {
	return &Service{repo: repo, cache: cache}
}

// OpenGroup returns (creating if needed) the conversation for a group,
// after confirming current membership against the sync cache.
func (s *Service) OpenGroup(ctx context.Context, callerID string, groupID int64) (Conversation, error) {
	isMember, err := s.cache.IsGroupMember(ctx, groupID, callerID)
	if err != nil {
		return Conversation{}, err
	}
	if !isMember {
		return Conversation{}, ErrNotAMember
	}
	return s.repo.GetOrCreateGroupConversation(ctx, groupID)
}

// OpenDirect returns (creating if needed) the 1:1 conversation between the
// caller and another user, after confirming they're currently friends.
func (s *Service) OpenDirect(ctx context.Context, callerID, otherUserID string) (Conversation, error) {
	areFriends, err := s.cache.AreFriends(ctx, callerID, otherUserID)
	if err != nil {
		return Conversation{}, err
	}
	if !areFriends {
		return Conversation{}, ErrNotFriends
	}
	return s.repo.GetOrCreateDirectConversation(ctx, callerID, otherUserID)
}

// Authorize re-checks, at message send/read time, that callerID may still
// act on conv — always against the local cache, never the monolith. Called
// on every send/read, not just at conversation-open time, since the access
// token's 24h TTL is long enough for membership to change mid-session.
func (s *Service) Authorize(ctx context.Context, conv Conversation, callerID string) (bool, error) {
	switch conv.Type {
	case TypeGroup:
		return s.cache.IsGroupMember(ctx, conv.ExternalGroupID, callerID)
	case TypeDirect:
		return s.repo.IsActiveParticipant(ctx, conv.ID, callerID)
	default:
		return false, fmt.Errorf("unknown conversation type %q", conv.Type)
	}
}

// AuthorizeByID is the single entry point every send/read/websocket-connect
// handler calls: load the conversation, re-check the caller is still
// allowed on it right now, and hand back the conversation on success. This
// is the only path the API layer needs — it never calls Authorize directly.
func (s *Service) AuthorizeByID(ctx context.Context, conversationID int64, callerID string) (Conversation, error) {
	conv, err := s.repo.GetByID(ctx, conversationID)
	if err != nil {
		return Conversation{}, err
	}

	ok, err := s.Authorize(ctx, conv, callerID)
	if err != nil {
		return Conversation{}, err
	}
	if !ok {
		if conv.Type == TypeGroup {
			return Conversation{}, ErrNotAMember
		}
		return Conversation{}, ErrNotFriends
	}
	return conv, nil
}
