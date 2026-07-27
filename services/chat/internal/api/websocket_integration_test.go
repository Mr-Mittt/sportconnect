package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/conversation"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/message"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/ws"
)

const wsUserID = "88888888-8888-8888-8888-888888888888"

// registrationSettleDelay gives the server's connectWebSocket handler time to
// call Hub.Join after a client's Dial returns — Dial unblocks as soon as the
// HTTP upgrade response arrives, which can happen a moment before the
// server-side handler goroutine reaches Join. A real production caller (a
// browser tab) has no such race with itself, but a test that dials and
// immediately sends needs this small margin to be reliable.
const registrationSettleDelay = 200 * time.Millisecond

func mintTestToken(t *testing.T, secret, subject string) string {
	t.Helper()
	claims := auth.Claims{
		Username: "wstestuser",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subject,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

func newTestRouterServer(t *testing.T) (*httptest.Server, string, *sync.CacheStore) {
	t.Helper()
	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)

	secret := os.Getenv("JWT_SECRET")
	require.NotEmpty(t, secret, "JWT_SECRET must be set (see services/chat/.env)")

	cache := sync.NewCacheStore(tx)
	convService := conversation.NewService(conversation.NewRepository(tx), cache)
	msgService := message.NewService(message.NewRepository(tx), cache)

	router := NewRouter(Dependencies{
		Verifier:      auth.NewVerifier(secret),
		Conversations: convService,
		Messages:      msgService,
		Hub:           ws.NewHub(),
		AllowedOrigin: "http://localhost:5173",
		Logger:        slog.New(slog.NewTextHandler(os.Stderr, nil)),
	})

	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	return server, secret, cache
}

func openGroupConversation(t *testing.T, baseURL, authHeader string, groupID int64) int64 {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/conversations/open/group/%d", baseURL, groupID), nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", authHeader)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body conversationBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	return body.ID
}

func sendTestMessage(t *testing.T, baseURL, authHeader string, conversationID int64, content string) {
	t.Helper()
	payload, err := json.Marshal(map[string]string{"content": content})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/conversations/%d/messages", baseURL, conversationID), bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
}

func dialWS(t *testing.T, wsBaseURL, authHeader string, conversationID int64) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.Dial(
		context.Background(),
		fmt.Sprintf("%s/conversations/%d/ws", wsBaseURL, conversationID),
		&websocket.DialOptions{HTTPHeader: http.Header{"Authorization": []string{authHeader}}},
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close(websocket.StatusNormalClosure, "") })
	return conn
}

func readWSMessage(t *testing.T, conn *websocket.Conn, timeout time.Duration) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	_, data, err := conn.Read(ctx)
	require.NoError(t, err, "expected a websocket message within %s", timeout)

	var body map[string]any
	require.NoError(t, json.Unmarshal(data, &body))
	return body
}

func assertNoWSMessage(t *testing.T, conn *websocket.Conn, wait time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), wait)
	defer cancel()

	_, _, err := conn.Read(ctx)
	assert.Error(t, err, "expected no websocket message to arrive on an unrelated conversation")
}

// TestWebSocketBroadcast_DeliversToSameConversationOnly is CHAT-6's
// genuinely new piece of test infrastructure: a real router served over a
// real HTTP test server, real WebSocket clients dialing back into it, and a
// real REST send triggering the broadcast — proving internal/ws.Hub actually
// fans a message out to every other connection on the same conversation,
// and never to a different one.
func TestWebSocketBroadcast_DeliversToSameConversationOnly(t *testing.T) {
	server, secret, cache := newTestRouterServer(t)
	ctx := context.Background()

	const groupAID int64 = 91001
	const groupBID int64 = 91002

	require.NoError(t, cache.UpsertGroupMember(ctx, groupAID, wsUserID, "MEMBER"))
	require.NoError(t, cache.UpsertGroupMember(ctx, groupBID, wsUserID, "MEMBER"))

	authHeader := "Bearer " + mintTestToken(t, secret, wsUserID)

	convAID := openGroupConversation(t, server.URL, authHeader, groupAID)
	convBID := openGroupConversation(t, server.URL, authHeader, groupBID)

	wsBaseURL := "ws" + strings.TrimPrefix(server.URL, "http")

	connA1 := dialWS(t, wsBaseURL, authHeader, convAID)
	connA2 := dialWS(t, wsBaseURL, authHeader, convAID)
	connB := dialWS(t, wsBaseURL, authHeader, convBID)

	time.Sleep(registrationSettleDelay)

	sendTestMessage(t, server.URL, authHeader, convAID, "hello from A")

	msg1 := readWSMessage(t, connA1, 3*time.Second)
	msg2 := readWSMessage(t, connA2, 3*time.Second)
	assert.Equal(t, "hello from A", msg1["content"])
	assert.Equal(t, "hello from A", msg2["content"])

	assertNoWSMessage(t, connB, 500*time.Millisecond)
}
