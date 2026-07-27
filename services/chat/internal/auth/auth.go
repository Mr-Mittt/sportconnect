// Package auth verifies the JWTs issued by the Java monolith's
// modules/auth/auth-impl (JwtTokenServiceImpl), signed with the same shared
// secret (JWT_SECRET / app.jwt.secret). This is pure signature+expiry
// verification; it never calls back into the monolith at request time. Note
// the monolith's access-token TTL is 24h (application.yml), not the ~1h the
// archived PubNub plan assumed — group/friendship membership must therefore
// be re-checked against the local sync cache on every request (see the sync
// package), never inferred from token age alone.
//
// Accepted algorithms: HS256, HS384, and HS512 — not just HS256. JJWT 0.12.x's
// Jwts.builder().signWith(key) (JwtTokenServiceImpl's call site) picks the
// strongest HMAC-SHA variant the *key's own byte length* supports, not a
// fixed algorithm; the dev secret is long enough that this actually produces
// HS512 tokens today (confirmed against a real running monolith at CHAT-7
// pickup — every real token was being rejected before this was widened, only
// this package's own tests, which always mint HS256 tokens themselves,
// masked it). All three share the same underlying secret bytes, so verifying
// any of them is equally safe; only the allowlist needed widening.
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
	}, jwt.WithValidMethods([]string{"HS256", "HS384", "HS512"}))
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
	return v.middleware(next, false)
}

// MiddlewareWS behaves like Middleware but additionally accepts the token via
// a "token" query parameter, checked only when the Authorization header is
// absent. This exists solely for GET /conversations/{id}/ws: a browser's
// native WebSocket API cannot set custom request headers during the
// handshake, so the header-only check every other route uses is unreachable
// from a real client on this one route. Deliberately not folded into the
// plain Middleware above — REST routes have no reason to ever accept a token
// in a query string (every other client can set a header), so this fallback
// stays scoped to the one route that genuinely needs it (least privilege).
func (v *Verifier) MiddlewareWS(next http.Handler) http.Handler {
	return v.middleware(next, true)
}

func (v *Verifier) middleware(next http.Handler, allowQueryToken bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r.Header.Get("Authorization"))
		if token == "" && allowQueryToken {
			token = r.URL.Query().Get("token")
		}
		if token == "" {
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

func bearerToken(header string) string {
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok {
		return ""
	}
	return token
}

// FromContext retrieves the verified caller identity a handler needs —
// downstream handlers call this instead of re-parsing the header.
func FromContext(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(*Claims)
	return claims, ok
}
