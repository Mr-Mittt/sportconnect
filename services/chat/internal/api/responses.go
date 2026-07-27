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
type messageBody struct {
	ID              int64     `json:"id"`
	ConversationID  int64     `json:"conversationId"`
	SenderID        string    `json:"senderId"`
	SenderFullName  string    `json:"senderFullName"`
	SenderAvatarURL string    `json:"senderAvatarUrl,omitempty"`
	Content         string    `json:"content"`
	CreatedAt       time.Time `json:"createdAt"`
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
	}
}
