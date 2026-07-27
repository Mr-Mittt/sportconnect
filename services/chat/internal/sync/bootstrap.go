package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// Bootstrapper performs the one-time cold-start pull against the monolith's
// /internal/sync/** endpoints, described in docs/SYNC_DESIGN.md. A Redis
// Stream alone can't seed state for groups/friendships/users that existed
// before this service ever ran — this fills that gap. It only needs to run
// once per fresh database: after the first successful run, the consumer
// group's own acked offset (CacheStore.LastStreamID) is enough to stay
// current, even across restarts, since Streams persist their backlog.
type Bootstrapper struct {
	httpClient *http.Client
	baseURL    string
	secret     string
	cache      *CacheStore
}

func NewBootstrapper(baseURL, secret string, cache *CacheStore) *Bootstrapper {
	return &Bootstrapper{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    baseURL,
		secret:     secret,
		cache:      cache,
	}
}

type groupMemberRow struct {
	GroupID int64  `json:"group_id"`
	UserID  string `json:"user_id"`
	Role    string `json:"role"`
}

type friendshipRow struct {
	UserID   string `json:"user_id"`
	FriendID string `json:"friend_id"`
}

type userRow struct {
	UserID    string `json:"user_id"`
	FullName  string `json:"full_name"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
}

type page[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"next_cursor"`
}

// Run pulls every page of every internal sync endpoint and upserts each row
// into the matching cache table.
func (b *Bootstrapper) Run(ctx context.Context) error {
	if err := b.pullGroupMembers(ctx); err != nil {
		return fmt.Errorf("bootstrap group members: %w", err)
	}
	if err := b.pullFriendships(ctx); err != nil {
		return fmt.Errorf("bootstrap friendships: %w", err)
	}
	if err := b.pullUsers(ctx); err != nil {
		return fmt.Errorf("bootstrap users: %w", err)
	}
	return nil
}

func (b *Bootstrapper) pullGroupMembers(ctx context.Context) error {
	cursor := ""
	for {
		items, next, err := fetchPage[groupMemberRow](ctx, b, "/internal/sync/group-members", cursor)
		if err != nil {
			return err
		}
		for _, row := range items {
			if err := b.cache.UpsertGroupMember(ctx, row.GroupID, row.UserID, row.Role); err != nil {
				return err
			}
		}
		if next == "" {
			return nil
		}
		cursor = next
	}
}

func (b *Bootstrapper) pullFriendships(ctx context.Context) error {
	cursor := ""
	for {
		items, next, err := fetchPage[friendshipRow](ctx, b, "/internal/sync/friendships", cursor)
		if err != nil {
			return err
		}
		for _, row := range items {
			if err := b.cache.UpsertFriendship(ctx, row.UserID, row.FriendID); err != nil {
				return err
			}
		}
		if next == "" {
			return nil
		}
		cursor = next
	}
}

func (b *Bootstrapper) pullUsers(ctx context.Context) error {
	cursor := ""
	for {
		items, next, err := fetchPage[userRow](ctx, b, "/internal/sync/users", cursor)
		if err != nil {
			return err
		}
		for _, row := range items {
			err := b.cache.UpsertUserProfile(ctx, UserProfile{
				UserID:    row.UserID,
				FullName:  row.FullName,
				Username:  row.Username,
				AvatarURL: row.AvatarURL,
			})
			if err != nil {
				return err
			}
		}
		if next == "" {
			return nil
		}
		cursor = next
	}
}

// fetchPage is a standalone generic function, not a method — Go methods
// cannot carry their own type parameters, only the enclosing type's.
func fetchPage[T any](ctx context.Context, b *Bootstrapper, path, cursor string) ([]T, string, error) {
	query := url.Values{}
	query.Set("cursor", cursor)
	query.Set("limit", "500")

	reqURL := b.baseURL + path + "?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("X-Internal-Service-Secret", b.secret)

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("unexpected status %d from %s", resp.StatusCode, path)
	}

	var body page[T]
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, "", err
	}
	return body.Items, body.NextCursor, nil
}
