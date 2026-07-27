// Package platform holds small cross-cutting concerns (logging, error types,
// request-id propagation) shared by every other internal package. It has no
// dependency on any other internal package, deliberately — everything else
// may depend on platform, platform depends on nothing chat-specific.
package platform

import (
	"context"
	"log/slog"
	"net/http"
	"os"
)

// NewLogger returns the process-wide structured logger, JSON-formatted so log
// output is easy to ship to whatever log aggregation the single EC2 box ends
// up using, matching the "cost/ops-conscious" posture the rest of this repo's
// infra decisions already take.
func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}

// AppError is the shape every HTTP handler should return instead of a bare
// error, so the API layer can map it to a consistent JSON error body and
// status code without each handler duplicating that logic.
type AppError struct {
	Status  int
	Code    string
	Message string
	Err     error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

func Forbidden(message string) *AppError {
	return &AppError{Status: http.StatusForbidden, Code: "forbidden", Message: message}
}

func NotFound(message string) *AppError {
	return &AppError{Status: http.StatusNotFound, Code: "not_found", Message: message}
}

func BadRequest(message string) *AppError {
	return &AppError{Status: http.StatusBadRequest, Code: "bad_request", Message: message}
}

func Internal(err error) *AppError {
	return &AppError{Status: http.StatusInternalServerError, Code: "internal_error", Message: "internal error", Err: err}
}

// requestIDKey is unexported so only this package can set/read it on a
// context, the same "compiler-enforced boundary" reasoning CLAUDE.md's
// -api/-impl split relies on at the Java layer.
type requestIDKey struct{}

func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}
