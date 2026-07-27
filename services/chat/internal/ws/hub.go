// Package ws is pure transport — a WebSocket connection registry and
// per-conversation fan-out. It has no persistence or authorization logic of
// its own; the API layer authorizes a connection (via internal/conversation)
// before ever handing it to Join, and persists a message (via
// internal/message) before ever calling Broadcast.
package ws

import (
	"context"
	"net/http"
	"sync"

	"github.com/coder/websocket"
)

// Hub tracks which connections are currently subscribed to which
// conversation and fans a payload out to all of them.
type Hub struct {
	mu    sync.RWMutex
	rooms map[int64]map[*Client]bool
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[int64]map[*Client]bool)}
}

// Client wraps one accepted connection, subscribed to exactly one
// conversation at a time (one browser tab's Chat view, in practice).
type Client struct {
	conn           *websocket.Conn
	conversationID int64
	send           chan []byte
}

// Accept upgrades an HTTP request to a WebSocket connection. allowedOrigin
// mirrors the CORS origin this service's HTTP handlers already enforce
// (services/chat's own config, not Spring's — the client talks to this
// service directly, per the routing decision in the structural plan).
func Accept(w http.ResponseWriter, r *http.Request, allowedOrigin string) (*websocket.Conn, error) {
	return websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{allowedOrigin},
	})
}

// Join registers a connection as subscribed to conversationID and returns
// the Client handle used to broadcast to / unregister it.
func (h *Hub) Join(conversationID int64, conn *websocket.Conn) *Client {
	c := &Client{conn: conn, conversationID: conversationID, send: make(chan []byte, 16)}

	h.mu.Lock()
	if h.rooms[conversationID] == nil {
		h.rooms[conversationID] = make(map[*Client]bool)
	}
	h.rooms[conversationID][c] = true
	h.mu.Unlock()

	return c
}

// Leave unregisters a connection and closes its send channel, ending its
// WriteLoop.
func (h *Hub) Leave(c *Client) {
	h.mu.Lock()
	delete(h.rooms[c.conversationID], c)
	if len(h.rooms[c.conversationID]) == 0 {
		delete(h.rooms, c.conversationID)
	}
	h.mu.Unlock()
	close(c.send)
}

// Broadcast fans a payload out to every client currently subscribed to
// conversationID. Non-blocking on purpose: a slow/stuck client's buffered
// channel filling up drops that message for that one client rather than
// stalling every sender on the slowest reader.
func (h *Hub) Broadcast(conversationID int64, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[conversationID] {
		select {
		case c.send <- payload:
		default:
		}
	}
}

// WriteLoop drains the client's send channel to its WebSocket connection
// until the channel is closed (via Leave) or a write fails.
func (c *Client) WriteLoop(ctx context.Context) {
	for payload := range c.send {
		if err := c.conn.Write(ctx, websocket.MessageText, payload); err != nil {
			return
		}
	}
}

// ReadLoop drains inbound frames until the connection closes. This service
// only needs to know a client disconnected (to call Hub.Leave) — actual
// message sends arrive over the REST endpoint (internal/api), not this
// socket, so inbound frames themselves are discarded, not routed anywhere.
func (c *Client) ReadLoop(ctx context.Context) error {
	for {
		if _, _, err := c.conn.Read(ctx); err != nil {
			return err
		}
	}
}
