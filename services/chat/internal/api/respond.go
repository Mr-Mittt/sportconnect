package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/conversation"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/message"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type errorBody struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// writeError maps a domain error to the HTTP response the client should see
// — the only place in this package that knows about these specific error
// values, so handlers themselves stay free of status-code decisions.
func writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, conversation.ErrNotAMember), errors.Is(err, conversation.ErrNotFriends):
		writeJSON(w, http.StatusForbidden, errorBody{Error: "forbidden", Message: err.Error()})
	case errors.Is(err, message.ErrEmptyContent), errors.Is(err, message.ErrContentTooLong):
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "bad_request", Message: err.Error()})
	default:
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "internal_error", Message: "internal error"})
	}
}
