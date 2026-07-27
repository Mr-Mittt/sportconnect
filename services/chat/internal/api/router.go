// Package api is the HTTP/WebSocket surface the client talks to directly
// (per the routing decision in the structural plan — no Spring gateway in
// front of this). It only ever calls into internal/conversation and
// internal/message for business logic; every handler here is thin.
package api

import (
	"log/slog"
	"net/http"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/conversation"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/message"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/ws"
)

// Dependencies are wired up once in cmd/chat/main.go and passed in here —
// no package-level globals, so tests can construct a router against fakes.
type Dependencies struct {
	Verifier      *auth.Verifier
	Conversations *conversation.Service
	Messages      *message.Service
	Hub           *ws.Hub
	AllowedOrigin string
	Logger        *slog.Logger
}

func NewRouter(deps Dependencies) http.Handler {
	mux := http.NewServeMux()
	h := &handlers{deps: deps}

	mux.HandleFunc("GET /healthz", h.health)

	// The "open" segment on these two routes is not decorative — Go 1.22+'s ServeMux rejects
	// (at startup, not at request time) any two patterns of the same method and same segment
	// count where a wildcard and a literal occupy crossed positions, since some concrete request
	// path could satisfy both and neither is more specific. "POST /conversations/group/{groupId}"
	// (3 segments) and "POST /conversations/{id}/messages" (3 segments) are exactly that case —
	// e.g. "/conversations/group/messages" matches both. Nesting the open-conversation routes
	// under a 4th segment sidesteps this entirely: patterns of different lengths can never match
	// the same concrete path, so there is no ambiguity left to resolve.
	mux.Handle("POST /conversations/open/group/{groupId}", deps.Verifier.Middleware(http.HandlerFunc(h.openGroupConversation)))
	mux.Handle("POST /conversations/open/direct/{userId}", deps.Verifier.Middleware(http.HandlerFunc(h.openDirectConversation)))
	mux.Handle("GET /conversations/{id}/messages", deps.Verifier.Middleware(http.HandlerFunc(h.messageHistory)))
	mux.Handle("POST /conversations/{id}/messages", deps.Verifier.Middleware(http.HandlerFunc(h.sendMessage)))
	mux.Handle("GET /conversations/{id}/ws", deps.Verifier.MiddlewareWS(http.HandlerFunc(h.connectWebSocket)))

	return corsMiddleware(deps.AllowedOrigin, mux)
}

// corsMiddleware mirrors Spring's own SecurityConfig CORS posture
// (localhost:5173 in dev) — this service needs its own copy since the
// client reaches it directly, not through Spring.
func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
