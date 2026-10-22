// Package authtest is a stand-in Keycloak for tests: a generated RSA key, a stub JWKS endpoint and a
// token minter. It lets the auth and API tests verify real RS256 tokens without a running Keycloak.
// Only tests import it.
package authtest

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
)

const (
	// IssuerURL and Audience are what Mint puts on a token and Config tells the verifier to expect.
	IssuerURL = "https://keycloak.test/realms/sportconnect"
	Audience  = "sportconnect-api"
)

// Issuer is the fake realm: it serves the JWKS of the keys added to it.
type Issuer struct {
	// KID and Key are the key Mint signs with by default.
	KID string
	Key *rsa.PrivateKey

	server  *httptest.Server
	fetches atomic.Int32
	down    atomic.Bool

	mu   sync.Mutex
	keys map[string]*rsa.PrivateKey
}

// New starts the stub JWKS server (closed when the test ends) with one signing key.
func New(t *testing.T) *Issuer {
	t.Helper()
	i := &Issuer{keys: map[string]*rsa.PrivateKey{}}
	i.KID, i.Key = i.AddKey(t)
	i.server = httptest.NewServer(http.HandlerFunc(i.serveJWKS))
	t.Cleanup(i.server.Close)
	return i
}

// Config is the verifier config that accepts this issuer's tokens.
func (i *Issuer) Config() auth.Config {
	return auth.Config{Issuer: IssuerURL, JWKSURL: i.server.URL, Audience: Audience}
}

// Verifier is a verifier for this issuer.
func (i *Issuer) Verifier() *auth.Verifier { return auth.NewVerifier(i.Config()) }

// AddKey generates another key and publishes it in the JWKS (a Keycloak key rotation). Mint keeps
// signing with the original key; use Sign to sign with the new one.
func (i *Issuer) AddKey(t *testing.T) (string, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	kid := "kid-" + base64.RawURLEncoding.EncodeToString(key.N.Bytes()[:6])
	i.mu.Lock()
	i.keys[kid] = key
	i.mu.Unlock()
	return kid, key
}

// RemoveKey drops a key from the JWKS (a rotated-out key).
func (i *Issuer) RemoveKey(kid string) {
	i.mu.Lock()
	delete(i.keys, kid)
	i.mu.Unlock()
}

// SetDown makes the JWKS endpoint answer 500, like a Keycloak outage.
func (i *Issuer) SetDown(down bool) { i.down.Store(down) }

// Fetches counts the JWKS requests served so far.
func (i *Issuer) Fetches() int { return int(i.fetches.Load()) }

// Claims returns valid claims for subject: this issuer, the expected audience, an hour of life.
func (i *Issuer) Claims(subject string) jwt.MapClaims {
	return jwt.MapClaims{
		"iss": IssuerURL,
		"aud": []string{Audience},
		"sub": subject,
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
}

// Mint signs valid claims for subject with the default key.
func (i *Issuer) Mint(t *testing.T, subject string) string {
	t.Helper()
	return i.Sign(t, i.Claims(subject), i.KID, i.Key)
}

// Sign signs arbitrary claims with the given key, naming kid in the header.
func (i *Issuer) Sign(t *testing.T, claims jwt.MapClaims, kid string, key *rsa.PrivateKey) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	require.NoError(t, err)
	return signed
}

func (i *Issuer) serveJWKS(w http.ResponseWriter, _ *http.Request) {
	i.fetches.Add(1)
	if i.down.Load() {
		http.Error(w, "down", http.StatusInternalServerError)
		return
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	type jwk struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Alg string `json:"alg"`
		Use string `json:"use"`
		N   string `json:"n"`
		E   string `json:"e"`
	}
	doc := struct {
		Keys []jwk `json:"keys"`
	}{}
	for kid, key := range i.keys {
		doc.Keys = append(doc.Keys, jwk{
			Kid: kid, Kty: "RSA", Alg: "RS256", Use: "sig",
			N: base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			E: base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(doc)
}
