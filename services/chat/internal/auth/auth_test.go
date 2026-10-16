package auth_test

import (
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth/authtest"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.FromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		w.Header().Set("X-Subject", claims.Subject)
		w.WriteHeader(http.StatusOK)
	})
}

func serve(v *auth.Verifier, h func(http.Handler) http.Handler, target, bearer string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rec := httptest.NewRecorder()
	h(okHandler()).ServeHTTP(rec, req)
	return rec
}

// --- middleware ---

func TestMiddleware_AcceptsValidBearerHeader(t *testing.T) {
	iss := authtest.New(t)
	v := iss.Verifier()

	rec := serve(v, v.Middleware, "/whatever", iss.Mint(t, "user-1"))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-1", rec.Header().Get("X-Subject"))
}

func TestMiddleware_RejectsMissingHeader(t *testing.T) {
	v := authtest.New(t).Verifier()

	rec := serve(v, v.Middleware, "/whatever", "")

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_IgnoresQueryToken(t *testing.T) {
	// The plain (non-WS) Middleware must never fall back to a query-param token: only
	// MiddlewareWS opts into that, scoped to the one route a browser WebSocket handshake can't
	// attach a header to.
	iss := authtest.New(t)
	v := iss.Verifier()

	rec := serve(v, v.Middleware, "/whatever?token="+iss.Mint(t, "user-1"), "")

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddlewareWS_AcceptsQueryToken(t *testing.T) {
	iss := authtest.New(t)
	v := iss.Verifier()

	rec := serve(v, v.MiddlewareWS, "/conversations/1/ws?token="+iss.Mint(t, "user-2"), "")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-2", rec.Header().Get("X-Subject"))
}

func TestMiddlewareWS_HeaderTakesPrecedenceOverQueryToken(t *testing.T) {
	iss := authtest.New(t)
	v := iss.Verifier()

	rec := serve(v, v.MiddlewareWS, "/conversations/1/ws?token=garbage-not-a-jwt", iss.Mint(t, "user-1"))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-1", rec.Header().Get("X-Subject"))
}

func TestMiddlewareWS_RejectsMissingTokenEntirely(t *testing.T) {
	v := authtest.New(t).Verifier()

	rec := serve(v, v.MiddlewareWS, "/conversations/1/ws", "")

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddlewareWS_RejectsInvalidQueryToken(t *testing.T) {
	v := authtest.New(t).Verifier()

	rec := serve(v, v.MiddlewareWS, "/conversations/1/ws?token=not-a-real-jwt", "")

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// --- token checks ---

func TestParse_AcceptsValidToken(t *testing.T) {
	iss := authtest.New(t)

	claims, err := iss.Verifier().Parse(iss.Mint(t, "11111111-1111-1111-1111-111111111111"))

	require.NoError(t, err)
	assert.Equal(t, "11111111-1111-1111-1111-111111111111", claims.Subject)
}

func TestParse_Rejects(t *testing.T) {
	iss := authtest.New(t)
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	mutate := func(f func(c jwt.MapClaims)) string {
		c := iss.Claims("user-1")
		f(c)
		return iss.Sign(t, c, iss.KID, iss.Key)
	}

	cases := map[string]string{
		"expired":        mutate(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Minute).Unix() }),
		"no expiry":      mutate(func(c jwt.MapClaims) { delete(c, "exp") }),
		"wrong issuer":   mutate(func(c jwt.MapClaims) { c["iss"] = "https://evil.test/realms/sportconnect" }),
		"wrong audience": mutate(func(c jwt.MapClaims) { c["aud"] = []string{"account"} }),
		"no audience":    mutate(func(c jwt.MapClaims) { delete(c, "aud") }),
		"no subject":     mutate(func(c jwt.MapClaims) { delete(c, "sub") }),
		"signed by an unrelated key under a known kid": iss.Sign(t, iss.Claims("user-1"), iss.KID, otherKey),
		"unknown kid": iss.Sign(t, iss.Claims("user-1"), "no-such-kid", iss.Key),
		"garbage":     "not.a.jwt",
	}

	// HS256 token signed with the public key bytes as the secret, and an unsigned token.
	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, iss.Claims("user-1"))
	hs.Header["kid"] = iss.KID
	hsSigned, err := hs.SignedString([]byte("shared-secret"))
	require.NoError(t, err)
	cases["HS256"] = hsSigned

	none := jwt.NewWithClaims(jwt.SigningMethodNone, iss.Claims("user-1"))
	none.Header["kid"] = iss.KID
	noneSigned, err := none.SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)
	cases["alg none"] = noneSigned

	noKid := jwt.NewWithClaims(jwt.SigningMethodRS256, iss.Claims("user-1"))
	noKidSigned, err := noKid.SignedString(iss.Key)
	require.NoError(t, err)
	cases["no kid header"] = noKidSigned

	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := iss.Verifier().Parse(token)
			assert.Error(t, err)
		})
	}
}

