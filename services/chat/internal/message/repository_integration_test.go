package message

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

const testSenderID = "11111111-1111-1111-1111-111111111111"

// newTestRepository opens an isolated test transaction and inserts a real
// conversations row directly via SQL (chat_messages has a foreign key into
// it) rather than depending on the conversation package, keeping this
// package's tests self-contained.
func newTestRepository(t *testing.T) (*Repository, int64) {
	t.Helper()
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)

	var conversationID int64
	err := tx.QueryRow(context.Background(), `
		INSERT INTO conversations (type, external_group_id) VALUES ('GROUP', $1) RETURNING id
	`, int64(51000)).Scan(&conversationID)
	require.NoError(t, err)

	return NewRepository(tx), conversationID
}

func TestInsert(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	m, err := repo.Insert(ctx, conversationID, testSenderID, "hello")
	require.NoError(t, err)

	assert.NotZero(t, m.ID)
	assert.Equal(t, conversationID, m.ConversationID)
	assert.Equal(t, testSenderID, m.SenderID)
	assert.Equal(t, "hello", m.Content)
	assert.False(t, m.CreatedAt.IsZero())
}

func TestPage_KeysetPagination(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	const total = 5
	inserted := make([]Message, 0, total)
	for i := 0; i < total; i++ {
		m, err := repo.Insert(ctx, conversationID, testSenderID, "msg")
		require.NoError(t, err)
		inserted = append(inserted, m)
	}

	// Most recent page: no beforeID, limit 2 -> newest 2, DESC order.
	firstPage, err := repo.Page(ctx, conversationID, 0, 2)
	require.NoError(t, err)
	require.Len(t, firstPage, 2)
	assert.Equal(t, inserted[4].ID, firstPage[0].ID)
	assert.Equal(t, inserted[3].ID, firstPage[1].ID)

	// Next page, keyed off the oldest ID just returned.
	secondPage, err := repo.Page(ctx, conversationID, firstPage[1].ID, 2)
	require.NoError(t, err)
	require.Len(t, secondPage, 2)
	assert.Equal(t, inserted[2].ID, secondPage[0].ID)
	assert.Equal(t, inserted[1].ID, secondPage[1].ID)

	// No overlap between the two pages.
	for _, a := range firstPage {
		for _, b := range secondPage {
			assert.NotEqual(t, a.ID, b.ID, "pages must not overlap")
		}
	}

	// Final page.
	thirdPage, err := repo.Page(ctx, conversationID, secondPage[1].ID, 2)
	require.NoError(t, err)
	require.Len(t, thirdPage, 1)
	assert.Equal(t, inserted[0].ID, thirdPage[0].ID)
}
