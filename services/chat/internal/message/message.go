// Package message is chat's other domain package — sending and paginated
// history — deliberately separate from internal/conversation because
// conversations are created once while messages are the high-frequency
// path; keeping them apart mirrors modules/social splitting post/group by
// lifecycle rather than by technical layer.
package message

import (
	"context"
	"errors"
	"time"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/db"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
)

// MaxContentLength reuses the same cap the archived PubNub plan already
// picked for chat, itself reused from the existing comment-length limit
// elsewhere in this app.
const MaxContentLength = 1000

var ErrContentTooLong = errors.New("message content exceeds maximum length")
var ErrEmptyContent = errors.New("message content must not be empty")

type Message struct {
	ID             int64
	ConversationID int64
	SenderID       string
	Content        string
	CreatedAt      time.Time
}

// WithSender is what the API layer actually returns — the sender's display
// name/avatar resolved server-side, never taken from client input.
type WithSender struct {
	Message
	SenderFullName  string
	SenderAvatarURL string
}

type Repository struct {
	pool db.Querier
}

func NewRepository(pool db.Querier) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Insert(ctx context.Context, conversationID int64, senderID, content string) (Message, error) {
	var m Message
	err := r.pool.QueryRow(ctx, `
		INSERT INTO chat_messages (conversation_id, sender_id, content)
		VALUES ($1, $2, $3)
		RETURNING id, conversation_id, sender_id, content, created_at
	`, conversationID, senderID, content).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.CreatedAt)
	return m, err
}

// Page returns up to limit messages older than beforeID (0 meaning "most
// recent"), newest first — a simple keyset page over the
// (conversation_id, created_at) index, avoiding offset pagination's
// degradation on a long-running conversation.
func (r *Repository) Page(ctx context.Context, conversationID int64, beforeID int64, limit int) ([]Message, error) {
	var (
		query string
		args  []any
	)

	if beforeID > 0 {
		query = `
			SELECT id, conversation_id, sender_id, content, created_at
			FROM chat_messages
			WHERE conversation_id = $1 AND id < $2
			ORDER BY id DESC
			LIMIT $3
		`
		args = []any{conversationID, beforeID, limit}
	} else {
		query = `
			SELECT id, conversation_id, sender_id, content, created_at
			FROM chat_messages
			WHERE conversation_id = $1
			ORDER BY id DESC
			LIMIT $2
		`
		args = []any{conversationID, limit}
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]Message, 0, limit)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

// Service is the entry point the API layer uses — validation, persistence,
// and batched sender-name resolution live here so no handler has to
// remember the N+1 rule itself.
type Service struct {
	repo  *Repository
	cache *sync.CacheStore
}

func NewService(repo *Repository, cache *sync.CacheStore) *Service {
	return &Service{repo: repo, cache: cache}
}

func (s *Service) Send(ctx context.Context, conversationID int64, senderID, content string) (WithSender, error) {
	if content == "" {
		return WithSender{}, ErrEmptyContent
	}
	if len(content) > MaxContentLength {
		return WithSender{}, ErrContentTooLong
	}

	m, err := s.repo.Insert(ctx, conversationID, senderID, content)
	if err != nil {
		return WithSender{}, err
	}

	return s.withSender(ctx, []Message{m})[0], nil
}

// History returns a page of messages with sender info batch-resolved in one
// query against user_profiles_cache, regardless of how many distinct
// senders are in the page — the same N+1 discipline CLAUDE.md requires
// Java-side, applied here.
func (s *Service) History(ctx context.Context, conversationID int64, beforeID int64, limit int) ([]WithSender, error) {
	messages, err := s.repo.Page(ctx, conversationID, beforeID, limit)
	if err != nil {
		return nil, err
	}
	return s.withSender(ctx, messages), nil
}

func (s *Service) withSender(ctx context.Context, messages []Message) []WithSender {
	senderIDs := make([]string, 0, len(messages))
	seen := make(map[string]bool, len(messages))
	for _, m := range messages {
		if !seen[m.SenderID] {
			seen[m.SenderID] = true
			senderIDs = append(senderIDs, m.SenderID)
		}
	}

	profiles, err := s.cache.UserProfiles(ctx, senderIDs)
	if err != nil {
		profiles = map[string]sync.UserProfile{}
	}

	result := make([]WithSender, len(messages))
	for i, m := range messages {
		result[i] = WithSender{Message: m}
		if p, ok := profiles[m.SenderID]; ok {
			result[i].SenderFullName = p.FullName
			result[i].SenderAvatarURL = p.AvatarURL
		}
	}
	return result
}
