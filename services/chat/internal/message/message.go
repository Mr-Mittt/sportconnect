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

	"github.com/jackc/pgx/v5"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/db"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
)

// MaxContentLength reuses the same cap the archived PubNub plan already
// picked for chat, itself reused from the existing comment-length limit
// elsewhere in this app.
const MaxContentLength = 1000

var ErrContentTooLong = errors.New("message content exceeds maximum length")
var ErrEmptyContent = errors.New("message content must not be empty")

// CHAT-13: edit/delete are both sender-only (no group-admin moderation —
// that would need services/chat/CLAUDE.md's documented role-sync gap closed
// first, deliberately out of scope here) and unwindowed (no "can't edit
// after N minutes" rule).
var ErrMessageNotFound = errors.New("message not found")
var ErrNotSender = errors.New("only the sender can modify this message")

type Message struct {
	ID             int64
	ConversationID int64
	SenderID       string
	Content        string
	CreatedAt      time.Time
	// EditedAt/DeletedAt are nil for a message that's never been touched —
	// Insert never sets either (Go's zero value for a pointer is already
	// nil, and Insert's RETURNING clause doesn't select them), so only
	// Edit/Delete ever populate them.
	EditedAt  *time.Time
	DeletedAt *time.Time
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
			SELECT id, conversation_id, sender_id, content, created_at, edited_at, deleted_at
			FROM chat_messages
			WHERE conversation_id = $1 AND id < $2
			ORDER BY id DESC
			LIMIT $3
		`
		args = []any{conversationID, beforeID, limit}
	} else {
		query = `
			SELECT id, conversation_id, sender_id, content, created_at, edited_at, deleted_at
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
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.CreatedAt, &m.EditedAt, &m.DeletedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

// Edit overwrites a message's content in place (replace, not versioned —
// CHAT-13's chosen model) and stamps edited_at. The WHERE clause enforces
// sender-only authorization and rejects an already-deleted message
// atomically, in the same query as the content check on the common
// (successful) path — diagnoseFailure only runs a second query when this
// one matches nothing, to explain which of those two guards actually
// failed.
func (r *Repository) Edit(ctx context.Context, messageID int64, senderID, content string) (Message, error) {
	var m Message
	err := r.pool.QueryRow(ctx, `
		UPDATE chat_messages
		SET content = $1, edited_at = now()
		WHERE id = $2 AND sender_id = $3 AND deleted_at IS NULL
		RETURNING id, conversation_id, sender_id, content, created_at, edited_at, deleted_at
	`, content, messageID, senderID).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.CreatedAt, &m.EditedAt, &m.DeletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Message{}, r.diagnoseFailure(ctx, messageID, senderID)
	}
	return m, err
}

// Delete soft-deletes: stamps deleted_at and scrubs content to an empty
// string so a deleted message's original text is never re-served by
// History, even though the row itself stays (id/position stability, same
// convention as User.isActive/Group.isActive elsewhere in this app). Same
// atomic-guard-then-diagnose shape as Edit.
func (r *Repository) Delete(ctx context.Context, messageID int64, senderID string) (Message, error) {
	var m Message
	err := r.pool.QueryRow(ctx, `
		UPDATE chat_messages
		SET content = '', deleted_at = now()
		WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
		RETURNING id, conversation_id, sender_id, content, created_at, edited_at, deleted_at
	`, messageID, senderID).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.CreatedAt, &m.EditedAt, &m.DeletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Message{}, r.diagnoseFailure(ctx, messageID, senderID)
	}
	return m, err
}

// diagnoseFailure runs only when Edit/Delete's guarded UPDATE matches no
// row, to tell apart the three reasons why (message doesn't exist, already
// deleted, or belongs to someone else) so the API layer can map each to the
// right HTTP status — a plain "0 rows updated" alone can't distinguish
// them.
func (r *Repository) diagnoseFailure(ctx context.Context, messageID int64, senderID string) error {
	var (
		actualSenderID string
		deletedAt      *time.Time
	)
	err := r.pool.QueryRow(ctx, `SELECT sender_id, deleted_at FROM chat_messages WHERE id = $1`, messageID).
		Scan(&actualSenderID, &deletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMessageNotFound
	}
	if err != nil {
		return err
	}
	if deletedAt != nil {
		return ErrMessageNotFound
	}
	if actualSenderID != senderID {
		return ErrNotSender
	}
	// All guards should have passed for the UPDATE to have matched — reaching
	// here would mean a concurrent change raced this diagnosis; treat it as
	// not-found rather than asserting an invariant that just became stale.
	return ErrMessageNotFound
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

// Edit validates new content the same way Send does, then delegates to
// Repository.Edit (which enforces sender-only authorization and rejects an
// already-deleted message).
func (s *Service) Edit(ctx context.Context, messageID int64, senderID, content string) (WithSender, error) {
	if content == "" {
		return WithSender{}, ErrEmptyContent
	}
	if len(content) > MaxContentLength {
		return WithSender{}, ErrContentTooLong
	}

	m, err := s.repo.Edit(ctx, messageID, senderID, content)
	if err != nil {
		return WithSender{}, err
	}

	return s.withSender(ctx, []Message{m})[0], nil
}

// Delete soft-deletes via Repository.Delete (sender-only, same as Edit) and
// resolves sender info for the caller's response/broadcast even though the
// message's own content comes back scrubbed.
func (s *Service) Delete(ctx context.Context, messageID int64, senderID string) (WithSender, error) {
	m, err := s.repo.Delete(ctx, messageID, senderID)
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
