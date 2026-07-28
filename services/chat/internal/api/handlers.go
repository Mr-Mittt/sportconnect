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
	h.broadcastEvent(conv.ID, wsEventMessageCreated, response)
	writeJSON(w, http.StatusCreated, response)
}

type editMessageRequest struct {
	Content string `json:"content"`
}

// editMessage is CHAT-13's replace-in-place edit: re-checks conversation
// membership (same reasoning as sendMessage — the access token's 24h TTL
// outlives a membership change), then delegates sender-only authorization
// and the actual update to internal/message.Service.Edit.
func (h *handlers) editMessage(w http.ResponseWriter, r *http.Request) {
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
	messageID, err := strconv.ParseInt(r.PathValue("messageId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid message id", http.StatusBadRequest)
		return
	}

	if _, err := h.deps.Conversations.AuthorizeByID(r.Context(), conversationID, claims.Subject); err != nil {
		writeError(w, err)
		return
	}

	var body editMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	edited, err := h.deps.Messages.Edit(r.Context(), messageID, claims.Subject, body.Content)
	if err != nil {
		writeError(w, err)
		return
	}

	response := messageResponse(edited)
	h.broadcastEvent(conversationID, wsEventMessageEdited, response)
	writeJSON(w, http.StatusOK, response)
}

// deleteMessage is CHAT-13's soft-delete: same authorization shape as
// editMessage. The response/broadcast carry the now-scrubbed content
// (internal/message.Repository.Delete already cleared it) so clients render
// the "deleted" state from deletedAt alone, never from stale content.
func (h *handlers) deleteMessage(w http.ResponseWriter, r *http.Request) {
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
	messageID, err := strconv.ParseInt(r.PathValue("messageId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid message id", http.StatusBadRequest)
		return
	}

	if _, err := h.deps.Conversations.AuthorizeByID(r.Context(), conversationID, claims.Subject); err != nil {
		writeError(w, err)
		return
	}

	deleted, err := h.deps.Messages.Delete(r.Context(), messageID, claims.Subject)
	if err != nil {
		writeError(w, err)
		return
	}

	response := messageResponse(deleted)
	h.broadcastEvent(conversationID, wsEventMessageDeleted, response)
	writeJSON(w, http.StatusOK, response)
}

// broadcastEvent marshals and fans out one wsEvent to every connection on
// conversationID — the one place all three message-broadcasting handlers
// (send/edit/delete) share, so the envelope shape can't drift between them.
func (h *handlers) broadcastEvent(conversationID int64, eventType string, message messageBody) {
	payload, err := json.Marshal(wsEvent{Type: eventType, Message: message})
	if err != nil {
		h.deps.Logger.Error("failed to marshal message for broadcast", "error", err, "type", eventType)
		return
	}
	h.deps.Hub.Broadcast(conversationID, payload)
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

type typingRequest struct {
	IsTyping bool `json:"isTyping"`
}

// typing is CHAT-15's relay: no persistence, no message.Service involvement
// — just re-checks conversation membership (same reasoning as every other
// handler here), resolves the caller's display name, and fans the signal out
// to every *other* connection on the conversation via BroadcastExcept, never
// back to the sender's own connection(s).
func (h *handlers) typing(w http.ResponseWriter, r *http.Request) {
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

	var body typingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	profiles, err := h.deps.Cache.UserProfiles(r.Context(), []string{claims.Subject})
	if err != nil {
		h.deps.Logger.Error("failed to resolve display name for typing event", "error", err)
	}

	payload, err := json.Marshal(wsTypingEvent{
		Type: wsEventUserTyping,
		Typing: typingBody{
			ConversationID: conversationID,
			UserID:         claims.Subject,
			DisplayName:    profiles[claims.Subject].FullName,
			IsTyping:       body.IsTyping,
		},
	})
	if err != nil {
		h.deps.Logger.Error("failed to marshal typing event for broadcast", "error", err)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	h.deps.Hub.BroadcastExcept(conversationID, claims.Subject, payload)

	w.WriteHeader(http.StatusNoContent)
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

	client := h.deps.Hub.Join(conversationID, claims.Subject, conn)
	defer h.deps.Hub.Leave(client)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go client.WriteLoop(ctx)

	// ReadLoop blocks until the client disconnects — this handler's job is
	// just to keep the connection (and the deferred Leave/CloseNow) alive
	// until then; inbound frames themselves are discarded (see ws.Client).
	_ = client.ReadLoop(ctx)
}
