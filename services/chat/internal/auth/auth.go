// Package auth verifies the access tokens Keycloak issues (A25/A26 on the monolith side): RS256,
// signed with a key published in the realm's JWKS. Verification is local: the keys are fetched once,
// cached by `kid`, and refetched only when a token names a `kid` that is not cached, so a request
// never waits on Keycloak in the normal case and this service never calls the monolith to check a
// token.
//
// The service consumes only `sub` (the user's UUID, the same id as users.id in the monolith). Nothing
// else on the token is read: roles, username and email are not used for authorization here, which
// comes from the local sync cache (see the sync package).
//
// A deactivated user's token keeps working here until it expires: Keycloak access tokens last 5
// minutes, and the service authorizes from its cache by design instead of rechecking is_active on
// every request. That is the accepted answer to A20 for chat (CHAT-17); syncing is_active into the
// cache would be a separate decision.
//
// Accepted algorithm: RS256 only. HS256 tokens (the pre-Keycloak shared-secret scheme) and "none" are
// refused, which is also what stops a token signed with a public key used as an HMAC secret.
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	defaultMinRefetchInterval = 30 * time.Second
	defaultFetchTimeout       = 10 * time.Second
	maxJWKSBytes              = 1 << 20
)

// Config says which tokens a Verifier accepts and where their keys live.
type Config struct {
	// Issuer is the exact `iss` the tokens carry, e.g. http://localhost:8081/realms/sportconnect.
	Issuer string
	// JWKSURL is the realm's certs endpoint, e.g. <issuer>/protocol/openid-connect/certs.
	JWKSURL string
	// Audience must appear in the token's `aud` (the realm client adds sportconnect-api).
	Audience string

	// MinRefetchInterval bounds how often an unknown `kid` may trigger a JWKS fetch, so a stream of
	// bogus tokens cannot turn this service into a load generator against Keycloak. Zero means 30 s.
	MinRefetchInterval time.Duration
	// HTTPClient fetches the JWKS. Nil means a client with a 10 s timeout.
	HTTPClient *http.Client
	// Now is the clock for token expiry and the refetch limit. Nil means time.Now.
	Now func() time.Time
}

// Claims is what a verified token yields: the registered claims, of which only Subject is used.
type Claims struct {
	jwt.RegisteredClaims
}

type contextKey struct{}

var claimsContextKey = contextKey{}

// Verifier validates Keycloak access tokens against the realm's JWKS.
type Verifier struct {
	cfg Config

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	lastFetch time.Time

	// fetchMu serialises refetches so a burst of requests with a new `kid` causes one fetch, not many.
	fetchMu sync.Mutex
}

// NewVerifier builds a verifier. It does not contact Keycloak: the keys are fetched on the first token,
// so the service starts even when Keycloak is not up yet.
func NewVerifier(cfg Config) *Verifier {
	if cfg.MinRefetchInterval <= 0 {
		cfg.MinRefetchInterval = defaultMinRefetchInterval
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: defaultFetchTimeout}
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Verifier{cfg: cfg, keys: map[string]*rsa.PublicKey{}}
}

// Parse verifies signature, expiry, issuer and audience and returns the decoded claims.
func (v *Verifier) Parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, v.keyFor,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.cfg.Issuer),
		jwt.WithAudience(v.cfg.Audience),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(v.cfg.Now),
	)
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

// keyFor is the jwt key function: the cached key for the token's `kid`, refetching the JWKS once when
// the `kid` is unknown (Keycloak rotated its key) unless one was fetched within MinRefetchInterval.
func (v *Verifier) keyFor(t *jwt.Token) (interface{}, error) {
	kid, _ := t.Header["kid"].(string)
	if kid == "" {
		return nil, errors.New("token has no kid header")
	}
	if key := v.cachedKey(kid); key != nil {
		return key, nil
	}

	v.fetchMu.Lock()
	defer v.fetchMu.Unlock()
	// Another request may have refreshed while this one waited for the lock.
	if key := v.cachedKey(kid); key != nil {
		return key, nil
	}
	v.mu.RLock()
	last := v.lastFetch
	v.mu.RUnlock()
	if !last.IsZero() && v.cfg.Now().Sub(last) < v.cfg.MinRefetchInterval {
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	// Set before the fetch, success or not, so a Keycloak outage is also retried at most once per interval.
	v.mu.Lock()
	v.lastFetch = v.cfg.Now()
	v.mu.Unlock()

	fresh, err := v.fetchKeys()
	if err != nil {
		// Keep serving the keys already cached; only an unknown kid is refused.
		return nil, fmt.Errorf("unknown signing key %q (jwks refresh failed: %w)", kid, err)
	}
	v.mu.Lock()
	v.keys = fresh
	v.mu.Unlock()
	if key := fresh[kid]; key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("unknown signing key %q", kid)
}

func (v *Verifier) cachedKey(kid string) *rsa.PublicKey {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.keys[kid]
}

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (v *Verifier) fetchKeys() (map[string]*rsa.PublicKey, error) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.cfg.JWKSURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks endpoint answered %d", resp.StatusCode)
	}
	var doc struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxJWKSBytes)).Decode(&doc); err != nil {
		return nil, fmt.Errorf("jwks is not valid json: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(doc.Keys))
	for _, k := range doc.Keys {
		// Only RSA signature keys; Keycloak also lists an encryption key (use=enc) in some realms.
		if k.Kty != "RSA" || k.Kid == "" || (k.Use != "" && k.Use != "sig") || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		pub, err := k.rsaKey()
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return nil, errors.New("jwks holds no usable RS256 key")
	}
	return keys, nil
}

func (k jwk) rsaKey() (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, err
	}
	e := new(big.Int).SetBytes(eBytes)
	if !e.IsInt64() || e.Int64() < 3 || e.Int64() > 1<<31-1 {
		return nil, errors.New("unusable rsa exponent")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: int(e.Int64())}, nil
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
