package api

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// CHAT-18: every conversation-scoped route goes through AuthorizeByID, and a conversation id with no
// row used to end in a 500. It must answer 403, the same as "exists but you are not in it", so the
// answer does not tell a caller which ids exist.
func TestConversationRoutes_UnknownConversationIsForbidden(t *testing.T) {
	server, issuer, _ := newTestRouterServer(t)
	const unknown = "987654321"

	routes := []struct {
		method, path, body string
	}{
		{http.MethodGet, "/conversations/" + unknown + "/messages", ""},
		{http.MethodPost, "/conversations/" + unknown + "/messages", `{"content":"hello"}`},
		{http.MethodPatch, "/conversations/" + unknown + "/messages/1", `{"content":"edited"}`},
		{http.MethodDelete, "/conversations/" + unknown + "/messages/1", ""},
		{http.MethodPost, "/conversations/" + unknown + "/typing", `{"isTyping":true}`},
		{http.MethodGet, "/conversations/" + unknown + "/ws", ""},
	}

	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			req, err := http.NewRequest(rt.method, server.URL+rt.path, strings.NewReader(rt.body))
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer "+issuer.Mint(t, wsUserID))
			req.Header.Set("Content-Type", "application/json")

			resp, err := http.DefaultClient.Do(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		})
	}
}
