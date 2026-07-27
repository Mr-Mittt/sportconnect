package sync

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

// newTestConsumer builds a Consumer pointed at a throwaway stream+group,
// unique to this test — never the real StreamName/ConsumerGroup. A new
// stream entry is visible to every consumer group watching that stream, not
// just the one that reads it, so publishing test junk onto the real shared
// stream would leak into any live-running chat service instance's own
// "chat-service" group and its real cache tables.
func newTestConsumer(t *testing.T, client *redis.Client, cache *CacheStore, consumerID string) *Consumer {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	c := NewConsumer(client, cache, consumerID, logger)
	c.stream = fmt.Sprintf("test:%s:%d", t.Name(), time.Now().UnixNano())
	c.group = "test-group"

	t.Cleanup(func() {
		_ = client.Del(context.Background(), c.stream).Err()
	})

	require.NoError(t, c.EnsureGroup(context.Background()))
	return c
}

func TestConsumer_MalformedEventSkippedWithoutAckingOrCrashing(t *testing.T) {
	client := testdb.RequireRedisClient(t)
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)
	cache := NewCacheStore(tx)
	ctx := context.Background()

	consumer := newTestConsumer(t, client, cache, "test-consumer-malformed")

	// Malformed: a recognized event type with a payload that isn't valid
	// JSON for GroupMemberPayload — this must decode-fail, not crash, and
	// must not be acked.
	malformedID, err := client.XAdd(ctx, &redis.XAddArgs{
		Stream: consumer.stream,
		Values: map[string]any{"event_type": string(EventGroupMemberAdded), "payload": "{not valid json"},
	}).Result()
	require.NoError(t, err)

	// A well-formed event published right after it — must still be
	// processed, proving the malformed entry didn't wedge the loop.
	wellFormedPayload := `{"group_id":93001,"user_id":"11111111-1111-1111-1111-111111111111","role":"MEMBER"}`
	wellFormedID, err := client.XAdd(ctx, &redis.XAddArgs{
		Stream: consumer.stream,
		Values: map[string]any{"event_type": string(EventGroupMemberAdded), "payload": wellFormedPayload},
	}).Result()
	require.NoError(t, err)

	streams, err := client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    consumer.group,
		Consumer: consumer.consumerID,
		Streams:  []string{consumer.stream, ">"},
		Count:    10,
	}).Result()
	require.NoError(t, err)
	require.Len(t, streams, 1)
	require.Len(t, streams[0].Messages, 2)

	for _, msg := range streams[0].Messages {
		consumer.processMessage(ctx, msg)
	}

	// The well-formed event's effect actually happened.
	isMember, err := cache.IsGroupMember(ctx, 93001, "11111111-1111-1111-1111-111111111111")
	require.NoError(t, err)
	assert.True(t, isMember, "the well-formed event after the malformed one must still be processed")

	pending, err := client.XPending(ctx, consumer.stream, consumer.group).Result()
	require.NoError(t, err)
	assert.Equal(t, int64(1), pending.Count, "exactly the malformed entry must remain pending (never acked)")

	pendingDetail, err := client.XPendingExt(ctx, &redis.XPendingExtArgs{
		Stream: consumer.stream,
		Group:  consumer.group,
		Start:  "-",
		End:    "+",
		Count:  10,
	}).Result()
	require.NoError(t, err)
	require.Len(t, pendingDetail, 1)
	assert.Equal(t, malformedID, pendingDetail[0].ID)
	assert.NotEqual(t, wellFormedID, pendingDetail[0].ID)
}

// TestConsumer_ReclaimsOwnPendingEntryOnRestart proves the fix this ticket
// added: a "restart" (a fresh Consumer object, same consumerID) reclaims and
// re-processes an entry that a prior run of the same identity received but
// never acked — simulated here via a raw XReadGroup ">" call that delivers
// the entry into that consumer's pending list without ever calling
// processMessage, standing in for "the process crashed between delivery and
// ack." Before CHAT-6 this would never be redelivered, since Run always read
// with ">", which never re-delivers an already-delivered entry to anyone.
func TestConsumer_ReclaimsOwnPendingEntryOnRestart(t *testing.T) {
	client := testdb.RequireRedisClient(t)
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)
	cache := NewCacheStore(tx)
	ctx := context.Background()

	const consumerID = "test-consumer-restart"
	firstRun := newTestConsumer(t, client, cache, consumerID)

	payload := `{"group_id":93002,"user_id":"22222222-2222-2222-2222-222222222222","role":"MEMBER"}`
	_, err := client.XAdd(ctx, &redis.XAddArgs{
		Stream: firstRun.stream,
		Values: map[string]any{"event_type": string(EventGroupMemberAdded), "payload": payload},
	}).Result()
	require.NoError(t, err)

	// Deliver it to this consumer identity's pending list without
	// processing/acking — simulates a crash between delivery and ack.
	delivered, err := client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    firstRun.group,
		Consumer: consumerID,
		Streams:  []string{firstRun.stream, ">"},
		Count:    10,
	}).Result()
	require.NoError(t, err)
	require.Len(t, delivered, 1)
	require.Len(t, delivered[0].Messages, 1)

	// Confirm the cache side-effect has NOT happened yet — it was delivered,
	// not processed.
	isMemberBefore, err := cache.IsGroupMember(ctx, 93002, "22222222-2222-2222-2222-222222222222")
	require.NoError(t, err)
	assert.False(t, isMemberBefore)

	// "Restart": a brand-new Consumer object, same consumerID, same
	// stream/group. Its reclaimPending step (called at the top of Run, and
	// invoked directly here to keep the test synchronous) must pick up the
	// never-acked entry.
	restarted := NewConsumer(client, cache, consumerID, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	restarted.stream = firstRun.stream
	restarted.group = firstRun.group

	require.NoError(t, restarted.reclaimPending(ctx))

	isMemberAfter, err := cache.IsGroupMember(ctx, 93002, "22222222-2222-2222-2222-222222222222")
	require.NoError(t, err)
	assert.True(t, isMemberAfter, "a restart must reclaim and process its own never-acked entry")

	pending, err := client.XPending(ctx, firstRun.stream, firstRun.group).Result()
	require.NoError(t, err)
	assert.Equal(t, int64(0), pending.Count, "the reclaimed entry must be acked, not left pending again")
}
