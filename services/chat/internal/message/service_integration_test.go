package message

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

const (
	senderX = "44444444-4444-4444-4444-444444444444"
	senderY = "55555555-5555-5555-5555-555555555555"
)

func newTestService(t *testing.T) (*Service, int64, *testdb.CountingQuerier) {
	t.Helper()
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)

	var conversationID int64
	err := tx.QueryRow(context.Background(), `
		INSERT INTO conversations (type, external_group_id) VALUES ('GROUP', $1) RETURNING id
	`, int64(52000)).Scan(&conversationID)
	require.NoError(t, err)

	counting := testdb.NewCountingQuerier(tx)
	svc := NewService(NewRepository(tx), sync.NewCacheStore(counting))
	return svc, conversationID, counting
}

func TestSend_PersistsAndResolvesSender(t *testing.T) {
	svc, conversationID, _ := newTestService(t)
	ctx := context.Background()

	// Seed the sender's profile directly via SQL, through the same
	// transaction the service's repository holds, so the write is visible
	// within this test's isolated tx.
	_, err := svc.repo.pool.Exec(ctx, `
		INSERT INTO user_profiles_cache (user_id, full_name, username, avatar_url, synced_at)
		VALUES ($1, 'Jordan Lee', 'jlee', 'https://example.com/avatar.jpg', now())
	`, senderX)
	require.NoError(t, err)

	sent, err := svc.Send(ctx, conversationID, senderX, "hello there")
	require.NoError(t, err)

	assert.Equal(t, senderX, sent.SenderID)
	assert.Equal(t, "hello there", sent.Content)
	assert.Equal(t, "Jordan Lee", sent.SenderFullName)
	assert.Equal(t, "https://example.com/avatar.jpg", sent.SenderAvatarURL)
}

func TestHistory_BatchedSenderResolutionIsOneQuery(t *testing.T) {
	svc, conversationID, counting := newTestService(t)
	ctx := context.Background()

	_, err := svc.repo.pool.Exec(ctx, `
		INSERT INTO user_profiles_cache (user_id, full_name, username, avatar_url, synced_at) VALUES
			($1, 'Sender X', 'senderx', '', now()),
			($2, 'Sender Y', 'sendery', '', now())
	`, senderX, senderY)
	require.NoError(t, err)

	// Alternate senders across several messages so the page has more than
	// one distinct sender — the case that would trigger N+1 if withSender
	// resolved profiles one at a time.
	senders := []string{senderX, senderY, senderX, senderY, senderX}
	for _, senderID := range senders {
		_, err := svc.repo.Insert(ctx, conversationID, senderID, "msg")
		require.NoError(t, err)
	}

	before := counting.QueryCalls()
	history, err := svc.History(ctx, conversationID, 0, 10)
	require.NoError(t, err)
	after := counting.QueryCalls()

	require.Len(t, history, len(senders))
	for _, m := range history {
		if m.SenderID == senderX {
			assert.Equal(t, "Sender X", m.SenderFullName)
		} else {
			assert.Equal(t, "Sender Y", m.SenderFullName)
		}
	}

	// Only the cache's querier is wrapped by CountingQuerier (see
	// newTestService) — so this counts exactly the profile-resolution
	// queries UserProfiles issues, isolated from Page's own query. It must
	// stay at 1 regardless of page size or distinct-sender count — never one
	// profile query per message.
	assert.Equal(t, int64(1), after-before, "History must resolve sender profiles in one batched query, not one per message")
}
