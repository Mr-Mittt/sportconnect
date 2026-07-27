package sync

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

const (
	cacheUserA = "66666666-6666-6666-6666-666666666666"
	cacheUserB = "77777777-7777-7777-7777-777777777777"
)

func newTestCacheStore(t *testing.T) *CacheStore {
	t.Helper()
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)
	return NewCacheStore(tx)
}

func TestUpsertGroupMember_UpdatesRoleNotDuplicate(t *testing.T) {
	cache := newTestCacheStore(t)
	ctx := context.Background()
	const groupID int64 = 61001

	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, cacheUserA, "MEMBER"))
	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, cacheUserA, "ADMIN"))

	var count int
	var role string
	err := cache.pool.QueryRow(ctx, `SELECT count(*), max(role) FROM group_members_cache WHERE group_id = $1 AND user_id = $2`, groupID, cacheUserA).Scan(&count, &role)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "a second upsert for the same (group, user) must update, not insert a duplicate row")
	assert.Equal(t, "ADMIN", role)

	isMember, err := cache.IsGroupMember(ctx, groupID, cacheUserA)
	require.NoError(t, err)
	assert.True(t, isMember)
}

func TestRemoveGroupMember_And_RemoveGroupMembersByGroup(t *testing.T) {
	cache := newTestCacheStore(t)
	ctx := context.Background()
	const groupID int64 = 61002
	const otherGroupID int64 = 61003

	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, cacheUserA, "MEMBER"))
	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, cacheUserB, "MEMBER"))
	require.NoError(t, cache.UpsertGroupMember(ctx, otherGroupID, cacheUserA, "MEMBER"))

	require.NoError(t, cache.RemoveGroupMember(ctx, groupID, cacheUserA))
	isMemberA, err := cache.IsGroupMember(ctx, groupID, cacheUserA)
	require.NoError(t, err)
	assert.False(t, isMemberA)

	isMemberB, err := cache.IsGroupMember(ctx, groupID, cacheUserB)
	require.NoError(t, err)
	assert.True(t, isMemberB, "removing one member must not affect another member of the same group")

	require.NoError(t, cache.RemoveGroupMembersByGroup(ctx, groupID))
	isMemberBAfter, err := cache.IsGroupMember(ctx, groupID, cacheUserB)
	require.NoError(t, err)
	assert.False(t, isMemberBAfter, "RemoveGroupMembersByGroup must clear every remaining member of that group")

	isMemberOtherGroup, err := cache.IsGroupMember(ctx, otherGroupID, cacheUserA)
	require.NoError(t, err)
	assert.True(t, isMemberOtherGroup, "a bulk removal scoped to one group must not touch a different group's members")
}

func TestUpsertFriendship_And_RemoveFriendship_BothDirections(t *testing.T) {
	cache := newTestCacheStore(t)
	ctx := context.Background()

	require.NoError(t, cache.UpsertFriendship(ctx, cacheUserA, cacheUserB))

	aToB, err := cache.AreFriends(ctx, cacheUserA, cacheUserB)
	require.NoError(t, err)
	assert.True(t, aToB)

	bToA, err := cache.AreFriends(ctx, cacheUserB, cacheUserA)
	require.NoError(t, err)
	assert.True(t, bToA, "UpsertFriendship must write both directions")

	require.NoError(t, cache.RemoveFriendship(ctx, cacheUserA, cacheUserB))

	aToBAfter, err := cache.AreFriends(ctx, cacheUserA, cacheUserB)
	require.NoError(t, err)
	assert.False(t, aToBAfter)

	bToAAfter, err := cache.AreFriends(ctx, cacheUserB, cacheUserA)
	require.NoError(t, err)
	assert.False(t, bToAAfter, "RemoveFriendship must clear both directions")
}

func TestUpsertUserProfile_UpdatesNotDuplicates(t *testing.T) {
	cache := newTestCacheStore(t)
	ctx := context.Background()

	require.NoError(t, cache.UpsertUserProfile(ctx, UserProfile{
		UserID:    cacheUserA,
		FullName:  "Original Name",
		Username:  "original",
		AvatarURL: "https://example.com/old.jpg",
	}))
	require.NoError(t, cache.UpsertUserProfile(ctx, UserProfile{
		UserID:    cacheUserA,
		FullName:  "Updated Name",
		Username:  "updated",
		AvatarURL: "https://example.com/new.jpg",
	}))

	var count int
	err := cache.pool.QueryRow(ctx, `SELECT count(*) FROM user_profiles_cache WHERE user_id = $1`, cacheUserA).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "a second upsert for the same user_id must update, not insert a duplicate row")

	profiles, err := cache.UserProfiles(ctx, []string{cacheUserA})
	require.NoError(t, err)
	require.Contains(t, profiles, cacheUserA)
	assert.Equal(t, "Updated Name", profiles[cacheUserA].FullName)
	assert.Equal(t, "https://example.com/new.jpg", profiles[cacheUserA].AvatarURL)
}

func TestLastStreamID_SetAndGet(t *testing.T) {
	cache := newTestCacheStore(t)
	ctx := context.Background()
	const stream = "sportconnect:domain-events"

	emptyID, err := cache.LastStreamID(ctx, "stream-never-seen-before")
	require.NoError(t, err)
	assert.Equal(t, "", emptyID, "a stream with no prior sync_state row must return an empty ID, not an error")

	require.NoError(t, cache.SetLastStreamID(ctx, stream, "1234-0"))
	gotID, err := cache.LastStreamID(ctx, stream)
	require.NoError(t, err)
	assert.Equal(t, "1234-0", gotID)

	require.NoError(t, cache.SetLastStreamID(ctx, stream, "5678-0"))
	updatedID, err := cache.LastStreamID(ctx, stream)
	require.NoError(t, err)
	assert.Equal(t, "5678-0", updatedID, "SetLastStreamID must update the existing row, not insert a second one")
}
