// Package auth verifies the JWTs issued by the Java monolith's
// modules/auth/auth-impl (JwtTokenServiceImpl) — HS256, signed with the same
// shared secret (JWT_SECRET / app.jwt.secret). This is pure signature+expiry
// verification; it never calls back into the monolith at request time. Note
// the monolith's access-token TTL is 24h (application.yml), not the ~1h the
// archived PubNub plan assumed — group/friendship membership must therefore
// be re-checked against the local sync cache on every request (see the sync
// package), never inferred from token age alone.
package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// Claims mirrors the fields JwtTokenServiceImpl puts on an access token:
// sub (user UUID, via RegisteredClaims.Subject), email, username, roles.
type Claims struct {
	Email    string   `json:"email"`
	Username string   `json:"username"`
	Roles    []string `json:"roles"`
	jwt.RegisteredClaims
}

type contextKey struct{}

var claimsContextKey = contextKey{}

// Verifier holds the shared HMAC secret used to validate tokens.
type Verifier struct {
	secret []byte
}

func NewVerifier(secret string) *Verifier {
	return &Verifier{secret: []byte(secret)}
}

// Parse verifies signature and expiry and returns the decoded claims.
func (v *Verifier) Parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return v.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.Subject == "" {
		return nil, errors.New("token missing subject claim")
	}
	return claims, nil
}

// Middleware verifies the Authorization: Bearer <token> header and attaches
// the parsed claims to the request context for downstream handlers.
func (v *Verifier) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}

		claims, err := v.Parse(token)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), claimsContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// FromContext retrieves the verified caller identity a handler needs —
// downstream handlers call this instead of re-parsing the header.
func FromContext(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(*Claims)
	return claims, ok
}
