package conversation

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

// Fixed test UUIDs, same style as conversation_test.go's dmKey test — no
// uuid-generation dependency needed for literals this repo already treats as
// opaque strings.
const (
	userA = "11111111-1111-1111-1111-111111111111"
	userB = "22222222-2222-2222-2222-222222222222"
	userC = "33333333-3333-3333-3333-333333333333"
)

func newTestRepository(t *testing.T) *Repository {
	t.Helper()
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)
	return NewRepository(tx)
}

func TestGetOrCreateGroupConversation_Idempotent(t *testing.T) {
	repo := newTestRepository(t)
	ctx := context.Background()
	const groupID int64 = 42001

	first, err := repo.GetOrCreateGroupConversation(ctx, groupID)
	require.NoError(t, err)
	assert.Equal(t, TypeGroup, first.Type)
	assert.Equal(t, groupID, first.ExternalGroupID)

	second, err := repo.GetOrCreateGroupConversation(ctx, groupID)
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID, "second call must return the same conversation, not create a duplicate")

	var count int
	err = repo.pool.QueryRow(ctx, `SELECT count(*) FROM conversations WHERE type = 'GROUP' AND external_group_id = $1`, groupID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "exactly one row must exist for this group, regardless of how many times it was opened")
}

func TestGetOrCreateDirectConversation_Idempotent(t *testing.T) {
	repo := newTestRepository(t)
	ctx := context.Background()

	first, err := repo.GetOrCreateDirectConversation(ctx, userA, userB)
	require.NoError(t, err)
	assert.Equal(t, TypeDirect, first.Type)

	second, err := repo.GetOrCreateDirectConversation(ctx, userA, userB)
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID, "calling again with the same pair must return the same conversation")

	// Argument order must not matter — dmKey normalizes it.
	swapped, err := repo.GetOrCreateDirectConversation(ctx, userB, userA)
	require.NoError(t, err)
	assert.Equal(t, first.ID, swapped.ID, "swapped argument order must resolve to the same conversation")

	var convCount int
	err = repo.pool.QueryRow(ctx, `SELECT count(*) FROM conversations WHERE type = 'DIRECT' AND dm_key = $1`, dmKey(userA, userB)).Scan(&convCount)
	require.NoError(t, err)
	assert.Equal(t, 1, convCount, "exactly one DIRECT conversation row must exist for this pair")

	var participantCount int
	err = repo.pool.QueryRow(ctx, `SELECT count(*) FROM conversation_participants WHERE conversation_id = $1`, first.ID).Scan(&participantCount)
	require.NoError(t, err)
	assert.Equal(t, 2, participantCount, "exactly 2 participant rows must exist, not 4 or 6 from the repeated calls")
}

func TestIsActiveParticipant(t *testing.T) {
	repo := newTestRepository(t)
	ctx := context.Background()

	conv, err := repo.GetOrCreateDirectConversation(ctx, userA, userB)
	require.NoError(t, err)

	// userA and userB are active participants from GetOrCreateDirectConversation.
	activeA, err := repo.IsActiveParticipant(ctx, conv.ID, userA)
	require.NoError(t, err)
	assert.True(t, activeA)

	// A user who was never a participant at all.
	strangerActive, err := repo.IsActiveParticipant(ctx, conv.ID, userC)
	require.NoError(t, err)
	assert.False(t, strangerActive)

	// A participant who has since left (left_at set) is no longer active.
	_, err = repo.pool.Exec(ctx, `UPDATE conversation_participants SET left_at = now() WHERE conversation_id = $1 AND user_id = $2`, conv.ID, userB)
	require.NoError(t, err)

	leftActive, err := repo.IsActiveParticipant(ctx, conv.ID, userB)
	require.NoError(t, err)
	assert.False(t, leftActive, "a participant with left_at set must not read as active")

	// userA is unaffected by userB leaving.
	stillActiveA, err := repo.IsActiveParticipant(ctx, conv.ID, userA)
	require.NoError(t, err)
	assert.True(t, stillActiveA)
}
