package api

import (
	"time"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/conversation"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/message"
)

type conversationBody struct {
	ID              int64     `json:"id"`
	Type            string    `json:"type"`
	ExternalGroupID int64     `json:"externalGroupId,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}

func conversationResponse(c conversation.Conversation) conversationBody {
	return conversationBody{
		ID:              c.ID,
		Type:            string(c.Type),
		ExternalGroupID: c.ExternalGroupID,
		CreatedAt:       c.CreatedAt,
	}
}

// messageBody's senderFullName/senderAvatarUrl are always resolved
// server-side (internal/message.Service.withSender) — never taken from
// client input, per the rule carried over from the archived PubNub plan.
// editedAt/deletedAt (CHAT-13) are deliberately NOT omitempty, unlike
// senderAvatarUrl above — Go's encoding/json omits an omitempty *time.Time
// field entirely when nil, which decodes on the client as `undefined`, not
// `null`. The client's isDeleted/isEdited checks compare against `null`
// (matching the ChatMessage TypeScript type's `string | null`, not
// `string | null | undefined`), so an omitted field made every untouched
// message evaluate as "deleted" — found live, the hard way. These two
// fields must always be present, explicitly `null` when unset.
type messageBody struct {
	ID              int64      `json:"id"`
	ConversationID  int64      `json:"conversationId"`
	SenderID        string     `json:"senderId"`
	SenderFullName  string     `json:"senderFullName"`
	SenderAvatarURL string     `json:"senderAvatarUrl,omitempty"`
	Content         string     `json:"content"`
	CreatedAt       time.Time  `json:"createdAt"`
	EditedAt        *time.Time `json:"editedAt"`
	DeletedAt       *time.Time `json:"deletedAt"`
}

func messageResponse(m message.WithSender) messageBody {
	return messageBody{
		ID:              m.ID,
		ConversationID:  m.ConversationID,
		SenderID:        m.SenderID,
		SenderFullName:  m.SenderFullName,
		SenderAvatarURL: m.SenderAvatarURL,
		Content:         m.Content,
		CreatedAt:       m.CreatedAt,
		EditedAt:        m.EditedAt,
		DeletedAt:       m.DeletedAt,
	}
}

// wsEvent envelopes every WebSocket broadcast as of CHAT-13 — Type tells the
// client whether Message is a brand-new message to append, or an
// edit/delete to an already-rendered one to find-and-replace in place.
// Deliberately changes the wire shape every prior chat ticket (CHAT-7/8/9)
// shipped (a bare message object) — updated in lockstep with the one client
// that consumes it, in this same ticket, since nothing external depends on
// the old shape yet.
type wsEvent struct {
	Type    string      `json:"type"`
	Message messageBody `json:"message"`
}

const (
	wsEventMessageCreated = "MESSAGE_CREATED"
	wsEventMessageEdited  = "MESSAGE_EDITED"
	wsEventMessageDeleted = "MESSAGE_DELETED"
)

// typingBody is CHAT-15's payload — never persisted, only ever relayed
// through Hub.BroadcastExcept. DisplayName is resolved server-side the same
// way messageBody's SenderFullName is (never taken from client input).
type typingBody struct {
	ConversationID int64  `json:"conversationId"`
	UserID         string `json:"userId"`
	DisplayName    string `json:"displayName"`
	IsTyping       bool   `json:"isTyping"`
}

// wsTypingEvent is a sibling envelope to wsEvent, not a variant of it —
// Message and Typing carry unrelated shapes, and wsEvent's Message field is
// deliberately left alone (untouched since CHAT-13) rather than made
// polymorphic for a second event family.
type wsTypingEvent struct {
	Type   string     `json:"type"`
	Typing typingBody `json:"typing"`
}

const wsEventUserTyping = "USER_TYPING"
