package conversation

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

func newTestService(t *testing.T) (*Service, *sync.CacheStore) {
	t.Helper()
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)
	repo := NewRepository(tx)
	cache := sync.NewCacheStore(tx)
	return NewService(repo, cache), cache
}

func TestOpenGroup_MemberAndNonMember(t *testing.T) {
	svc, cache := newTestService(t)
	ctx := context.Background()
	const groupID int64 = 42002

	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, userA, "MEMBER"))

	conv, err := svc.OpenGroup(ctx, userA, groupID)
	require.NoError(t, err)
	assert.Equal(t, TypeGroup, conv.Type)

	_, err = svc.OpenGroup(ctx, userC, groupID)
	assert.True(t, errors.Is(err, ErrNotAMember), "a caller absent from group_members_cache must be rejected")
}

func TestOpenDirect_FriendsAndNonFriends(t *testing.T) {
	svc, cache := newTestService(t)
	ctx := context.Background()

	require.NoError(t, cache.UpsertFriendship(ctx, userA, userB))

	conv, err := svc.OpenDirect(ctx, userA, userB)
	require.NoError(t, err)
	assert.Equal(t, TypeDirect, conv.Type)

	_, err = svc.OpenDirect(ctx, userA, userC)
	assert.True(t, errors.Is(err, ErrNotFriends), "a caller with no friendships_cache row for the target must be rejected")
}

func TestAuthorizeByID_GroupOutcomes(t *testing.T) {
	svc, cache := newTestService(t)
	ctx := context.Background()
	const groupID int64 = 42003

	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, userA, "MEMBER"))
	conv, err := svc.OpenGroup(ctx, userA, groupID)
	require.NoError(t, err)

	authorized, err := svc.AuthorizeByID(ctx, conv.ID, userA)
	require.NoError(t, err)
	assert.Equal(t, conv.ID, authorized.ID)

	_, err = svc.AuthorizeByID(ctx, conv.ID, userC)
	assert.True(t, errors.Is(err, ErrNotAMember), "AuthorizeByID must re-check membership, not just trust the caller opened it once")
}

// TestAuthorizeByID_DirectOutcomes exercises the actual behavior of
// Service.Authorize for TypeDirect: it checks IsActiveParticipant against
// conversation_participants, not the friendships_cache (see Authorize's
// comment — a revoked friendship doesn't retroactively lock out someone's
// own conversation history). The friendship check only happens once, at
// OpenDirect (conversation-creation) time.
func TestAuthorizeByID_DirectOutcomes(t *testing.T) {
	svc, cache := newTestService(t)
	ctx := context.Background()

	require.NoError(t, cache.UpsertFriendship(ctx, userA, userB))
	conv, err := svc.OpenDirect(ctx, userA, userB)
	require.NoError(t, err)

	authorized, err := svc.AuthorizeByID(ctx, conv.ID, userA)
	require.NoError(t, err)
	assert.Equal(t, conv.ID, authorized.ID)

	_, err = svc.AuthorizeByID(ctx, conv.ID, userC)
	assert.True(t, errors.Is(err, ErrNotFriends), "a caller who was never a participant in this DIRECT conversation must be rejected")
}
