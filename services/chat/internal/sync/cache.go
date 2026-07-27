package sync

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CacheStore is the only thing in this service allowed to write the
// group_members_cache / friendships_cache / user_profiles_cache / sync_state
// tables. Consumer (event-driven deltas) and Bootstrapper (cold-start pull)
// both write through it; internal/conversation and internal/message only
// ever read through it (see UserProfiles/IsGroupMember/AreFriends below).
type CacheStore struct {
	pool *pgxpool.Pool
}

func NewCacheStore(pool *pgxpool.Pool) *CacheStore {
	return &CacheStore{pool: pool}
}

// UserProfile is the display-name/avatar shape resolved server-side for chat
// messages — the client-supplied sender name is never trusted, per the rule
// carried over from the archived PubNub plan.
type UserProfile struct {
	UserID    string
	FullName  string
	Username  string
	AvatarURL string
}

func (c *CacheStore) UpsertGroupMember(ctx context.Context, groupID int64, userID, role string) error {
	_, err := c.pool.Exec(ctx, `
		INSERT INTO group_members_cache (group_id, user_id, role, synced_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (group_id, user_id) DO UPDATE SET role = $3, synced_at = now()
	`, groupID, userID, role)
	return err
}

func (c *CacheStore) RemoveGroupMember(ctx context.Context, groupID int64, userID string) error {
	_, err := c.pool.Exec(ctx, `
		DELETE FROM group_members_cache WHERE group_id = $1 AND user_id = $2
	`, groupID, userID)
	return err
}

func (c *CacheStore) RemoveGroupMembersByGroup(ctx context.Context, groupID int64) error {
	_, err := c.pool.Exec(ctx, `DELETE FROM group_members_cache WHERE group_id = $1`, groupID)
	return err
}

func (c *CacheStore) IsGroupMember(ctx context.Context, groupID int64, userID string) (bool, error) {
	var exists bool
	err := c.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM group_members_cache WHERE group_id = $1 AND user_id = $2)
	`, groupID, userID).Scan(&exists)
	return exists, err
}

// UpsertFriendship stores both directions of the pair, mirroring the two-row
// write Spring's own Friendship table does on accept.
func (c *CacheStore) UpsertFriendship(ctx context.Context, userID, friendID string) error {
	_, err := c.pool.Exec(ctx, `
		INSERT INTO friendships_cache (user_id, friend_id, synced_at) VALUES ($1, $2, now()), ($2, $1, now())
		ON CONFLICT (user_id, friend_id) DO UPDATE SET synced_at = now()
	`, userID, friendID)
	return err
}

func (c *CacheStore) RemoveFriendship(ctx context.Context, userID, friendID string) error {
	_, err := c.pool.Exec(ctx, `
		DELETE FROM friendships_cache
		WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
	`, userID, friendID)
	return err
}

func (c *CacheStore) AreFriends(ctx context.Context, userID, friendID string) (bool, error) {
	var exists bool
	err := c.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM friendships_cache WHERE user_id = $1 AND friend_id = $2)
	`, userID, friendID).Scan(&exists)
	return exists, err
}

func (c *CacheStore) UpsertUserProfile(ctx context.Context, p UserProfile) error {
	_, err := c.pool.Exec(ctx, `
		INSERT INTO user_profiles_cache (user_id, full_name, username, avatar_url, synced_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id) DO UPDATE SET
			full_name = $2, username = $3, avatar_url = $4, synced_at = now()
	`, p.UserID, p.FullName, p.Username, p.AvatarURL)
	return err
}

// UserProfiles batch-resolves display info for a page of distinct sender
// IDs in one query — the same N+1 discipline CLAUDE.md requires Java-side,
// applied here.
func (c *CacheStore) UserProfiles(ctx context.Context, userIDs []string) (map[string]UserProfile, error) {
	rows, err := c.pool.Query(ctx, `
		SELECT user_id, full_name, username, avatar_url
		FROM user_profiles_cache
		WHERE user_id = ANY($1::uuid[])
	`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]UserProfile, len(userIDs))
	for rows.Next() {
		var p UserProfile
		if err := rows.Scan(&p.UserID, &p.FullName, &p.Username, &p.AvatarURL); err != nil {
			return nil, err
		}
		result[p.UserID] = p
	}
	return result, rows.Err()
}

// LastStreamID returns the last Redis Stream entry ID this service acked for
// the given stream, or "" if it has never consumed from it (first boot).
func (c *CacheStore) LastStreamID(ctx context.Context, stream string) (string, error) {
	var lastID string
	err := c.pool.QueryRow(ctx, `SELECT last_id FROM sync_state WHERE stream = $1`, stream).Scan(&lastID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return lastID, nil
}

func (c *CacheStore) SetLastStreamID(ctx context.Context, stream, id string) error {
	_, err := c.pool.Exec(ctx, `
		INSERT INTO sync_state (stream, last_id) VALUES ($1, $2)
		ON CONFLICT (stream) DO UPDATE SET last_id = $2
	`, stream, id)
	return err
}
