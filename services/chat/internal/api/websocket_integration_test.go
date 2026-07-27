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

func sendTestMessage(t *testing.T, baseURL, authHeader string, conversationID int64, content string) int64 {
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

	var body messageBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	return body.ID
}

func editTestMessage(t *testing.T, baseURL, authHeader string, conversationID, messageID int64, content string) {
	t.Helper()
	payload, err := json.Marshal(map[string]string{"content": content})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPatch, fmt.Sprintf("%s/conversations/%d/messages/%d", baseURL, conversationID, messageID), bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func deleteTestMessage(t *testing.T, baseURL, authHeader string, conversationID, messageID int64) {
	t.Helper()
	req, err := http.NewRequest(http.MethodDelete, fmt.Sprintf("%s/conversations/%d/messages/%d", baseURL, conversationID, messageID), nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", authHeader)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
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

// wsMessageField reaches into a decoded wsEvent's nested "message" object —
// CHAT-13 wrapped every broadcast in {type, message}, so tests that only
// care about a field on the message itself go through this instead of
// repeating the type assertion at every call site.
func wsMessageField(t *testing.T, event map[string]any, field string) any {
	t.Helper()
	msg, ok := event["message"].(map[string]any)
	require.True(t, ok, "expected event to have a \"message\" object, got: %#v", event)
	return msg[field]
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
	assert.Equal(t, wsEventMessageCreated, msg1["type"])
	assert.Equal(t, "hello from A", wsMessageField(t, msg1, "content"))
	assert.Equal(t, wsEventMessageCreated, msg2["type"])
	assert.Equal(t, "hello from A", wsMessageField(t, msg2, "content"))

	assertNoWSMessage(t, connB, 500*time.Millisecond)
}

// TestWebSocketBroadcast_EditAndDeleteMessage is CHAT-13's equivalent of the
// test above — proving an edit/delete's broadcast reaches a second
// connection with the {type, message} envelope, not just that sending a new
// message does.
func TestWebSocketBroadcast_EditAndDeleteMessage(t *testing.T) {
	server, secret, cache := newTestRouterServer(t)
	ctx := context.Background()

	const groupID int64 = 91003

	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, wsUserID, "MEMBER"))
	authHeader := "Bearer " + mintTestToken(t, secret, wsUserID)

	convID := openGroupConversation(t, server.URL, authHeader, groupID)
	wsBaseURL := "ws" + strings.TrimPrefix(server.URL, "http")

	sender := dialWS(t, wsBaseURL, authHeader, convID)
	receiver := dialWS(t, wsBaseURL, authHeader, convID)
	time.Sleep(registrationSettleDelay)

	messageID := sendTestMessage(t, server.URL, authHeader, convID, "original content")
	readWSMessage(t, sender, 3*time.Second)
	readWSMessage(t, receiver, 3*time.Second)

	editTestMessage(t, server.URL, authHeader, convID, messageID, "edited content")
	editEventSender := readWSMessage(t, sender, 3*time.Second)
	editEventReceiver := readWSMessage(t, receiver, 3*time.Second)
	assert.Equal(t, wsEventMessageEdited, editEventSender["type"])
	assert.Equal(t, "edited content", wsMessageField(t, editEventSender, "content"))
	assert.NotNil(t, wsMessageField(t, editEventSender, "editedAt"))
	assert.Equal(t, wsEventMessageEdited, editEventReceiver["type"])
	assert.Equal(t, "edited content", wsMessageField(t, editEventReceiver, "content"))

	deleteTestMessage(t, server.URL, authHeader, convID, messageID)
	deleteEventSender := readWSMessage(t, sender, 3*time.Second)
	deleteEventReceiver := readWSMessage(t, receiver, 3*time.Second)
	assert.Equal(t, wsEventMessageDeleted, deleteEventSender["type"])
	assert.Empty(t, wsMessageField(t, deleteEventSender, "content"), "deleted content must be scrubbed on the wire too")
	assert.NotNil(t, wsMessageField(t, deleteEventSender, "deletedAt"))
	assert.Equal(t, wsEventMessageDeleted, deleteEventReceiver["type"])
}

// TestEditDeleteMessage_HTTPStatusCodes proves internal/api/respond.go's
// error mapping actually reaches the wire as the right status — the
// repository-level tests (internal/message) already prove ErrNotSender/
// ErrMessageNotFound are returned; this is the one place that mapping to
// 403/404 is exercised end to end. No WebSocket needed for this one.
func TestEditDeleteMessage_HTTPStatusCodes(t *testing.T) {
	server, secret, cache := newTestRouterServer(t)
	ctx := context.Background()

	const groupID int64 = 91004
	const otherUserID = "99999999-9999-9999-9999-999999999999"

	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, wsUserID, "MEMBER"))
	require.NoError(t, cache.UpsertGroupMember(ctx, groupID, otherUserID, "MEMBER"))

	authHeader := "Bearer " + mintTestToken(t, secret, wsUserID)
	otherAuthHeader := "Bearer " + mintTestToken(t, secret, otherUserID)

	convID := openGroupConversation(t, server.URL, authHeader, groupID)
	messageID := sendTestMessage(t, server.URL, authHeader, convID, "mine")

	doRequest := func(method, path, authHeader, content string) int {
		var bodyReader *bytes.Reader
		if content != "" {
			payload, err := json.Marshal(map[string]string{"content": content})
			require.NoError(t, err)
			bodyReader = bytes.NewReader(payload)
		} else {
			bodyReader = bytes.NewReader(nil)
		}
		req, err := http.NewRequest(method, server.URL+path, bodyReader)
		require.NoError(t, err)
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		return resp.StatusCode
	}

	editPath := fmt.Sprintf("/conversations/%d/messages/%d", convID, messageID)
	deletePath := editPath
	nonexistentPath := fmt.Sprintf("/conversations/%d/messages/999999999", convID)

	assert.Equal(t, http.StatusForbidden, doRequest(http.MethodPatch, editPath, otherAuthHeader, "not mine"))
	assert.Equal(t, http.StatusForbidden, doRequest(http.MethodDelete, deletePath, otherAuthHeader, ""))
	assert.Equal(t, http.StatusNotFound, doRequest(http.MethodPatch, nonexistentPath, authHeader, "no such message"))
	assert.Equal(t, http.StatusNotFound, doRequest(http.MethodDelete, nonexistentPath, authHeader, ""))
	assert.Equal(t, http.StatusOK, doRequest(http.MethodPatch, editPath, authHeader, "actually mine"))
	assert.Equal(t, http.StatusOK, doRequest(http.MethodDelete, deletePath, authHeader, ""))
}
