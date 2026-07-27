// Package sync is the anti-corruption layer between the Java monolith and
// this service: it consumes domain events the monolith publishes (Redis
// Streams) and runs the one-time cold-start bootstrap pull (HTTP, against new
// /internal/sync/** endpoints), maintaining chat's own local read cache of
// group membership, friendships, and user display info. Nothing outside this
// package writes to the cache tables — conversation/message authorization
// checks only ever read them (see internal/conversation, internal/message).
//
// This is deliberately not a chat *feature* — it's translation, same reason
// group/post are separate domains on the Java side rather than one grab-bag
// package.
package sync

import "time"

// StreamName is the single Redis Stream every monolith domain publishes to.
// One stream (not one per domain) is simpler to operate at this project's
// scale — ordering across domains was never a requirement here, only
// per-entity idempotency (upsert on primary key), which the envelope's
// EventID/OccurredAt support regardless of stream layout.
const StreamName = "sportconnect:domain-events"

// ConsumerGroup is this service's Redis Streams consumer group name.
const ConsumerGroup = "chat-service"

// EventType identifies the shape of an envelope's Payload.
type EventType string

const (
	EventGroupMemberAdded   EventType = "group.member_added"
	EventGroupMemberRemoved EventType = "group.member_removed"
	EventGroupDeleted       EventType = "group.deleted"
	EventFriendshipAccepted EventType = "friendship.accepted"
	EventFriendshipRemoved  EventType = "friendship.removed"
	EventUserProfileUpdated EventType = "user.profile_updated"
)

// Envelope is the JSON structure published to StreamName under the field
// "payload" of each XADD entry. SchemaVersion lives on the envelope, not per
// field, so a breaking payload change is a version bump the consumer
// switches on — no schema registry needed at this scale.
type Envelope struct {
	EventID       string    `json:"event_id"`
	EventType     EventType `json:"event_type"`
	SchemaVersion int       `json:"schema_version"`
	OccurredAt    time.Time `json:"occurred_at"`
	Payload       []byte    `json:"payload"`
}

// GroupMemberPayload backs group.member_added and group.member_removed.
type GroupMemberPayload struct {
	GroupID int64  `json:"group_id"`
	UserID  string `json:"user_id"`
	Role    string `json:"role,omitempty"`
}

// GroupDeletedPayload backs group.deleted.
type GroupDeletedPayload struct {
	GroupID int64 `json:"group_id"`
}

// FriendshipPayload backs friendship.accepted and friendship.removed.
type FriendshipPayload struct {
	UserID   string `json:"user_id"`
	FriendID string `json:"friend_id"`
}

// UserProfilePayload backs user.profile_updated. Published only when a
// displayable field (full name, username, avatar) actually changed — not on
// every profile save — see the Java-side publish site in UserServiceImpl.
type UserProfilePayload struct {
	UserID    string `json:"user_id"`
	FullName  string `json:"full_name"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
}

// Known gap, documented rather than silently missing: role changes
// (transferOwnership/updateMemberRole on the Java side) are not published.
// Chat authorization only ever needs "member or not" — role is stored in
// group_members_cache for future use but is not kept in sync yet. See
// docs/SYNC_DESIGN.md.
