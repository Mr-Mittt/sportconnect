package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-secret"

func mintToken(t *testing.T, subject string) string {
	t.Helper()
	return mintTokenWithMethod(t, subject, jwt.SigningMethodHS256)
}

func mintTokenWithMethod(t *testing.T, subject string, method jwt.SigningMethod) string {
	t.Helper()
	claims := Claims{
		Username: "testuser",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subject,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	signed, err := jwt.NewWithClaims(method, claims).SignedString([]byte(testSecret))
	require.NoError(t, err)
	return signed
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := FromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		w.Header().Set("X-Subject", claims.Subject)
		w.WriteHeader(http.StatusOK)
	})
}

func TestMiddleware_AcceptsValidBearerHeader(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/whatever", nil)
	req.Header.Set("Authorization", "Bearer "+mintToken(t, "user-1"))
	rec := httptest.NewRecorder()

	v.Middleware(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-1", rec.Header().Get("X-Subject"))
}

func TestMiddleware_RejectsMissingHeader(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/whatever", nil)
	rec := httptest.NewRecorder()

	v.Middleware(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_IgnoresQueryToken(t *testing.T) {
	// The plain (non-WS) Middleware must never fall back to a query-param
	// token — only MiddlewareWS opts into that, scoped to the one route a
	// browser WebSocket handshake can't attach a header to.
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/whatever?token="+mintToken(t, "user-1"), nil)
	rec := httptest.NewRecorder()

	v.Middleware(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddlewareWS_AcceptsBearerHeader(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/conversations/1/ws", nil)
	req.Header.Set("Authorization", "Bearer "+mintToken(t, "user-1"))
	rec := httptest.NewRecorder()

	v.MiddlewareWS(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-1", rec.Header().Get("X-Subject"))
}

func TestMiddlewareWS_AcceptsQueryToken(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/conversations/1/ws?token="+mintToken(t, "user-2"), nil)
	rec := httptest.NewRecorder()

	v.MiddlewareWS(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-2", rec.Header().Get("X-Subject"))
}

func TestMiddlewareWS_HeaderTakesPrecedenceOverQueryToken(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/conversations/1/ws?token=garbage-not-a-jwt", nil)
	req.Header.Set("Authorization", "Bearer "+mintToken(t, "user-1"))
	rec := httptest.NewRecorder()

	v.MiddlewareWS(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-1", rec.Header().Get("X-Subject"))
}

func TestMiddlewareWS_RejectsMissingTokenEntirely(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/conversations/1/ws", nil)
	rec := httptest.NewRecorder()

	v.MiddlewareWS(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_AcceptsHS384AndHS512Tokens(t *testing.T) {
	// JJWT 0.12.x's Jwts.builder().signWith(key) (the monolith's own call
	// site, JwtTokenServiceImpl) auto-selects the strongest HMAC-SHA variant
	// the key's byte length supports — this is not hypothetical: the actual
	// dev JWT_SECRET is long enough to produce real HS512 tokens today
	// (confirmed against a running monolith at CHAT-7 pickup). A verifier
	// that only accepts HS256 rejects every one of those.
	for _, method := range []jwt.SigningMethod{jwt.SigningMethodHS256, jwt.SigningMethodHS384, jwt.SigningMethodHS512} {
		t.Run(method.Alg(), func(t *testing.T) {
			v := NewVerifier(testSecret)
			req := httptest.NewRequest(http.MethodGet, "/whatever", nil)
			req.Header.Set("Authorization", "Bearer "+mintTokenWithMethod(t, "user-1", method))
			rec := httptest.NewRecorder()

			v.Middleware(okHandler()).ServeHTTP(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, "user-1", rec.Header().Get("X-Subject"))
		})
	}
}

func TestMiddlewareWS_RejectsInvalidQueryToken(t *testing.T) {
	v := NewVerifier(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/conversations/1/ws?token=not-a-real-jwt", nil)
	rec := httptest.NewRecorder()

	v.MiddlewareWS(okHandler()).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}