// --- key cache ---

func TestKeys_FetchedOnceThenServedFromCache(t *testing.T) {
	iss := authtest.New(t)
	v := iss.Verifier()

	for i := 0; i < 5; i++ {
		_, err := v.Parse(iss.Mint(t, "user-1"))
		require.NoError(t, err)
	}

	assert.Equal(t, 1, iss.Fetches())
}

func TestKeys_NoFetchAtStartup(t *testing.T) {
	iss := authtest.New(t)
	iss.Verifier()

	assert.Equal(t, 0, iss.Fetches(), "building the verifier must not need Keycloak to be up")
}

type clock struct{ now time.Time }

func (c *clock) Now() time.Time { return c.now }

func TestKeys_RotatedKeyIsPickedUpOnUnknownKid(t *testing.T) {
	iss := authtest.New(t)
	clk := &clock{now: time.Now()}
	cfg := iss.Config()
	cfg.Now = clk.Now
	v := auth.NewVerifier(cfg)
	_, err := v.Parse(iss.Mint(t, "user-1"))
	require.NoError(t, err)

	newKid, newKey := iss.AddKey(t)
	token := iss.Sign(t, iss.Claims("user-2"), newKid, newKey)

	// Inside the rate-limit window the refetch is refused ...
	_, err = v.Parse(token)
	require.Error(t, err)
	assert.Equal(t, 1, iss.Fetches())

	// ... and once the window has passed the new kid triggers a refetch and verifies.
	clk.now = clk.now.Add(31 * time.Second)
	claims, err := v.Parse(token)
	require.NoError(t, err)
	assert.Equal(t, "user-2", claims.Subject)
	assert.Equal(t, 2, iss.Fetches())
}

func TestKeys_UnknownKidRefetchIsRateLimited(t *testing.T) {
	iss := authtest.New(t)
	clk := &clock{now: time.Now()}
	cfg := iss.Config()
	cfg.Now = clk.Now
	v := auth.NewVerifier(cfg)

	for i := 0; i < 20; i++ {
		_, err := v.Parse(iss.Sign(t, iss.Claims("user-1"), "bogus", iss.Key))
		require.Error(t, err)
	}

	assert.Equal(t, 1, iss.Fetches(), "twenty bogus kids within one interval must cost one JWKS fetch")
}

func TestKeys_OutageKeepsCachedKeysWorking(t *testing.T) {
	iss := authtest.New(t)
	clk := &clock{now: time.Now()}
	cfg := iss.Config()
	cfg.Now = clk.Now
	v := auth.NewVerifier(cfg)
	_, err := v.Parse(iss.Mint(t, "user-1"))
	require.NoError(t, err)

	iss.SetDown(true)
	clk.now = clk.now.Add(time.Minute)

	// A token for a cached key never needs Keycloak.
	_, err = v.Parse(iss.Mint(t, "user-1"))
	require.NoError(t, err)
	// An unknown kid triggers a refetch that fails; the answer is a rejection, not a crash, and the
	// cached key still works afterwards.
	_, err = v.Parse(iss.Sign(t, iss.Claims("user-1"), "bogus", iss.Key))
	require.Error(t, err)
	_, err = v.Parse(iss.Mint(t, "user-1"))
	require.NoError(t, err)
}

func TestKeys_OutageAtFirstUseRecoversAfterTheInterval(t *testing.T) {
	iss := authtest.New(t)
	iss.SetDown(true)
	clk := &clock{now: time.Now()}
	cfg := iss.Config()
	cfg.Now = clk.Now
	v := auth.NewVerifier(cfg)

	_, err := v.Parse(iss.Mint(t, "user-1"))
	require.Error(t, err)

	iss.SetDown(false)
	clk.now = clk.now.Add(31 * time.Second)
	_, err = v.Parse(iss.Mint(t, "user-1"))
	require.NoError(t, err)
}

func TestKeys_RotatedOutKeyIsRefusedAfterARefresh(t *testing.T) {
	iss := authtest.New(t)
	clk := &clock{now: time.Now()}
	cfg := iss.Config()
	cfg.Now = clk.Now
	v := auth.NewVerifier(cfg)
	oldToken := iss.Mint(t, "user-1")
	_, err := v.Parse(oldToken)
	require.NoError(t, err)

	newKid, newKey := iss.AddKey(t)
	iss.RemoveKey(iss.KID)
	clk.now = clk.now.Add(31 * time.Second)
	_, err = v.Parse(iss.Sign(t, iss.Claims("user-2"), newKid, newKey)) // refresh happens here
	require.NoError(t, err)

	_, err = v.Parse(oldToken)
	assert.Error(t, err, "a key Keycloak no longer publishes must stop verifying once the cache has refreshed")
}
