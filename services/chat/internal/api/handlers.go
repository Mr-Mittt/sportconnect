package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/ws"
)

type handlers struct {
	deps Dependencies
}

func (h *handlers) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *handlers) openGroupConversation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}

	groupID, err := strconv.ParseInt(r.PathValue("groupId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid group id", http.StatusBadRequest)
		return
	}

	conv, err := h.deps.Conversations.OpenGroup(r.Context(), claims.Subject, groupID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, conversationResponse(conv))
}

func (h *handlers) openDirectConversation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}

	otherUserID := r.PathValue("userId")

	conv, err := h.deps.Conversations.OpenDirect(r.Context(), claims.Subject, otherUserID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, conversationResponse(conv))
}

type sendMessageRequest struct {
	Content string `json:"content"`
}

func (h *handlers) sendMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}

	conversationID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid conversation id", http.StatusBadRequest)
		return
	}

	// Re-checked here, not just at conversation-open time — the access
	// token's 24h TTL is long enough for membership/friendship to change
	// mid-session (see conversation.Service.AuthorizeByID).
	conv, err := h.deps.Conversations.AuthorizeByID(r.Context(), conversationID, claims.Subject)
	if err != nil {
		writeError(w, err)
		return
	}

	var body sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	sent, err := h.deps.Messages.Send(r.Context(), conv.ID, claims.Subject, body.Content)
	if err != nil {
		writeError(w, err)
		return
	}

	response := messageResponse(sent)
	if payload, err := json.Marshal(response); err == nil {
		h.deps.Hub.Broadcast(conv.ID, payload)
	} else {
		h.deps.Logger.Error("failed to marshal message for broadcast", "error", err)
	}

	writeJSON(w, http.StatusCreated, response)
}

func (h *handlers) messageHistory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}

	conversationID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid conversation id", http.StatusBadRequest)
		return
	}

	if _, err := h.deps.Conversations.AuthorizeByID(r.Context(), conversationID, claims.Subject); err != nil {
		writeError(w, err)
		return
	}

	var beforeID int64
	if v := r.URL.Query().Get("before"); v != "" {
		beforeID, _ = strconv.ParseInt(v, 10, 64)
	}

	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}

	items, err := h.deps.Messages.History(r.Context(), conversationID, beforeID, limit)
	if err != nil {
		writeError(w, err)
		return
	}

	responses := make([]messageBody, len(items))
	for i, item := range items {
		responses[i] = messageResponse(item)
	}
	writeJSON(w, http.StatusOK, responses)
}

func (h *handlers) connectWebSocket(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}

	conversationID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid conversation id", http.StatusBadRequest)
		return
	}

	if _, err := h.deps.Conversations.AuthorizeByID(r.Context(), conversationID, claims.Subject); err != nil {
		writeError(w, err)
		return
	}

	conn, err := ws.Accept(w, r, h.deps.AllowedOrigin)
	if err != nil {
		h.deps.Logger.Error("websocket accept failed", "error", err)
		return
	}
	defer conn.CloseNow()

	client := h.deps.Hub.Join(conversationID, conn)
	defer h.deps.Hub.Leave(client)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go client.WriteLoop(ctx)

	// ReadLoop blocks until the client disconnects — this handler's job is
	// just to keep the connection (and the deferred Leave/CloseNow) alive
	// until then; inbound frames themselves are discarded (see ws.Client).
	_ = client.ReadLoop(ctx)
}
