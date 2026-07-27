package api

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/message"
)

// TestMessageResponse_EditedAtAndDeletedAtAreExplicitNull guards against a
// real bug found live: `omitempty` on a nil *time.Time field omits the key
// from the JSON entirely, which the client decodes as `undefined` — but its
// isDeleted/isEdited checks compare against `null` (matching the TypeScript
// type `string | null`), so an omitted key made every untouched message
// render as "deleted". Struct-value assertions alone (m.EditedAt == nil)
// don't catch this class of bug — only checking the actual marshaled JSON
// does, which is what this test does that the rest of this package's tests
// don't.
func TestMessageResponse_EditedAtAndDeletedAtAreExplicitNull(t *testing.T) {
	untouched := message.WithSender{
		Message: message.Message{
			ID:             1,
			ConversationID: 7,
			SenderID:       "user-1",
			Content:        "hello",
		},
	}

	payload, err := json.Marshal(messageResponse(untouched))
	require.NoError(t, err)

	var decoded map[string]any
	require.NoError(t, json.Unmarshal(payload, &decoded))

	editedAt, hasEditedAt := decoded["editedAt"]
	assert.True(t, hasEditedAt, "editedAt key must be present even when unset")
	assert.Nil(t, editedAt, "editedAt must be explicit JSON null, not omitted")

	deletedAt, hasDeletedAt := decoded["deletedAt"]
	assert.True(t, hasDeletedAt, "deletedAt key must be present even when unset")
	assert.Nil(t, deletedAt, "deletedAt must be explicit JSON null, not omitted")
}
