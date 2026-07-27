package message

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

const testSenderID = "11111111-1111-1111-1111-111111111111"
const testOtherSenderID = "22222222-2222-2222-2222-222222222222"

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

func TestEdit_UpdatesContentAndStampsEditedAt(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	original, err := repo.Insert(ctx, conversationID, testSenderID, "hello")
	require.NoError(t, err)
	assert.Nil(t, original.EditedAt)

	edited, err := repo.Edit(ctx, original.ID, testSenderID, "hello, edited")
	require.NoError(t, err)

	assert.Equal(t, original.ID, edited.ID)
	assert.Equal(t, "hello, edited", edited.Content)
	require.NotNil(t, edited.EditedAt)
	assert.Nil(t, edited.DeletedAt)
}

func TestEdit_RejectsNonSender(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	original, err := repo.Insert(ctx, conversationID, testSenderID, "hello")
	require.NoError(t, err)

	_, err = repo.Edit(ctx, original.ID, testOtherSenderID, "not mine to edit")
	assert.ErrorIs(t, err, ErrNotSender)
}

func TestEdit_RejectsAlreadyDeletedMessage(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	original, err := repo.Insert(ctx, conversationID, testSenderID, "hello")
	require.NoError(t, err)
	_, err = repo.Delete(ctx, original.ID, testSenderID)
	require.NoError(t, err)

	_, err = repo.Edit(ctx, original.ID, testSenderID, "too late")
	assert.ErrorIs(t, err, ErrMessageNotFound)
}

func TestEdit_RejectsNonexistentMessage(t *testing.T) {
	repo, _ := newTestRepository(t)
	ctx := context.Background()

	_, err := repo.Edit(ctx, 999999999, testSenderID, "no such message")
	assert.ErrorIs(t, err, ErrMessageNotFound)
}

func TestDelete_ScrubsContentAndStampsDeletedAt(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	original, err := repo.Insert(ctx, conversationID, testSenderID, "sensitive content")
	require.NoError(t, err)

	deleted, err := repo.Delete(ctx, original.ID, testSenderID)
	require.NoError(t, err)

	assert.Equal(t, original.ID, deleted.ID)
	assert.Empty(t, deleted.Content, "deleted message content must be scrubbed, not just flagged")
	require.NotNil(t, deleted.DeletedAt)

	// The scrub is persisted, not just returned on this call — a fresh read
	// must also come back empty.
	page, err := repo.Page(ctx, conversationID, 0, 10)
	require.NoError(t, err)
	require.Len(t, page, 1)
	assert.Empty(t, page[0].Content)
	require.NotNil(t, page[0].DeletedAt)
}

func TestDelete_RejectsNonSender(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	original, err := repo.Insert(ctx, conversationID, testSenderID, "hello")
	require.NoError(t, err)

	_, err = repo.Delete(ctx, original.ID, testOtherSenderID)
	assert.ErrorIs(t, err, ErrNotSender)
}

func TestDelete_RejectsAlreadyDeletedMessage(t *testing.T) {
	repo, conversationID := newTestRepository(t)
	ctx := context.Background()

	original, err := repo.Insert(ctx, conversationID, testSenderID, "hello")
	require.NoError(t, err)
	_, err = repo.Delete(ctx, original.ID, testSenderID)
	require.NoError(t, err)

	_, err = repo.Delete(ctx, original.ID, testSenderID)
	assert.ErrorIs(t, err, ErrMessageNotFound, "deleting an already-deleted message is not idempotent success")
}

func TestDelete_RejectsNonexistentMessage(t *testing.T) {
	repo, _ := newTestRepository(t)
	ctx := context.Background()

	_, err := repo.Delete(ctx, 999999999, testSenderID)
	assert.ErrorIs(t, err, ErrMessageNotFound)
}
