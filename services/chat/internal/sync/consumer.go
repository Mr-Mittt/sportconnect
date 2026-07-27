package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// Consumer reads domain events the monolith publishes to StreamName and
// applies them to the local cache tables via CacheStore. Redis Streams (not
// plain Pub/Sub) is what gives this at-least-once delivery: entries persist
// (Redis AOF/RDB) and are only removed from the pending list once XAck'd, so
// a chat-service restart resumes from where it left off instead of silently
// missing whatever was published while it was down.
type Consumer struct {
	client     *redis.Client
	cache      *CacheStore
	consumerID string
	logger     *slog.Logger

	// stream/group default to the real StreamName/ConsumerGroup in
	// production (see NewConsumer) — configurable only so tests can point a
	// Consumer at a throwaway stream+group, fully isolated from a real
	// running instance's own traffic on the shared production stream (a new
	// entry on a stream is visible to every consumer group watching it, not
	// just one, so tests must never publish onto the real stream name).
	stream string
	group  string
}

func NewConsumer(client *redis.Client, cache *CacheStore, consumerID string, logger *slog.Logger) *Consumer {
	return &Consumer{
		client:     client,
		cache:      cache,
		consumerID: consumerID,
		logger:     logger,
		stream:     StreamName,
		group:      ConsumerGroup,
	}
}

// EnsureGroup creates the consumer group starting from the beginning of the
// stream ("0") if it doesn't already exist yet, and creates the stream
// itself (MKSTREAM) if the monolith hasn't published anything yet either.
func (c *Consumer) EnsureGroup(ctx context.Context) error {
	err := c.client.XGroupCreateMkStream(ctx, c.stream, c.group, "0").Err()
	if err != nil && !isBusyGroupErr(err) {
		return err
	}
	return nil
}

func isBusyGroupErr(err error) bool {
	return err != nil && err.Error() == "BUSYGROUP Consumer Group name already exists"
}

// Run blocks, reading new stream entries and dispatching each to the right
// cache upsert, until ctx is cancelled. An entry is only XAck'd after its
// handler succeeds — a failed handler leaves it pending for a retry (via
// reclaimPending on this same consumer identity's next restart; reclaiming a
// *different* stuck consumer's entries still needs a future XAUTOCLAIM
// sweep, not needed yet at single-instance scale) rather than silently
// dropping a missed update.
func (c *Consumer) Run(ctx context.Context) error {
	if err := c.EnsureGroup(ctx); err != nil {
		return fmt.Errorf("ensure consumer group: %w", err)
	}

	if err := c.reclaimPending(ctx); err != nil {
		return fmt.Errorf("reclaim pending entries: %w", err)
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		streams, err := c.client.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    c.group,
			Consumer: c.consumerID,
			Streams:  []string{c.stream, ">"},
			Count:    50,
			Block:    5 * time.Second,
		}).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) || errors.Is(err, context.Canceled) {
				continue
			}
			c.logger.Error("xreadgroup failed", "error", err)
			time.Sleep(time.Second)
			continue
		}

		for _, stream := range streams {
			for _, msg := range stream.Messages {
				c.processMessage(ctx, msg)
			}
		}
	}
}

// reclaimPending re-processes any entries already delivered to this
// consumer's own identity in a prior run that were never XAck'd (e.g. the
// process crashed mid-handler, or the handler failed transiently) —
// XREADGROUP's ">" ID only ever delivers a given entry to a group once, so
// without this a same-identity restart would leave those entries stuck
// forever instead of actually being "retried on restart" (see Run's doc
// comment). Reading with ID "0" returns exactly this consumer's own pending
// history, never a different consumer's. Deliberately a single pass, not a
// loop-to-empty: if a message can never succeed, looping would spin forever
// re-fetching the same still-pending entry. In the practically-unlikely case
// of more than one page of pending entries, the remainder waits for the next
// restart rather than being lost (they stay in the pending list either way).
func (c *Consumer) reclaimPending(ctx context.Context) error {
	streams, err := c.client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    c.group,
		Consumer: c.consumerID,
		Streams:  []string{c.stream, "0"},
		Count:    50,
	}).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil
		}
		return err
	}

	for _, stream := range streams {
		for _, msg := range stream.Messages {
			c.processMessage(ctx, msg)
		}
	}
	return nil
}

func (c *Consumer) processMessage(ctx context.Context, msg redis.XMessage) {
	if err := c.handle(ctx, msg); err != nil {
		c.logger.Error("failed to handle event", "message_id", msg.ID, "error", err)
		return
	}
	if err := c.client.XAck(ctx, c.stream, c.group, msg.ID).Err(); err != nil {
		c.logger.Error("failed to ack event", "message_id", msg.ID, "error", err)
		return
	}
	if err := c.cache.SetLastStreamID(ctx, c.stream, msg.ID); err != nil {
		c.logger.Error("failed to record stream offset", "message_id", msg.ID, "error", err)
	}
}

func (c *Consumer) handle(ctx context.Context, msg redis.XMessage) error {
	eventType, _ := msg.Values["event_type"].(string)
	payloadRaw, _ := msg.Values["payload"].(string)

	switch EventType(eventType) {
	case EventGroupMemberAdded:
		var p GroupMemberPayload
		if err := json.Unmarshal([]byte(payloadRaw), &p); err != nil {
			return err
		}
		return c.cache.UpsertGroupMember(ctx, p.GroupID, p.UserID, p.Role)

	case EventGroupMemberRemoved:
		var p GroupMemberPayload
		if err := json.Unmarshal([]byte(payloadRaw), &p); err != nil {
			return err
		}
		return c.cache.RemoveGroupMember(ctx, p.GroupID, p.UserID)

	case EventGroupDeleted:
		var p GroupDeletedPayload
		if err := json.Unmarshal([]byte(payloadRaw), &p); err != nil {
			return err
		}
		return c.cache.RemoveGroupMembersByGroup(ctx, p.GroupID)

	case EventFriendshipAccepted:
		var p FriendshipPayload
		if err := json.Unmarshal([]byte(payloadRaw), &p); err != nil {
			return err
		}
		return c.cache.UpsertFriendship(ctx, p.UserID, p.FriendID)

	case EventFriendshipRemoved:
		var p FriendshipPayload
		if err := json.Unmarshal([]byte(payloadRaw), &p); err != nil {
			return err
		}
		return c.cache.RemoveFriendship(ctx, p.UserID, p.FriendID)

	case EventUserProfileUpdated:
		var p UserProfilePayload
		if err := json.Unmarshal([]byte(payloadRaw), &p); err != nil {
			return err
		}
		return c.cache.UpsertUserProfile(ctx, UserProfile{
			UserID:    p.UserID,
			FullName:  p.FullName,
			Username:  p.Username,
			AvatarURL: p.AvatarURL,
		})

	default:
		c.logger.Warn("unknown event type, skipping", "event_type", eventType)
		return nil
	}
}
